// 템플릿 엔진 — 플랫폼 핵심 도구 #2
// Handlebars 유사 문법으로 프롬프트를 동적 조립
//
// 지원 문법:
//   {{name}}                    - 변수 삽입
//   {{user.name}}               - 점 접근
//   {{#if condition}}...{{else}}...{{/if}}  - 조건
//   {{#each items}}...{{/each}} - 반복
//   {{name | upper}}            - 필터
//   {{name | default:"없음"}}    - 기본값 필터
//   {{@index}}                  - 반복 인덱스
//   {{this}}                    - 현재 아이템
//   {{this.field}}              - 현재 아이템 필드

use serde_json::Value;

// ─────────────────────────────────────────────
// 토큰 파서
// ─────────────────────────────────────────────

#[derive(Debug, Clone)]
enum Token {
    Text(String),
    Variable(String, Vec<Filter>),            // {{name | filter}}
    IfStart(String),                          // {{#if condition}}
    Else,                                     // {{else}}
    IfEnd,                                    // {{/if}}
    EachStart(String),                        // {{#each items}}
    EachEnd,                                  // {{/each}}
}

#[derive(Debug, Clone)]
struct Filter {
    name: String,
    arg: Option<String>,
}

fn parse_filters(expr: &str) -> (String, Vec<Filter>) {
    let parts: Vec<&str> = expr.split('|').collect();
    let var_name = parts[0].trim().to_string();
    let mut filters = Vec::new();

    for part in &parts[1..] {
        let trimmed = part.trim();
        if let Some(colon_idx) = trimmed.find(':') {
            let name = trimmed[..colon_idx].trim().to_string();
            let arg = trimmed[colon_idx + 1..].trim().trim_matches('"').trim_matches('\'').to_string();
            filters.push(Filter { name, arg: Some(arg) });
        } else {
            filters.push(Filter { name: trimmed.to_string(), arg: None });
        }
    }

    (var_name, filters)
}

fn tokenize(template: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut pos = 0;
    let chars: Vec<char> = template.chars().collect();
    let len = chars.len();

    while pos < len {
        // {{ 탐색
        if pos + 1 < len && chars[pos] == '{' && chars[pos + 1] == '{' {
            // 앞의 텍스트 수집
            let text_start = pos;
            pos += 2; // skip {{

            // 공백 스킵
            while pos < len && chars[pos].is_whitespace() {
                pos += 1;
            }

            // }} 까지 내용 수집
            let expr_start = pos;
            let mut depth = 0;
            while pos < len {
                if pos + 1 < len && chars[pos] == '}' && chars[pos + 1] == '}' && depth == 0 {
                    break;
                }
                if chars[pos] == '{' {
                    depth += 1;
                }
                if chars[pos] == '}' && depth > 0 {
                    depth -= 1;
                }
                pos += 1;
            }

            let expr: String = chars[expr_start..pos].iter().collect();
            let expr = expr.trim();

            if pos + 1 < len {
                pos += 2; // skip }}
            }

            // 토큰 분류
            if expr.starts_with("#if ") {
                let condition = expr[4..].trim().to_string();
                tokens.push(Token::IfStart(condition));
            } else if expr == "else" {
                tokens.push(Token::Else);
            } else if expr == "/if" {
                tokens.push(Token::IfEnd);
            } else if expr.starts_with("#each ") {
                let collection = expr[6..].trim().to_string();
                tokens.push(Token::EachStart(collection));
            } else if expr == "/each" {
                tokens.push(Token::EachEnd);
            } else {
                let (var, filters) = parse_filters(expr);
                tokens.push(Token::Variable(var, filters));
            }

            // text_start에서 {{ 전까지는 이미 이전 루프에서 처리됨
            let _ = text_start;
        } else {
            // 일반 텍스트 수집
            let start = pos;
            while pos < len {
                if pos + 1 < len && chars[pos] == '{' && chars[pos + 1] == '{' {
                    break;
                }
                pos += 1;
            }
            let text: String = chars[start..pos].iter().collect();
            if !text.is_empty() {
                tokens.push(Token::Text(text));
            }
        }
    }

    tokens
}

// ─────────────────────────────────────────────
// 변수 해석
// ─────────────────────────────────────────────

fn resolve_variable(name: &str, context: &Value, loop_context: &Option<LoopContext>) -> Value {
    let name = name.trim();

    // 특수 변수
    if name == "@index" {
        if let Some(lc) = loop_context {
            return Value::Number(serde_json::Number::from(lc.index));
        }
        return Value::Null;
    }
    if name == "@first" {
        if let Some(lc) = loop_context {
            return Value::Bool(lc.index == 0);
        }
        return Value::Bool(false);
    }
    if name == "@last" {
        if let Some(lc) = loop_context {
            return Value::Bool(lc.index == lc.total - 1);
        }
        return Value::Bool(false);
    }

    // this (루프 현재 아이템)
    if name == "this" {
        if let Some(lc) = loop_context {
            return lc.item.clone();
        }
        return context.clone();
    }
    if name.starts_with("this.") {
        if let Some(lc) = loop_context {
            return resolve_path(&lc.item, &name[5..]);
        }
    }

    // 점 접근 경로 해석
    resolve_path(context, name)
}

fn resolve_path(data: &Value, path: &str) -> Value {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = data.clone();

    for part in parts {
        // 배열 인덱스 처리: "items[0]"
        if let Some(bracket_start) = part.find('[') {
            let key = &part[..bracket_start];
            let idx_str = &part[bracket_start + 1..part.len() - 1];

            if !key.is_empty() {
                current = current.get(key).cloned().unwrap_or(Value::Null);
            }
            if let Ok(idx) = idx_str.parse::<usize>() {
                current = current.get(idx).cloned().unwrap_or(Value::Null);
            }
        } else {
            current = current.get(part).cloned().unwrap_or(Value::Null);
        }
    }

    current
}

// ─────────────────────────────────────────────
// 필터 적용
// ─────────────────────────────────────────────

fn apply_filter(value: &Value, filter: &Filter) -> Value {
    let text = value_to_string(value);

    match filter.name.as_str() {
        "upper" | "uppercase" => Value::String(text.to_uppercase()),
        "lower" | "lowercase" => Value::String(text.to_lowercase()),
        "trim" => Value::String(text.trim().to_string()),
        "truncate" => {
            let max = filter.arg.as_ref().and_then(|a| a.parse::<usize>().ok()).unwrap_or(100);
            if text.len() > max {
                Value::String(format!("{}...", &text[..max]))
            } else {
                Value::String(text)
            }
        }
        "default" => {
            if value.is_null() || (value.is_string() && value.as_str().unwrap_or("").is_empty()) {
                Value::String(filter.arg.clone().unwrap_or_default())
            } else {
                value.clone()
            }
        }
        "json" => {
            Value::String(serde_json::to_string_pretty(value).unwrap_or(text))
        }
        "length" | "len" => {
            match value {
                Value::String(s) => Value::Number(serde_json::Number::from(s.len())),
                Value::Array(arr) => Value::Number(serde_json::Number::from(arr.len())),
                _ => Value::Number(serde_json::Number::from(0)),
            }
        }
        "nl2br" => Value::String(text.replace('\n', "<br>")),
        "escape_html" => Value::String(
            text.replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;"),
        ),
        "strip_html" => {
            // 간단한 HTML 태그 제거
            let re = regex::Regex::new(r"<[^>]+>").unwrap();
            Value::String(re.replace_all(&text, "").to_string())
        }
        "capitalize" => {
            let mut chars = text.chars();
            match chars.next() {
                None => Value::String(String::new()),
                Some(c) => Value::String(c.to_uppercase().to_string() + &chars.as_str().to_lowercase()),
            }
        }
        "replace" => {
            // "old->new" 형식
            if let Some(arg) = &filter.arg {
                if let Some(arrow) = arg.find("->") {
                    let old = &arg[..arrow];
                    let new = &arg[arrow + 2..];
                    Value::String(text.replace(old, new))
                } else {
                    value.clone()
                }
            } else {
                value.clone()
            }
        }
        _ => value.clone(),
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

// ─────────────────────────────────────────────
// 조건 평가
// ─────────────────────────────────────────────

fn evaluate_condition(condition: &str, context: &Value, loop_context: &Option<LoopContext>) -> bool {
    let condition = condition.trim();

    // "not variable" 패턴
    if condition.starts_with("not ") || condition.starts_with("!") {
        let inner = if condition.starts_with("not ") {
            &condition[4..]
        } else {
            &condition[1..]
        };
        return !evaluate_condition(inner, context, loop_context);
    }

    // 비교 연산
    let ops = ["!=", ">=", "<=", "==", ">", "<"];
    for op in &ops {
        if let Some(idx) = condition.find(op) {
            let left_name = condition[..idx].trim();
            let right_str = condition[idx + op.len()..].trim();

            let left_val = resolve_variable(left_name, context, loop_context);
            let right_val = if right_str.starts_with('\'') || right_str.starts_with('"') {
                Value::String(right_str.trim_matches('\'').trim_matches('"').to_string())
            } else if right_str == "true" {
                Value::Bool(true)
            } else if right_str == "false" {
                Value::Bool(false)
            } else if right_str == "null" {
                Value::Null
            } else if let Ok(n) = right_str.parse::<f64>() {
                serde_json::json!(n)
            } else {
                resolve_variable(right_str, context, loop_context)
            };

            return match *op {
                "==" => left_val == right_val,
                "!=" => left_val != right_val,
                ">" => left_val.as_f64().unwrap_or(0.0) > right_val.as_f64().unwrap_or(0.0),
                ">=" => left_val.as_f64().unwrap_or(0.0) >= right_val.as_f64().unwrap_or(0.0),
                "<" => (left_val.as_f64().unwrap_or(0.0)) < right_val.as_f64().unwrap_or(0.0),
                "<=" => left_val.as_f64().unwrap_or(0.0) <= right_val.as_f64().unwrap_or(0.0),
                _ => false,
            };
        }
    }

    // 단순 truthy 체크
    let val = resolve_variable(condition, context, loop_context);
    is_truthy(&val)
}

fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        Value::String(s) => !s.is_empty(),
        Value::Array(arr) => !arr.is_empty(),
        Value::Object(map) => !map.is_empty(),
    }
}

// ─────────────────────────────────────────────
// 렌더러
// ─────────────────────────────────────────────

#[derive(Clone)]
struct LoopContext {
    item: Value,
    index: usize,
    total: usize,
}

struct RenderState {
    output: String,
    pos: usize,
}

fn render_tokens(
    tokens: &[Token],
    context: &Value,
    loop_context: &Option<LoopContext>,
) -> String {
    let mut state = RenderState {
        output: String::new(),
        pos: 0,
    };

    render_block(tokens, context, loop_context, &mut state);

    state.output
}

fn render_block(
    tokens: &[Token],
    context: &Value,
    loop_context: &Option<LoopContext>,
    state: &mut RenderState,
) {
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::Text(text) => {
                state.output.push_str(text);
                state.pos += 1;
            }
            Token::Variable(name, filters) => {
                let mut val = resolve_variable(name, context, loop_context);
                for filter in filters {
                    val = apply_filter(&val, filter);
                }
                state.output.push_str(&value_to_string(&val));
                state.pos += 1;
            }
            Token::IfStart(condition) => {
                state.pos += 1;
                let cond_result = evaluate_condition(condition, context, loop_context);

                if cond_result {
                    // true 분기 렌더
                    render_until_else_or_endif(tokens, context, loop_context, state, true);
                } else {
                    // true 분기 스킵
                    skip_until_else_or_endif(tokens, state);
                    // else가 있으면 렌더, endif면 끝
                    if state.pos < tokens.len() {
                        if matches!(&tokens[state.pos], Token::Else) {
                            state.pos += 1;
                            render_until_else_or_endif(tokens, context, loop_context, state, false);
                        }
                    }
                }
            }
            Token::IfEnd => {
                state.pos += 1;
                return;
            }
            Token::Else => {
                // if true 분기에서 여기 도달 → endif까지 스킵
                state.pos += 1;
                skip_until_endif(tokens, state);
                return;
            }
            Token::EachStart(collection) => {
                state.pos += 1;
                let items = resolve_variable(collection, context, loop_context);

                if let Value::Array(arr) = &items {
                    let total = arr.len();
                    let each_start = state.pos;

                    for (idx, item) in arr.iter().enumerate() {
                        let lc = Some(LoopContext {
                            item: item.clone(),
                            index: idx,
                            total,
                        });

                        state.pos = each_start;
                        render_until_each_end(tokens, context, &lc, state);
                    }
                } else {
                    // 배열이 아니면 스킵
                    skip_until_each_end(tokens, state);
                }
            }
            Token::EachEnd => {
                state.pos += 1;
                return;
            }
        }
    }
}

fn render_until_else_or_endif(
    tokens: &[Token],
    context: &Value,
    loop_context: &Option<LoopContext>,
    state: &mut RenderState,
    _in_true_branch: bool,
) {
    let mut depth = 0;
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::IfStart(_) => {
                depth += 1;
                // 중첩 if 렌더
                render_block(tokens, context, loop_context, state);
                depth -= 1;
            }
            Token::Else if depth == 0 => return,
            Token::IfEnd if depth == 0 => {
                state.pos += 1;
                return;
            }
            _ => {
                render_block_single(tokens, context, loop_context, state);
            }
        }
    }
}

fn render_block_single(
    tokens: &[Token],
    context: &Value,
    loop_context: &Option<LoopContext>,
    state: &mut RenderState,
) {
    if state.pos >= tokens.len() {
        return;
    }
    match &tokens[state.pos] {
        Token::Text(text) => {
            state.output.push_str(text);
            state.pos += 1;
        }
        Token::Variable(name, filters) => {
            let mut val = resolve_variable(name, context, loop_context);
            for filter in filters {
                val = apply_filter(&val, filter);
            }
            state.output.push_str(&value_to_string(&val));
            state.pos += 1;
        }
        Token::EachStart(collection) => {
            state.pos += 1;
            let items = resolve_variable(collection, context, loop_context);
            if let Value::Array(arr) = &items {
                let total = arr.len();
                let each_start = state.pos;
                for (idx, item) in arr.iter().enumerate() {
                    let lc = Some(LoopContext { item: item.clone(), index: idx, total });
                    state.pos = each_start;
                    render_until_each_end(tokens, context, &lc, state);
                }
            } else {
                skip_until_each_end(tokens, state);
            }
        }
        _ => {
            state.pos += 1;
        }
    }
}

fn render_until_each_end(
    tokens: &[Token],
    context: &Value,
    loop_context: &Option<LoopContext>,
    state: &mut RenderState,
) {
    let mut depth = 0;
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::EachStart(_) => {
                depth += 1;
                render_block_single(tokens, context, loop_context, state);
            }
            Token::EachEnd => {
                if depth == 0 {
                    state.pos += 1;
                    return;
                }
                depth -= 1;
                state.pos += 1;
            }
            _ => {
                render_block_single(tokens, context, loop_context, state);
            }
        }
    }
}

fn skip_until_else_or_endif(tokens: &[Token], state: &mut RenderState) {
    let mut depth = 0;
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::IfStart(_) => {
                depth += 1;
                state.pos += 1;
            }
            Token::Else if depth == 0 => return,
            Token::IfEnd => {
                if depth == 0 {
                    state.pos += 1;
                    return;
                }
                depth -= 1;
                state.pos += 1;
            }
            _ => {
                state.pos += 1;
            }
        }
    }
}

fn skip_until_endif(tokens: &[Token], state: &mut RenderState) {
    let mut depth = 0;
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::IfStart(_) => {
                depth += 1;
                state.pos += 1;
            }
            Token::IfEnd => {
                if depth == 0 {
                    state.pos += 1;
                    return;
                }
                depth -= 1;
                state.pos += 1;
            }
            _ => {
                state.pos += 1;
            }
        }
    }
}

fn skip_until_each_end(tokens: &[Token], state: &mut RenderState) {
    let mut depth = 0;
    while state.pos < tokens.len() {
        match &tokens[state.pos] {
            Token::EachStart(_) => {
                depth += 1;
                state.pos += 1;
            }
            Token::EachEnd => {
                if depth == 0 {
                    state.pos += 1;
                    return;
                }
                depth -= 1;
                state.pos += 1;
            }
            _ => {
                state.pos += 1;
            }
        }
    }
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────

/// 템플릿 렌더링
///
/// # 예시
/// ```
/// let template = "안녕하세요, {{name}}님!";
/// let vars = json!({"name": "김철수"});
/// let result = render(template, &vars);
/// assert_eq!(result, "안녕하세요, 김철수님!");
/// ```
pub fn render(template: &str, variables: &Value) -> String {
    let tokens = tokenize(template);
    render_tokens(&tokens, variables, &None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_variable() {
        let result = render("Hello, {{name}}!", &json!({"name": "World"}));
        assert_eq!(result, "Hello, World!");
    }

    #[test]
    fn test_nested_variable() {
        let result = render("City: {{user.addr.city}}", &json!({"user": {"addr": {"city": "Seoul"}}}));
        assert_eq!(result, "City: Seoul");
    }

    #[test]
    fn test_filter_upper() {
        let result = render("{{name | upper}}", &json!({"name": "hello"}));
        assert_eq!(result, "HELLO");
    }

    #[test]
    fn test_filter_default() {
        let result = render("{{missing | default:\"없음\"}}", &json!({}));
        assert_eq!(result, "없음");
    }

    #[test]
    fn test_if_true() {
        let result = render("{{#if show}}보임{{/if}}", &json!({"show": true}));
        assert_eq!(result, "보임");
    }

    #[test]
    fn test_if_false() {
        let result = render("{{#if show}}보임{{/if}}", &json!({"show": false}));
        assert_eq!(result, "");
    }

    #[test]
    fn test_if_else() {
        let result = render("{{#if admin}}관리자{{else}}일반{{/if}}", &json!({"admin": false}));
        assert_eq!(result, "일반");
    }

    #[test]
    fn test_each() {
        let result = render(
            "{{#each items}}[{{this}}]{{/each}}",
            &json!({"items": ["a", "b", "c"]}),
        );
        assert_eq!(result, "[a][b][c]");
    }

    #[test]
    fn test_each_with_index() {
        let result = render(
            "{{#each items}}{{@index}}:{{this.name}} {{/each}}",
            &json!({"items": [{"name": "A"}, {"name": "B"}]}),
        );
        assert_eq!(result, "0:A 1:B ");
    }

    #[test]
    fn test_if_comparison() {
        let result = render(
            "{{#if age > 18}}성인{{else}}미성년{{/if}}",
            &json!({"age": 25}),
        );
        assert_eq!(result, "성인");
    }

    #[test]
    fn test_filter_truncate() {
        let result = render("{{text | truncate:5}}", &json!({"text": "Hello, World!"}));
        assert_eq!(result, "Hello...");
    }

    #[test]
    fn test_complex_template() {
        let template = "다음 문서를 분석하세요:\n\n{{#each documents}}---문서 {{@index}}---\n{{this.content}}\n{{/each}}\n질문: {{query}}";
        let vars = json!({
            "documents": [
                {"content": "문서1 내용"},
                {"content": "문서2 내용"}
            ],
            "query": "요약해주세요"
        });
        let result = render(template, &vars);
        assert!(result.contains("---문서 0---"));
        assert!(result.contains("문서1 내용"));
        assert!(result.contains("---문서 1---"));
        assert!(result.contains("질문: 요약해주세요"));
    }
}
