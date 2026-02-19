// JSON Query Engine — 플랫폼 핵심 도구 #1
// JSONPath 유사 문법으로 JSON 데이터에서 값을 추출/필터/집계
//
// 지원 문법:
//   경로 접근:     "users[0].name"
//   배열 순회:     "users[*].name"
//   필터:         "users[?age > 27]"
//   필터+추출:     "users[?age > 27].name"
//   파이프 집계:   "users[*].score | sum"
//   슬라이스:      "users[0:2]"
//   중첩:         "data.teams[*].members[?role == 'lead'].name"

use serde_json::Value;

// ─────────────────────────────────────────────
// 토큰 파서
// ─────────────────────────────────────────────

#[derive(Debug, Clone)]
enum Segment {
    Key(String),           // .name
    Index(i64),            // [0], [-1]
    Wildcard,              // [*]
    Slice(Option<i64>, Option<i64>), // [0:2], [:3], [1:]
    Filter(FilterExpr),    // [?age > 27]
}

#[derive(Debug, Clone)]
enum FilterOp {
    Eq,    // ==
    Ne,    // !=
    Gt,    // >
    Gte,   // >=
    Lt,    // <
    Lte,   // <=
    Contains, // contains
}

#[derive(Debug, Clone)]
struct FilterExpr {
    field: String,
    op: FilterOp,
    value: FilterValue,
}

#[derive(Debug, Clone)]
enum FilterValue {
    Str(String),
    Num(f64),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone)]
enum PipeOp {
    Sum,
    Avg,
    Min,
    Max,
    Count,
    Flatten,
    Unique,
    Reverse,
    Keys,
    Values,
    First,
    Last,
    SortBy(String),
    Length,
}

fn parse_pipe_ops(pipe_str: &str) -> Result<Vec<PipeOp>, String> {
    let mut ops = Vec::new();
    for part in pipe_str.split('|') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let op = if trimmed.starts_with("sort_by(") && trimmed.ends_with(')') {
            let inner = &trimmed[8..trimmed.len() - 1].trim();
            let field = inner.trim_start_matches('.').to_string();
            PipeOp::SortBy(field)
        } else {
            match trimmed {
                "sum" => PipeOp::Sum,
                "avg" | "average" => PipeOp::Avg,
                "min" => PipeOp::Min,
                "max" => PipeOp::Max,
                "count" | "length" | "len" => PipeOp::Count,
                "flatten" | "flat" => PipeOp::Flatten,
                "unique" | "uniq" => PipeOp::Unique,
                "reverse" | "rev" => PipeOp::Reverse,
                "keys" => PipeOp::Keys,
                "values" => PipeOp::Values,
                "first" => PipeOp::First,
                "last" => PipeOp::Last,
                _ => return Err(format!("알 수 없는 파이프 연산: {}", trimmed)),
            }
        };
        ops.push(op);
    }
    Ok(ops)
}

fn parse_filter(expr: &str) -> Result<FilterExpr, String> {
    let expr = expr.trim();

    // "field contains value" 패턴
    if let Some(idx) = expr.find(" contains ") {
        let field = expr[..idx].trim().to_string();
        let val_str = expr[idx + 10..].trim();
        return Ok(FilterExpr {
            field,
            op: FilterOp::Contains,
            value: parse_filter_value(val_str),
        });
    }

    // 연산자 파싱 (긴 것부터 체크)
    let ops = [("!=", FilterOp::Ne), (">=", FilterOp::Gte), ("<=", FilterOp::Lte),
               ("==", FilterOp::Eq), (">", FilterOp::Gt), ("<", FilterOp::Lt)];

    for (op_str, op) in &ops {
        if let Some(idx) = expr.find(op_str) {
            let field = expr[..idx].trim().to_string();
            let val_str = expr[idx + op_str.len()..].trim();
            return Ok(FilterExpr {
                field,
                op: op.clone(),
                value: parse_filter_value(val_str),
            });
        }
    }

    Err(format!("필터 표현식 파싱 실패: {}", expr))
}

fn parse_filter_value(s: &str) -> FilterValue {
    let s = s.trim();
    // 문자열 (따옴표로 감싼)
    if (s.starts_with('\'') && s.ends_with('\'')) || (s.starts_with('"') && s.ends_with('"')) {
        return FilterValue::Str(s[1..s.len() - 1].to_string());
    }
    // null
    if s == "null" || s == "nil" {
        return FilterValue::Null;
    }
    // 불리언
    if s == "true" {
        return FilterValue::Bool(true);
    }
    if s == "false" {
        return FilterValue::Bool(false);
    }
    // 숫자
    if let Ok(n) = s.parse::<f64>() {
        return FilterValue::Num(n);
    }
    // 폴백: 문자열
    FilterValue::Str(s.to_string())
}

fn parse_segments(query: &str) -> Result<Vec<Segment>, String> {
    let mut segments = Vec::new();
    let mut chars = query.chars().peekable();
    let mut current_key = String::new();

    while let Some(&ch) = chars.peek() {
        match ch {
            '.' => {
                if !current_key.is_empty() {
                    segments.push(Segment::Key(current_key.clone()));
                    current_key.clear();
                }
                chars.next();
            }
            '[' => {
                if !current_key.is_empty() {
                    segments.push(Segment::Key(current_key.clone()));
                    current_key.clear();
                }
                chars.next(); // consume '['

                let mut bracket_content = String::new();
                let mut depth = 1;
                while let Some(&c) = chars.peek() {
                    if c == '[' {
                        depth += 1;
                    }
                    if c == ']' {
                        depth -= 1;
                        if depth == 0 {
                            chars.next();
                            break;
                        }
                    }
                    bracket_content.push(c);
                    chars.next();
                }

                let content = bracket_content.trim();

                if content == "*" {
                    segments.push(Segment::Wildcard);
                } else if content.starts_with('?') {
                    // 필터: [?age > 27]
                    let filter = parse_filter(&content[1..])?;
                    segments.push(Segment::Filter(filter));
                } else if content.contains(':') {
                    // 슬라이스: [0:2], [:3], [1:]
                    let parts: Vec<&str> = content.splitn(2, ':').collect();
                    let start = if parts[0].trim().is_empty() {
                        None
                    } else {
                        Some(parts[0].trim().parse::<i64>().map_err(|_| format!("잘못된 슬라이스 시작: {}", parts[0]))?)
                    };
                    let end = if parts.len() < 2 || parts[1].trim().is_empty() {
                        None
                    } else {
                        Some(parts[1].trim().parse::<i64>().map_err(|_| format!("잘못된 슬라이스 끝: {}", parts[1]))?)
                    };
                    segments.push(Segment::Slice(start, end));
                } else if let Ok(idx) = content.parse::<i64>() {
                    segments.push(Segment::Index(idx));
                } else {
                    // 키로 취급 (따옴표 제거)
                    let key = content.trim_matches('\'').trim_matches('"');
                    segments.push(Segment::Key(key.to_string()));
                }
            }
            _ => {
                current_key.push(ch);
                chars.next();
            }
        }
    }

    if !current_key.is_empty() {
        segments.push(Segment::Key(current_key));
    }

    Ok(segments)
}

// ─────────────────────────────────────────────
// 평가기
// ─────────────────────────────────────────────

fn evaluate_segments(data: &Value, segments: &[Segment]) -> Value {
    if segments.is_empty() {
        return data.clone();
    }

    let segment = &segments[0];
    let rest = &segments[1..];

    match segment {
        Segment::Key(key) => {
            match data {
                Value::Object(map) => {
                    if let Some(val) = map.get(key) {
                        evaluate_segments(val, rest)
                    } else {
                        Value::Null
                    }
                }
                Value::Array(arr) => {
                    // 배열의 각 요소에서 키 접근 (암묵적 맵)
                    let results: Vec<Value> = arr
                        .iter()
                        .map(|item| {
                            if let Value::Object(m) = item {
                                if let Some(v) = m.get(key) {
                                    evaluate_segments(v, rest)
                                } else {
                                    Value::Null
                                }
                            } else {
                                Value::Null
                            }
                        })
                        .filter(|v| !v.is_null())
                        .collect();
                    if results.is_empty() {
                        Value::Null
                    } else {
                        Value::Array(results)
                    }
                }
                _ => Value::Null,
            }
        }
        Segment::Index(idx) => {
            if let Value::Array(arr) = data {
                let actual_idx = if *idx < 0 {
                    (arr.len() as i64 + idx) as usize
                } else {
                    *idx as usize
                };
                if actual_idx < arr.len() {
                    evaluate_segments(&arr[actual_idx], rest)
                } else {
                    Value::Null
                }
            } else {
                Value::Null
            }
        }
        Segment::Wildcard => {
            if let Value::Array(arr) = data {
                let results: Vec<Value> = arr
                    .iter()
                    .map(|item| evaluate_segments(item, rest))
                    .filter(|v| !v.is_null())
                    .collect();
                Value::Array(results)
            } else if let Value::Object(map) = data {
                let results: Vec<Value> = map
                    .values()
                    .map(|item| evaluate_segments(item, rest))
                    .filter(|v| !v.is_null())
                    .collect();
                Value::Array(results)
            } else {
                Value::Null
            }
        }
        Segment::Slice(start, end) => {
            if let Value::Array(arr) = data {
                let len = arr.len() as i64;
                let s = start.map_or(0, |v| if v < 0 { (len + v).max(0) } else { v }) as usize;
                let e = end.map_or(arr.len(), |v| if v < 0 { (len + v).max(0) as usize } else { v as usize });
                let sliced: Vec<Value> = arr[s..e.min(arr.len())]
                    .iter()
                    .map(|item| evaluate_segments(item, rest))
                    .collect();
                Value::Array(sliced)
            } else {
                Value::Null
            }
        }
        Segment::Filter(filter) => {
            if let Value::Array(arr) = data {
                let filtered: Vec<Value> = arr
                    .iter()
                    .filter(|item| evaluate_filter(item, filter))
                    .map(|item| evaluate_segments(item, rest))
                    .collect();
                Value::Array(filtered)
            } else {
                Value::Null
            }
        }
    }
}

fn evaluate_filter(item: &Value, filter: &FilterExpr) -> bool {
    let field_val = if filter.field.contains('.') {
        // 중첩 필드 접근
        let parts: Vec<&str> = filter.field.split('.').collect();
        let mut current = item.clone();
        for part in parts {
            current = current.get(part).cloned().unwrap_or(Value::Null);
        }
        current
    } else {
        item.get(&filter.field).cloned().unwrap_or(Value::Null)
    };

    match &filter.op {
        FilterOp::Eq => value_eq(&field_val, &filter.value),
        FilterOp::Ne => !value_eq(&field_val, &filter.value),
        FilterOp::Gt => value_cmp(&field_val, &filter.value) == Some(std::cmp::Ordering::Greater),
        FilterOp::Gte => {
            matches!(
                value_cmp(&field_val, &filter.value),
                Some(std::cmp::Ordering::Greater | std::cmp::Ordering::Equal)
            )
        }
        FilterOp::Lt => value_cmp(&field_val, &filter.value) == Some(std::cmp::Ordering::Less),
        FilterOp::Lte => {
            matches!(
                value_cmp(&field_val, &filter.value),
                Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
            )
        }
        FilterOp::Contains => {
            if let (Value::String(s), FilterValue::Str(sub)) = (&field_val, &filter.value) {
                s.contains(sub.as_str())
            } else if let Value::Array(arr) = &field_val {
                match &filter.value {
                    FilterValue::Str(s) => arr.contains(&Value::String(s.clone())),
                    FilterValue::Num(n) => arr.contains(&serde_json::json!(n)),
                    _ => false,
                }
            } else {
                false
            }
        }
    }
}

fn value_eq(json_val: &Value, filter_val: &FilterValue) -> bool {
    match (json_val, filter_val) {
        (Value::String(s), FilterValue::Str(fs)) => s == fs,
        (Value::Number(n), FilterValue::Num(fn_)) => {
            n.as_f64().map_or(false, |v| (v - fn_).abs() < f64::EPSILON)
        }
        (Value::Bool(b), FilterValue::Bool(fb)) => b == fb,
        (Value::Null, FilterValue::Null) => true,
        _ => false,
    }
}

fn value_cmp(json_val: &Value, filter_val: &FilterValue) -> Option<std::cmp::Ordering> {
    match (json_val, filter_val) {
        (Value::Number(n), FilterValue::Num(fn_)) => {
            n.as_f64().and_then(|v| v.partial_cmp(fn_))
        }
        (Value::String(s), FilterValue::Str(fs)) => Some(s.cmp(fs)),
        _ => None,
    }
}

// ─────────────────────────────────────────────
// 파이프 연산 적용
// ─────────────────────────────────────────────

fn apply_pipe_op(data: Value, op: &PipeOp) -> Value {
    match op {
        PipeOp::Sum => {
            if let Value::Array(arr) = &data {
                let sum: f64 = arr.iter().filter_map(|v| v.as_f64()).sum();
                serde_json::json!(sum)
            } else {
                Value::Null
            }
        }
        PipeOp::Avg => {
            if let Value::Array(arr) = &data {
                let nums: Vec<f64> = arr.iter().filter_map(|v| v.as_f64()).collect();
                if nums.is_empty() {
                    Value::Null
                } else {
                    let avg = nums.iter().sum::<f64>() / nums.len() as f64;
                    serde_json::json!(avg)
                }
            } else {
                Value::Null
            }
        }
        PipeOp::Min => {
            if let Value::Array(arr) = &data {
                arr.iter()
                    .filter_map(|v| v.as_f64())
                    .fold(None, |min: Option<f64>, x| {
                        Some(min.map_or(x, |m| m.min(x)))
                    })
                    .map_or(Value::Null, |v| serde_json::json!(v))
            } else {
                Value::Null
            }
        }
        PipeOp::Max => {
            if let Value::Array(arr) = &data {
                arr.iter()
                    .filter_map(|v| v.as_f64())
                    .fold(None, |max: Option<f64>, x| {
                        Some(max.map_or(x, |m| m.max(x)))
                    })
                    .map_or(Value::Null, |v| serde_json::json!(v))
            } else {
                Value::Null
            }
        }
        PipeOp::Count => {
            match &data {
                Value::Array(arr) => serde_json::json!(arr.len()),
                Value::Object(map) => serde_json::json!(map.len()),
                Value::String(s) => serde_json::json!(s.len()),
                _ => serde_json::json!(0),
            }
        }
        PipeOp::Flatten => {
            if let Value::Array(arr) = &data {
                let mut flat = Vec::new();
                for item in arr {
                    if let Value::Array(inner) = item {
                        flat.extend(inner.iter().cloned());
                    } else {
                        flat.push(item.clone());
                    }
                }
                Value::Array(flat)
            } else {
                data
            }
        }
        PipeOp::Unique => {
            if let Value::Array(arr) = &data {
                let mut seen = Vec::new();
                let mut unique = Vec::new();
                for item in arr {
                    let key = item.to_string();
                    if !seen.contains(&key) {
                        seen.push(key);
                        unique.push(item.clone());
                    }
                }
                Value::Array(unique)
            } else {
                data
            }
        }
        PipeOp::Reverse => {
            if let Value::Array(mut arr) = data {
                arr.reverse();
                Value::Array(arr)
            } else {
                data
            }
        }
        PipeOp::Keys => {
            match &data {
                Value::Object(map) => {
                    Value::Array(map.keys().map(|k| Value::String(k.clone())).collect())
                }
                Value::Array(arr) => {
                    Value::Array((0..arr.len()).map(|i| serde_json::json!(i)).collect())
                }
                _ => Value::Null,
            }
        }
        PipeOp::Values => {
            match &data {
                Value::Object(map) => Value::Array(map.values().cloned().collect()),
                _ => data,
            }
        }
        PipeOp::First => {
            if let Value::Array(arr) = &data {
                arr.first().cloned().unwrap_or(Value::Null)
            } else {
                data
            }
        }
        PipeOp::Last => {
            if let Value::Array(arr) = &data {
                arr.last().cloned().unwrap_or(Value::Null)
            } else {
                data
            }
        }
        PipeOp::SortBy(field) => {
            if let Value::Array(mut arr) = data {
                arr.sort_by(|a, b| {
                    let va = a.get(field);
                    let vb = b.get(field);
                    match (va, vb) {
                        (Some(Value::Number(na)), Some(Value::Number(nb))) => {
                            na.as_f64()
                                .unwrap_or(0.0)
                                .partial_cmp(&nb.as_f64().unwrap_or(0.0))
                                .unwrap_or(std::cmp::Ordering::Equal)
                        }
                        (Some(Value::String(sa)), Some(Value::String(sb))) => sa.cmp(sb),
                        _ => std::cmp::Ordering::Equal,
                    }
                });
                Value::Array(arr)
            } else {
                data
            }
        }
        PipeOp::Length => {
            match &data {
                Value::Array(arr) => serde_json::json!(arr.len()),
                Value::String(s) => serde_json::json!(s.len()),
                Value::Object(map) => serde_json::json!(map.len()),
                _ => serde_json::json!(0),
            }
        }
    }
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────

/// JSON 쿼리 실행
///
/// 문법: "path.to.data[*].field[?condition] | aggregate"
///
/// 예시:
///   "users[0].name"                    → 단일 값
///   "users[*].name"                    → 모든 이름 배열
///   "users[?age > 27].name"            → 필터링 후 이름
///   "users[*].score | avg"             → 점수 평균
///   "data.items | sort_by(.price) | first" → 가격순 첫 번째
pub fn execute_query(data: &Value, query: &str) -> Result<Value, String> {
    let query = query.trim();

    if query.is_empty() {
        return Ok(data.clone());
    }

    // 파이프 분리: 경로 부분과 연산 부분
    // "users[*].score | sum | round" → path="users[*].score", pipes=["sum", "round"]
    // 주의: 필터 내부의 |는 무시해야 함
    let (path_part, pipe_part) = split_path_and_pipes(query);

    // 경로 평가
    let segments = parse_segments(&path_part)?;
    let mut result = evaluate_segments(data, &segments);

    // 파이프 연산 적용
    if !pipe_part.is_empty() {
        let ops = parse_pipe_ops(&pipe_part)?;
        for op in &ops {
            result = apply_pipe_op(result, op);
        }
    }

    Ok(result)
}

fn split_path_and_pipes(query: &str) -> (String, String) {
    let mut depth = 0;
    let mut pipe_start = None;

    for (i, ch) in query.chars().enumerate() {
        match ch {
            '[' => depth += 1,
            ']' => depth -= 1,
            '|' if depth == 0 => {
                pipe_start = Some(i);
                break;
            }
            _ => {}
        }
    }

    if let Some(idx) = pipe_start {
        (query[..idx].trim().to_string(), query[idx + 1..].trim().to_string())
    } else {
        (query.to_string(), String::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_path() {
        let data = json!({"name": "Kim", "age": 30});
        assert_eq!(execute_query(&data, "name").unwrap(), json!("Kim"));
        assert_eq!(execute_query(&data, "age").unwrap(), json!(30));
    }

    #[test]
    fn test_nested_path() {
        let data = json!({"user": {"name": "Kim", "addr": {"city": "Seoul"}}});
        assert_eq!(execute_query(&data, "user.name").unwrap(), json!("Kim"));
        assert_eq!(execute_query(&data, "user.addr.city").unwrap(), json!("Seoul"));
    }

    #[test]
    fn test_array_index() {
        let data = json!({"users": [{"name": "A"}, {"name": "B"}, {"name": "C"}]});
        assert_eq!(execute_query(&data, "users[0].name").unwrap(), json!("A"));
        assert_eq!(execute_query(&data, "users[-1].name").unwrap(), json!("C"));
    }

    #[test]
    fn test_wildcard() {
        let data = json!({"users": [{"name": "A"}, {"name": "B"}]});
        assert_eq!(execute_query(&data, "users[*].name").unwrap(), json!(["A", "B"]));
    }

    #[test]
    fn test_filter() {
        let data = json!({"users": [
            {"name": "Kim", "age": 30},
            {"name": "Lee", "age": 25},
            {"name": "Park", "age": 35}
        ]});
        let result = execute_query(&data, "users[?age > 27].name").unwrap();
        assert_eq!(result, json!(["Kim", "Park"]));
    }

    #[test]
    fn test_slice() {
        let data = json!({"items": [1, 2, 3, 4, 5]});
        assert_eq!(execute_query(&data, "items[0:3]").unwrap(), json!([1, 2, 3]));
        assert_eq!(execute_query(&data, "items[2:]").unwrap(), json!([3, 4, 5]));
    }

    #[test]
    fn test_pipe_sum() {
        let data = json!({"scores": [85, 92, 78]});
        assert_eq!(execute_query(&data, "scores | sum").unwrap(), json!(255.0));
    }

    #[test]
    fn test_pipe_avg() {
        let data = json!({"scores": [80, 90, 100]});
        assert_eq!(execute_query(&data, "scores | avg").unwrap(), json!(90.0));
    }

    #[test]
    fn test_pipe_count() {
        let data = json!({"items": [1, 2, 3, 4]});
        assert_eq!(execute_query(&data, "items | count").unwrap(), json!(4));
    }

    #[test]
    fn test_pipe_chain() {
        let data = json!({"users": [
            {"name": "A", "score": 70},
            {"name": "B", "score": 90},
            {"name": "C", "score": 80}
        ]});
        let result = execute_query(&data, "users | sort_by(.score) | reverse").unwrap();
        assert_eq!(result[0]["score"], json!(90));
    }

    #[test]
    fn test_unique() {
        let data = json!({"tags": ["a", "b", "a", "c", "b"]});
        assert_eq!(execute_query(&data, "tags | unique").unwrap(), json!(["a", "b", "c"]));
    }

    #[test]
    fn test_flatten() {
        let data = json!({"matrix": [[1, 2], [3, 4], [5]]});
        assert_eq!(execute_query(&data, "matrix | flatten").unwrap(), json!([1, 2, 3, 4, 5]));
    }

    #[test]
    fn test_keys_values() {
        let data = json!({"a": 1, "b": 2, "c": 3});
        let keys = execute_query(&data, " | keys").unwrap();
        assert!(keys.as_array().unwrap().contains(&json!("a")));
    }

    #[test]
    fn test_string_filter() {
        let data = json!({"users": [
            {"name": "Kim", "role": "admin"},
            {"name": "Lee", "role": "user"}
        ]});
        let result = execute_query(&data, "users[?role == 'admin'].name").unwrap();
        assert_eq!(result, json!(["Kim"]));
    }
}
