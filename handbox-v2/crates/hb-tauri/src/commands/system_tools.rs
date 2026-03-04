//! System tools for agent use — Claude Code level capabilities.
//! Provides: bash execute, file operations, code search, glob search,
//! project tree, web search, web fetch, git operations.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

// ============================================================
// .gitignore Support
// ============================================================

/// Parsed .gitignore rules for filtering search results
struct GitignoreRules {
    patterns: Vec<GitignorePattern>,
}

struct GitignorePattern {
    pattern: String,
    negated: bool,
    dir_only: bool,
}

impl GitignoreRules {
    /// Load .gitignore rules from a directory, walking up to find parent .gitignore files
    fn load(root: &Path) -> Self {
        let mut patterns = Vec::new();

        // Walk up directory tree to find all applicable .gitignore files
        let mut dir = root.to_path_buf();
        let mut gitignore_files = Vec::new();
        loop {
            let gi = dir.join(".gitignore");
            if gi.exists() {
                gitignore_files.push(gi);
            }
            if !dir.pop() {
                break;
            }
        }

        // Process in reverse order (most general first, most specific last)
        for gi_path in gitignore_files.into_iter().rev() {
            if let Ok(content) = std::fs::read_to_string(&gi_path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    let negated = line.starts_with('!');
                    let pat = if negated { &line[1..] } else { line };
                    let dir_only = pat.ends_with('/');
                    let pat = pat.trim_end_matches('/').to_string();

                    patterns.push(GitignorePattern {
                        pattern: pat,
                        negated,
                        dir_only,
                    });
                }
            }
        }

        GitignoreRules { patterns }
    }

    /// Check if a relative path should be ignored.
    /// `is_dir` indicates whether the path is a directory.
    fn is_ignored(&self, rel_path: &str, is_dir: bool) -> bool {
        let norm = rel_path.replace('\\', "/");
        let filename = norm.rsplit('/').next().unwrap_or(&norm);
        let mut ignored = false;

        for pat in &self.patterns {
            if pat.dir_only && !is_dir {
                continue;
            }

            let matches = if pat.pattern.contains('/') {
                // Path pattern — match against full relative path
                gitignore_pattern_match(&pat.pattern, &norm)
            } else {
                // Name pattern — match against filename only
                gitignore_pattern_match(&pat.pattern, filename)
            };

            if matches {
                ignored = !pat.negated;
            }
        }

        ignored
    }
}

/// Simple gitignore-style pattern matching.
/// Supports `*` (any chars), `?` (single char), `**` (recursive).
fn gitignore_pattern_match(pattern: &str, text: &str) -> bool {
    let p_chars: Vec<char> = pattern.chars().collect();
    let t_chars: Vec<char> = text.chars().collect();
    let pn = p_chars.len();
    let tn = t_chars.len();

    // DP matching
    let mut dp = vec![vec![false; tn + 1]; pn + 1];
    dp[0][0] = true;

    // Handle leading wildcards
    for i in 1..=pn {
        if p_chars[i - 1] == '*' {
            dp[i][0] = dp[i - 1][0];
        } else {
            break;
        }
    }

    for i in 1..=pn {
        for j in 1..=tn {
            if p_chars[i - 1] == '*' {
                // Check for ** (matches /)
                let is_double_star = i >= 2 && p_chars[i - 2] == '*';
                if is_double_star {
                    dp[i][j] = dp[i - 2][j] || dp[i][j - 1];
                } else {
                    // * doesn't match /
                    dp[i][j] = dp[i - 1][j] || (t_chars[j - 1] != '/' && dp[i][j - 1]);
                }
            } else if p_chars[i - 1] == '?' {
                dp[i][j] = t_chars[j - 1] != '/' && dp[i - 1][j - 1];
            } else {
                dp[i][j] = p_chars[i - 1] == t_chars[j - 1] && dp[i - 1][j - 1];
            }
        }
    }

    dp[pn][tn]
}

// ============================================================
// Bash Execute
// ============================================================

#[tauri::command]
pub async fn tool_bash_execute(
    command: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<Value, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000).min(120_000));
    let cwd = working_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let start = std::time::Instant::now();

    // Use cmd.exe on Windows, sh on Unix
    #[cfg(target_os = "windows")]
    let child = tokio::process::Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let child = tokio::process::Command::new("sh")
        .args(["-c", &command])
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    let child = child.map_err(|e| format!("Failed to spawn process: {e}"))?;

    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let elapsed = start.elapsed().as_millis();

            Ok(json!({
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": exit_code,
                "elapsed_ms": elapsed,
                "command": command,
                "working_dir": cwd.to_string_lossy(),
                "text": if exit_code == 0 {
                    format!("{stdout}{stderr}")
                } else {
                    format!("Exit code {exit_code}\n{stdout}{stderr}")
                }
            }))
        }
        Ok(Err(e)) => Err(format!("Process error: {e}")),
        Err(_) => {
            Err(format!("Command timed out after {}ms", timeout.as_millis()))
        }
    }
}

// ============================================================
// File Read
// ============================================================

#[tauri::command]
pub async fn tool_file_read(
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Value, String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();
    let start = offset.unwrap_or(0).min(total_lines);
    let count = limit.unwrap_or(2000).min(total_lines - start);
    let selected: Vec<String> = lines[start..start + count]
        .iter()
        .enumerate()
        .map(|(i, l)| format!("{:>6}\t{}", start + i + 1, l))
        .collect();

    Ok(json!({
        "content": selected.join("\n"),
        "path": path.to_string_lossy(),
        "total_lines": total_lines,
        "offset": start,
        "lines_shown": count,
        "text": selected.join("\n")
    }))
}

// ============================================================
// File Write
// ============================================================

#[tauri::command]
pub async fn tool_file_write(
    path: String,
    content: String,
    create_dirs: Option<bool>,
) -> Result<Value, String> {
    let path = PathBuf::from(&path);

    if create_dirs.unwrap_or(true) {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directories: {e}"))?;
        }
    }

    let bytes = content.len();
    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| format!("Failed to write file: {e}"))?;

    let lines = content.lines().count();
    Ok(json!({
        "success": true,
        "path": path.to_string_lossy(),
        "bytes_written": bytes,
        "lines": lines,
        "text": format!("Wrote {} bytes ({} lines) to {}", bytes, lines, path.display())
    }))
}

// ============================================================
// File Edit (find-replace)
// ============================================================

#[tauri::command]
pub async fn tool_file_edit(
    path: String,
    old_string: String,
    new_string: String,
    replace_all: Option<bool>,
) -> Result<Value, String> {
    // Guard: empty old_string would match everywhere and corrupt the file
    if old_string.is_empty() {
        return Err("old_string cannot be empty — it would match every position in the file".to_string());
    }

    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let occurrences = content.matches(&old_string).count();
    if occurrences == 0 {
        return Err(format!(
            "old_string not found in {}. Make sure it matches exactly.",
            path.display()
        ));
    }

    if !replace_all.unwrap_or(false) && occurrences > 1 {
        return Err(format!(
            "old_string found {} times in {}. Use replace_all=true or provide more context.",
            occurrences,
            path.display()
        ));
    }

    let new_content = if replace_all.unwrap_or(false) {
        content.replace(&old_string, &new_string)
    } else {
        content.replacen(&old_string, &new_string, 1)
    };

    tokio::fs::write(&path, &new_content)
        .await
        .map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(json!({
        "success": true,
        "path": path.to_string_lossy(),
        "occurrences_replaced": if replace_all.unwrap_or(false) { occurrences } else { 1 },
        "text": format!("Replaced {} occurrence(s) in {}", if replace_all.unwrap_or(false) { occurrences } else { 1 }, path.display())
    }))
}

// ============================================================
// File Edit Lines (line-based)
// ============================================================

#[tauri::command]
pub async fn tool_file_edit_lines(
    path: String,
    line_start: usize,
    line_end: Option<usize>,
    new_text: String,
) -> Result<Value, String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read file: {e}"))?;

    // Detect line ending
    let line_ending = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let mut lines: Vec<&str> = content.split(line_ending).collect();
    // Handle trailing newline
    if lines.last() == Some(&"") {
        lines.pop();
    }

    let total = lines.len();
    if line_start == 0 || line_start > total + 1 {
        return Err(format!(
            "line_start {} out of range (1..{})",
            line_start,
            total + 1
        ));
    }

    let end = line_end.unwrap_or(line_start).min(total);
    let start_idx = line_start - 1;
    let end_idx = end;

    let old_lines: Vec<&str> = lines[start_idx..end_idx].to_vec();
    let new_lines: Vec<&str> = if new_text.is_empty() {
        vec![]
    } else {
        new_text.split('\n').collect()
    };

    let mut result = Vec::with_capacity(lines.len());
    result.extend_from_slice(&lines[..start_idx]);
    for nl in &new_lines {
        result.push(*nl);
    }
    if end_idx < lines.len() {
        result.extend_from_slice(&lines[end_idx..]);
    }

    let new_content = result.join(line_ending);
    let final_content = if content.ends_with(line_ending) {
        format!("{new_content}{line_ending}")
    } else {
        new_content
    };

    tokio::fs::write(&path, &final_content)
        .await
        .map_err(|e| format!("Failed to write: {e}"))?;

    Ok(json!({
        "success": true,
        "path": path.to_string_lossy(),
        "line_start": line_start,
        "line_end": end,
        "old_lines": old_lines,
        "new_lines_count": new_lines.len(),
        "text": format!("Replaced lines {}-{} ({} old → {} new) in {}",
            line_start, end, old_lines.len(), new_lines.len(), path.display())
    }))
}

// ============================================================
// Grep Search
// ============================================================

#[tauri::command]
pub async fn tool_grep_search(
    pattern: String,
    path: Option<String>,
    glob_filter: Option<String>,
    max_results: Option<usize>,
    context_lines: Option<usize>,
) -> Result<Value, String> {
    let search_path = path.unwrap_or_else(|| ".".to_string());
    let max = max_results.unwrap_or(50).min(200);
    let ctx = context_lines.unwrap_or(0);

    // Use our own recursive search implementation for reliability
    let search_dir = PathBuf::from(&search_path);
    let regex = regex_lite::Regex::new(&pattern).map_err(|e| format!("Invalid regex: {e}"))?;

    // Load .gitignore rules
    let gitignore = GitignoreRules::load(&search_dir);

    let mut matches = Vec::new();
    let mut files_searched = 0;
    search_files_recursive(&search_dir, &regex, &glob_filter, max, ctx, &mut matches, &mut files_searched, &gitignore).await;

    let total_matches = matches.len();
    let text = matches
        .iter()
        .map(|m| {
            let v = m.as_object().unwrap();
            format!(
                "{}:{}: {}",
                v["file"].as_str().unwrap_or(""),
                v["line"].as_u64().unwrap_or(0),
                v["content"].as_str().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(json!({
        "matches": matches,
        "total_matches": total_matches,
        "files_searched": files_searched,
        "pattern": pattern,
        "text": if total_matches == 0 {
            format!("No matches found for '{}' in {}", pattern, search_path)
        } else {
            text
        }
    }))
}

async fn search_files_recursive(
    dir: &Path,
    regex: &regex_lite::Regex,
    glob_filter: &Option<String>,
    max: usize,
    ctx: usize,
    matches: &mut Vec<Value>,
    files_searched: &mut usize,
    gitignore: &GitignoreRules,
) {
    search_files_recursive_rooted(dir, dir, regex, glob_filter, max, ctx, matches, files_searched, gitignore).await;
}

async fn search_files_recursive_rooted(
    root: &Path,
    dir: &Path,
    regex: &regex_lite::Regex,
    glob_filter: &Option<String>,
    max: usize,
    ctx: usize,
    matches: &mut Vec<Value>,
    files_searched: &mut usize,
    gitignore: &GitignoreRules,
) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        if matches.len() >= max {
            return;
        }

        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();

        // Always skip .git directory itself
        if fname == ".git" {
            continue;
        }

        // Check .gitignore rules
        let rel = relative_path_from(root, &path);
        let is_dir = path.is_dir();

        if gitignore.is_ignored(&rel, is_dir) {
            continue;
        }

        // Fallback skip for common non-code dirs (if not covered by .gitignore)
        if is_dir && (fname == "node_modules" || fname == "target" || fname == "__pycache__") {
            continue;
        }

        if is_dir {
            Box::pin(search_files_recursive_rooted(
                root,
                &path,
                regex,
                glob_filter,
                max,
                ctx,
                matches,
                files_searched,
                gitignore,
            ))
            .await;
        } else if path.is_file() {
            // Check glob filter with path-aware matching
            if let Some(ref g) = glob_filter {
                if !glob_match_path(g, &fname, Some(&rel)) {
                    continue;
                }
            }

            // Skip binary files (check extension)
            if is_binary_extension(&fname) {
                continue;
            }

            *files_searched += 1;

            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                let lines: Vec<&str> = content.lines().collect();
                for (i, line) in lines.iter().enumerate() {
                    if matches.len() >= max {
                        return;
                    }
                    if regex.is_match(line) {
                        let rel_path = path.to_string_lossy().to_string();
                        let mut m = json!({
                            "file": rel_path,
                            "line": i + 1,
                            "content": line.chars().take(500).collect::<String>(),
                        });

                        if ctx > 0 {
                            let start = i.saturating_sub(ctx);
                            let end = (i + ctx + 1).min(lines.len());
                            let context: Vec<String> = lines[start..end]
                                .iter()
                                .enumerate()
                                .map(|(j, l)| format!("{}: {}", start + j + 1, l))
                                .collect();
                            m["context"] = json!(context);
                        }

                        matches.push(m);
                    }
                }
            }
        }
    }
}

/// Full glob pattern matching supporting:
/// - `*.rs` — extension match
/// - `**/*.rs` — recursive extension match (same as *.rs since we recurse)
/// - `src/**/*.ts` — path prefix + extension
/// - `*.{ts,tsx}` — brace expansion for multiple extensions
/// - `test_*.py` — prefix wildcard
/// - `Cargo.toml` — exact filename match
fn glob_match(pattern: &str, filename: &str) -> bool {
    glob_match_path(pattern, filename, None)
}

/// Path-aware glob matching: `rel_path` is the relative path from the search root
/// (e.g. "src/utils/helper.ts"). If provided, path-prefix patterns like
/// `src/**/*.ts` are matched against the full relative path.
fn glob_match_path(pattern: &str, filename: &str, rel_path: Option<&str>) -> bool {
    // Handle brace expansion: *.{ts,tsx} → check each alternative
    if let Some(brace_start) = pattern.find('{') {
        if let Some(brace_end) = pattern[brace_start..].find('}') {
            let prefix = &pattern[..brace_start];
            let suffix = &pattern[brace_start + brace_end + 1..];
            let alternatives = &pattern[brace_start + 1..brace_start + brace_end];
            return alternatives.split(',').any(|alt| {
                let expanded = format!("{prefix}{alt}{suffix}");
                glob_match_path(&expanded, filename, rel_path)
            });
        }
    }

    // Handle path-prefix patterns: src/**/*.ts, tests/*.py
    if pattern.contains('/') || pattern.contains('\\') {
        let norm_pattern = pattern.replace('\\', "/");
        if let Some(full_path) = rel_path {
            let norm_path = full_path.replace('\\', "/");
            return wildcard_match(&norm_pattern, &norm_path);
        }
        // No rel_path — extract filename portion of pattern
        let file_part = norm_pattern.rsplit('/').next().unwrap_or(&norm_pattern);
        return wildcard_match(file_part, filename);
    }

    // Strip leading **/ (recursive indicator — already recursing)
    let pattern = pattern.strip_prefix("**/").unwrap_or(pattern);

    // If no glob metacharacters, use substring match for convenience
    if !pattern.contains('*') && !pattern.contains('?') {
        return filename.contains(pattern);
    }

    wildcard_match(pattern, filename)
}

/// Wildcard matching supporting `*` (any chars except /), `**` (any chars including /),
/// and `?` (single non-/ char). Case-insensitive on Windows.
fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    let (plen, tlen) = (p.len(), t.len());

    // dp[j] = pattern[0..i] matches text[0..j]
    let mut dp = vec![false; tlen + 1];
    dp[0] = true;

    for i in 0..plen {
        if p[i] == '*' {
            // Check if this is ** (matches path separators too)
            let is_globstar = i + 1 < plen && p[i + 1] == '*';
            if is_globstar {
                continue; // Process on the second *
            }
            // Check if previous char was * (this is second * of **)
            let matches_slash = i > 0 && p[i - 1] == '*';

            if matches_slash {
                // ** matches everything including /
                for j in 1..=tlen {
                    dp[j] = dp[j] || dp[j - 1];
                }
            } else {
                // Single * matches everything except /
                for j in 1..=tlen {
                    dp[j] = dp[j] || (dp[j - 1] && t[j - 1] != '/');
                }
            }
        } else {
            for j in (1..=tlen).rev() {
                let char_match = if p[i] == '?' {
                    t[j - 1] != '/'
                } else {
                    p[i].eq_ignore_ascii_case(&t[j - 1])
                };
                dp[j] = dp[j - 1] && char_match;
            }
            dp[0] = false;
        }
    }

    dp[tlen]
}

/// Compute relative path from search root for path-aware glob matching.
fn relative_path_from(root: &Path, full_path: &Path) -> String {
    full_path
        .strip_prefix(root)
        .unwrap_or(full_path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_binary_extension(name: &str) -> bool {
    let binary_exts = [
        "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp",
        "woff", "woff2", "ttf", "otf", "eot",
        "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
        "exe", "dll", "so", "dylib", "o", "a", "lib",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "mp3", "mp4", "avi", "mov", "wav", "flac",
        "db", "sqlite", "sqlite3",
        "wasm", "node",
    ];
    if let Some(ext) = name.rsplit('.').next() {
        binary_exts.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

// ============================================================
// Glob Search
// ============================================================

#[tauri::command]
pub async fn tool_glob_search(
    pattern: String,
    path: Option<String>,
    max_results: Option<usize>,
) -> Result<Value, String> {
    let search_dir = PathBuf::from(path.as_deref().unwrap_or("."));
    let max = max_results.unwrap_or(100).min(500);

    // Load .gitignore rules
    let gitignore = GitignoreRules::load(&search_dir);

    let mut results = Vec::new();
    glob_recursive(&search_dir, &pattern, max, &mut results, &gitignore).await;

    let text = results.join("\n");
    let total = results.len();

    Ok(json!({
        "files": results,
        "total": total,
        "pattern": pattern,
        "text": if total == 0 {
            format!("No files matching '{}' found", pattern)
        } else {
            format!("{} file(s) found:\n{}", total, text)
        }
    }))
}

async fn glob_recursive(dir: &Path, pattern: &str, max: usize, results: &mut Vec<String>, gitignore: &GitignoreRules) {
    glob_recursive_rooted(dir, dir, pattern, max, results, gitignore).await;
}

async fn glob_recursive_rooted(root: &Path, dir: &Path, pattern: &str, max: usize, results: &mut Vec<String>, gitignore: &GitignoreRules) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        if results.len() >= max {
            return;
        }

        let path = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();

        // Always skip .git
        if fname == ".git" {
            continue;
        }

        // Check .gitignore rules
        let rel = relative_path_from(root, &path);
        if gitignore.is_ignored(&rel, is_dir) {
            continue;
        }

        // Fallback skip for common non-code dirs
        if is_dir && (fname == "node_modules" || fname == "target" || fname == "dist") {
            continue;
        }

        if is_dir {
            Box::pin(glob_recursive_rooted(root, &path, pattern, max, results, gitignore)).await;
        } else if path.is_file() {
            if glob_match_path(pattern, &fname, Some(&rel)) {
                results.push(path.to_string_lossy().to_string());
            }
        }
    }
}

// ============================================================
// Project Tree
// ============================================================

#[tauri::command]
pub async fn tool_project_tree(
    path: Option<String>,
    max_depth: Option<usize>,
    max_entries: Option<usize>,
) -> Result<Value, String> {
    let root = PathBuf::from(path.as_deref().unwrap_or("."));
    let depth = max_depth.unwrap_or(4).min(8);
    let max = max_entries.unwrap_or(500).min(2000);

    let gitignore = GitignoreRules::load(&root);

    let mut lines = Vec::new();
    let mut count = 0;
    tree_recursive(&root, &root, "", depth, 0, max, &mut lines, &mut count, &gitignore).await;

    let text = lines.join("\n");
    Ok(json!({
        "tree": text,
        "entries": count,
        "root": root.to_string_lossy(),
        "text": text
    }))
}

async fn tree_recursive(
    root: &Path,
    dir: &Path,
    prefix: &str,
    max_depth: usize,
    current_depth: usize,
    max_entries: usize,
    lines: &mut Vec<String>,
    count: &mut usize,
    gitignore: &GitignoreRules,
) {
    if current_depth >= max_depth || *count >= max_entries {
        return;
    }

    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };

    let mut items = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname == ".git" {
            continue;
        }
        let path = entry.path();
        let rel = relative_path_from(root, &path);
        let is_dir = path.is_dir();
        if gitignore.is_ignored(&rel, is_dir) {
            continue;
        }
        // Fallback skip
        if is_dir && (fname == "node_modules" || fname == "target" || fname == "__pycache__") {
            continue;
        }
        items.push(entry);
    }

    // Sort: dirs first, then files
    items.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        b_dir.cmp(&a_dir).then_with(|| {
            a.file_name()
                .to_string_lossy()
                .to_lowercase()
                .cmp(&b.file_name().to_string_lossy().to_lowercase())
        })
    });

    let total = items.len();
    for (i, entry) in items.into_iter().enumerate() {
        if *count >= max_entries {
            lines.push(format!("{prefix}... ({} more entries)", total - i));
            break;
        }

        let fname = entry.file_name().to_string_lossy().to_string();
        let is_last = i == total - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let is_dir = entry.path().is_dir();

        if is_dir {
            lines.push(format!("{prefix}{connector}{fname}/"));
        } else {
            // Show file size
            let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
            let size_str = if size > 1_000_000 {
                format!("{}MB", size / 1_000_000)
            } else if size > 1_000 {
                format!("{}KB", size / 1_000)
            } else {
                format!("{}B", size)
            };
            lines.push(format!("{prefix}{connector}{fname} ({size_str})"));
        }
        *count += 1;

        if is_dir {
            let child_prefix = if is_last {
                format!("{prefix}    ")
            } else {
                format!("{prefix}│   ")
            };
            Box::pin(tree_recursive(
                root,
                &entry.path(),
                &child_prefix,
                max_depth,
                current_depth + 1,
                max_entries,
                lines,
                count,
                gitignore,
            ))
            .await;
        }
    }
}

// ============================================================
// Web Fetch
// ============================================================

#[tauri::command]
pub async fn tool_web_fetch(
    url: String,
    timeout_ms: Option<u64>,
    max_chars: Option<usize>,
) -> Result<Value, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(15_000).min(60_000));
    let max = max_chars.unwrap_or(50_000);
    let start = std::time::Instant::now();

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .user_agent("Handbox/2.0 (Desktop Agent)")
        .build()
        .map_err(|e| format!("Client error: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fetch error: {e}"))?;

    let status = resp.status().as_u16();
    let html = resp.text().await.map_err(|e| format!("Read error: {e}"))?;

    // Simple HTML → text conversion
    let text = html_to_text(&html);
    let title = extract_title(&html);
    let truncated = text.len() > max;
    let final_text: String = text.chars().take(max).collect();
    let elapsed = start.elapsed().as_millis();

    Ok(json!({
        "text": final_text,
        "title": title,
        "url": url,
        "status": status,
        "chars": final_text.len(),
        "truncated": truncated,
        "elapsed_ms": elapsed,
    }))
}

/// Full HTTP client (GET/POST/PUT/DELETE/PATCH) with custom headers, body, and query parameters
#[tauri::command]
pub async fn tool_http_request(
    url: String,
    method: Option<String>,
    headers: Option<serde_json::Value>,
    body: Option<String>,
    params: Option<serde_json::Value>,
    timeout_ms: Option<u64>,
    max_chars: Option<usize>,
) -> Result<serde_json::Value, String> {
    let method_str = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000).min(120_000));
    let max = max_chars.unwrap_or(100_000);
    let start = std::time::Instant::now();

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .user_agent("Handbox/2.0 (Desktop Agent)")
        .build()
        .map_err(|e| format!("Client error: {e}"))?;

    // Build URL with query params
    let mut url_parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    if let Some(ref p) = params {
        if let Some(obj) = p.as_object() {
            let mut pairs = url_parsed.query_pairs_mut();
            for (k, v) in obj {
                pairs.append_pair(k, v.as_str().unwrap_or(&v.to_string()));
            }
        }
    }

    let mut req_builder = match method_str.as_str() {
        "POST" => client.post(url_parsed.as_str()),
        "PUT" => client.put(url_parsed.as_str()),
        "DELETE" => client.delete(url_parsed.as_str()),
        "PATCH" => client.patch(url_parsed.as_str()),
        _ => client.get(url_parsed.as_str()),
    };

    if let Some(ref h) = headers {
        if let Some(obj) = h.as_object() {
            for (k, v) in obj {
                req_builder = req_builder.header(k.as_str(), v.as_str().unwrap_or(&v.to_string()));
            }
        }
    }

    if let Some(ref b) = body {
        req_builder = req_builder.body(b.clone());
        // Auto-set Content-Type if not provided
        if headers.as_ref().and_then(|h| h.get("Content-Type")).is_none()
            && headers.as_ref().and_then(|h| h.get("content-type")).is_none()
        {
            req_builder = req_builder.header("Content-Type", "application/json");
        }
    }

    let resp = req_builder.send().await.map_err(|e| format!("Request error: {e}"))?;
    let status = resp.status().as_u16();
    let resp_headers: serde_json::Value = resp.headers().iter()
        .map(|(k, v)| (k.as_str().to_string(), serde_json::json!(v.to_str().unwrap_or(""))))
        .collect::<serde_json::Map<String, serde_json::Value>>()
        .into();

    let raw_body = resp.text().await.map_err(|e| format!("Read error: {e}"))?;
    let truncated = raw_body.len() > max;
    let final_body: String = raw_body.chars().take(max).collect();
    let elapsed = start.elapsed().as_millis();

    let response_json = serde_json::from_str::<serde_json::Value>(&final_body).ok();

    Ok(serde_json::json!({
        "text": final_body,
        "status": status,
        "headers": resp_headers,
        "url": url_parsed.as_str(),
        "method": method_str,
        "chars": final_body.len(),
        "truncated": truncated,
        "elapsed_ms": elapsed,
        "is_json": response_json.is_some(),
        "response_json": response_json,
    }))
}

fn html_to_text(html: &str) -> String {
    let mut result = String::with_capacity(html.len() / 3);
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;
    let mut prev_space = false;

    let lower = html.to_lowercase();
    let chars: Vec<char> = html.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        if i + 7 < lower_chars.len() && lower_chars[i..i + 7].iter().collect::<String>() == "<script" {
            in_script = true;
        }
        if i + 8 < lower_chars.len() && lower_chars[i..i + 9].iter().collect::<String>() == "</script>" {
            in_script = false;
            i += 9;
            continue;
        }
        if i + 6 < lower_chars.len() && lower_chars[i..i + 6].iter().collect::<String>() == "<style" {
            in_style = true;
        }
        if i + 7 < lower_chars.len() && lower_chars[i..i + 8].iter().collect::<String>() == "</style>" {
            in_style = false;
            i += 8;
            continue;
        }

        let ch = chars[i];
        if ch == '<' {
            in_tag = true;
            // Add newline for block elements
            if i + 3 < chars.len() {
                let next3: String = lower_chars[i + 1..(i + 4).min(lower_chars.len())]
                    .iter()
                    .collect();
                if next3.starts_with("br")
                    || next3.starts_with("p ")
                    || next3.starts_with("p>")
                    || next3.starts_with("div")
                    || next3.starts_with("h1")
                    || next3.starts_with("h2")
                    || next3.starts_with("h3")
                    || next3.starts_with("li")
                    || next3.starts_with("tr")
                {
                    if !result.ends_with('\n') {
                        result.push('\n');
                    }
                }
            }
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag && !in_script && !in_style {
            // Decode basic entities
            if ch == '&' {
                let rest: String = chars[i..].iter().take(10).collect();
                if rest.starts_with("&amp;") {
                    result.push('&');
                    i += 5;
                    prev_space = false;
                    continue;
                } else if rest.starts_with("&lt;") {
                    result.push('<');
                    i += 4;
                    prev_space = false;
                    continue;
                } else if rest.starts_with("&gt;") {
                    result.push('>');
                    i += 4;
                    prev_space = false;
                    continue;
                } else if rest.starts_with("&quot;") {
                    result.push('"');
                    i += 6;
                    prev_space = false;
                    continue;
                } else if rest.starts_with("&nbsp;") {
                    result.push(' ');
                    i += 6;
                    prev_space = true;
                    continue;
                }
            }

            if ch.is_whitespace() {
                if !prev_space && !result.is_empty() {
                    result.push(' ');
                    prev_space = true;
                }
            } else {
                result.push(ch);
                prev_space = false;
            }
        }
        i += 1;
    }

    // Clean up: collapse multiple newlines
    let mut clean = String::new();
    let mut prev_newline = 0;
    for line in result.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            prev_newline += 1;
            if prev_newline <= 2 {
                clean.push('\n');
            }
        } else {
            prev_newline = 0;
            clean.push_str(trimmed);
            clean.push('\n');
        }
    }

    clean.trim().to_string()
}

fn extract_title(html: &str) -> String {
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title") {
        if let Some(gt) = lower[start..].find('>') {
            let content_start = start + gt + 1;
            if let Some(end) = lower[content_start..].find("</title>") {
                return html[content_start..content_start + end].trim().to_string();
            }
        }
    }
    String::new()
}

// ============================================================
// Web Search (DuckDuckGo with retry + fallback)
// ============================================================

#[tauri::command]
pub async fn tool_web_search(
    query: String,
    max_results: Option<usize>,
) -> Result<Value, String> {
    let max = max_results.unwrap_or(8).min(20);
    let encoded = urlencoding::encode(&query);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Client error: {e}"))?;

    // Strategy 1: DuckDuckGo HTML search (with retry)
    let mut html = String::new();
    let html_url = format!("https://html.duckduckgo.com/html/?q={encoded}");

    for attempt in 0..2 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        }
        match client.get(&html_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.text().await {
                    html = body;
                    break;
                }
            }
            Ok(resp) => {
                tracing::warn!("DuckDuckGo returned status {}", resp.status());
            }
            Err(e) => {
                tracing::warn!("DuckDuckGo search attempt {attempt} failed: {e}");
            }
        }
    }

    let mut results = Vec::new();

    // Parse results from HTML — try multiple CSS class patterns
    if !html.is_empty() {
        results = parse_ddg_html_results(&html, max);
    }

    // Strategy 2: DuckDuckGo Lite as fallback
    if results.is_empty() {
        let lite_url = format!("https://lite.duckduckgo.com/lite/?q={encoded}");
        if let Ok(resp) = client.get(&lite_url).send().await {
            if let Ok(lite_html) = resp.text().await {
                results = parse_ddg_lite_results(&lite_html, max);
            }
        }
    }

    // Build text summary
    let mut text_summary = String::new();
    for (i, r) in results.iter().enumerate() {
        let title = r["title"].as_str().unwrap_or("");
        let url = r["url"].as_str().unwrap_or("");
        let snippet = r["snippet"].as_str().unwrap_or("");
        text_summary.push_str(&format!("{}. {}\n   {}\n   {}\n\n", i + 1, title, url, snippet));
    }

    Ok(json!({
        "results": results,
        "total_results": results.len(),
        "query": query,
        "text": if results.is_empty() {
            format!("No results found for '{query}'")
        } else {
            text_summary.trim().to_string()
        }
    }))
}

/// Parse DuckDuckGo HTML results — tries multiple class patterns
fn parse_ddg_html_results(html: &str, max: usize) -> Vec<Value> {
    let mut results = Vec::new();

    // Pattern 1: class="result__a" (standard DuckDuckGo HTML)
    let mut pos = 0;
    while results.len() < max {
        let Some(block_start) = html[pos..].find("class=\"result__a\"") else {
            break;
        };
        let block_start = pos + block_start;

        let href = extract_attr(
            &html[block_start.saturating_sub(200)..(block_start + 200).min(html.len())],
            "href",
        );

        let title_text = if let Some(gt) = html[block_start..].find('>') {
            let tstart = block_start + gt + 1;
            if let Some(end) = html[tstart..].find("</a>") {
                html_to_text(&html[tstart..tstart + end])
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let snippet = if let Some(snip_start) = html[block_start..].find("class=\"result__snippet\"") {
            let snip_start = block_start + snip_start;
            if let Some(gt) = html[snip_start..].find('>') {
                let sstart = snip_start + gt + 1;
                if let Some(end) = html[sstart..].find("</a>").or_else(|| html[sstart..].find("</span>")).or_else(|| html[sstart..].find("</td>")) {
                    html_to_text(&html[sstart..sstart + end])
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let actual_url = decode_ddg_url(&href);

        if !title_text.is_empty() {
            results.push(json!({
                "title": title_text,
                "url": actual_url,
                "snippet": snippet,
            }));
        }

        pos = block_start + 100;
    }

    // Pattern 2: class="result-link" (alternative DuckDuckGo layout)
    if results.is_empty() {
        pos = 0;
        while results.len() < max {
            let Some(block_start) = html[pos..].find("class=\"result-link\"") else {
                break;
            };
            let block_start = pos + block_start;

            let href = extract_attr(
                &html[block_start.saturating_sub(200)..(block_start + 200).min(html.len())],
                "href",
            );

            let title_text = if let Some(gt) = html[block_start..].find('>') {
                let tstart = block_start + gt + 1;
                if let Some(end) = html[tstart..].find('<') {
                    html_to_text(&html[tstart..tstart + end])
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let actual_url = decode_ddg_url(&href);

            if !title_text.is_empty() {
                results.push(json!({
                    "title": title_text,
                    "url": actual_url,
                    "snippet": "",
                }));
            }

            pos = block_start + 100;
        }
    }

    results
}

/// Parse DuckDuckGo Lite results (simpler HTML, more reliable)
fn parse_ddg_lite_results(html: &str, max: usize) -> Vec<Value> {
    let mut results = Vec::new();
    let mut pos = 0;

    // Lite format uses <a class="result-link" href="...">title</a>
    // followed by <td class="result-snippet">...</td>
    while results.len() < max {
        // Find links inside result rows
        let search = &html[pos..];
        let Some(link_start) = search.find("class=\"result-link\"")
            .or_else(|| search.find("class='result-link'"))
            .or_else(|| {
                // Fallback: find any http link in a table row
                let td_pos = search.find("<td")?;
                let href_pos = search[td_pos..].find("href=\"http")?;
                Some(td_pos + href_pos)
            })
        else {
            break;
        };
        let abs_start = pos + link_start;

        let href = extract_attr(
            &html[abs_start.saturating_sub(50)..(abs_start + 500).min(html.len())],
            "href",
        );

        let title_text = if let Some(gt) = html[abs_start..].find('>') {
            let tstart = abs_start + gt + 1;
            if let Some(end) = html[tstart..].find("</a>") {
                html_to_text(&html[tstart..tstart + end])
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let actual_url = decode_ddg_url(&href);
        if actual_url.starts_with("http") && !title_text.is_empty() {
            results.push(json!({
                "title": title_text,
                "url": actual_url,
                "snippet": "",
            }));
        }

        pos = abs_start + 100;
    }

    results
}

fn extract_attr(html: &str, attr: &str) -> String {
    let pattern = format!("{attr}=\"");
    if let Some(start) = html.find(&pattern) {
        let vstart = start + pattern.len();
        if let Some(end) = html[vstart..].find('"') {
            return html[vstart..vstart + end].to_string();
        }
    }
    String::new()
}

fn decode_ddg_url(url: &str) -> String {
    // DuckDuckGo uses //duckduckgo.com/l/?uddg=ENCODED_URL&...
    if let Some(uddg_pos) = url.find("uddg=") {
        let start = uddg_pos + 5;
        let end = url[start..]
            .find('&')
            .map(|p| start + p)
            .unwrap_or(url.len());
        urlencoding::decode(&url[start..end])
            .map(|s| s.to_string())
            .unwrap_or_else(|_| url.to_string())
    } else if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.to_string()
    }
}

// ============================================================
// Git Status
// ============================================================

#[tauri::command]
pub async fn tool_git_status(
    path: Option<String>,
) -> Result<Value, String> {
    let cwd = path.unwrap_or_else(|| ".".to_string());
    run_git_command(&["status", "--porcelain", "-b"], &cwd).await
}

// ============================================================
// Git Diff
// ============================================================

#[tauri::command]
pub async fn tool_git_diff(
    path: Option<String>,
    staged: Option<bool>,
    file_path: Option<String>,
) -> Result<Value, String> {
    let cwd = path.unwrap_or_else(|| ".".to_string());
    let mut args = vec!["diff"];
    if staged.unwrap_or(false) {
        args.push("--cached");
    }
    if let Some(ref fp) = file_path {
        args.push("--");
        args.push(fp);
    }
    run_git_command(&args, &cwd).await
}

// ============================================================
// Git Log
// ============================================================

#[tauri::command]
pub async fn tool_git_log(
    path: Option<String>,
    max_count: Option<usize>,
    oneline: Option<bool>,
) -> Result<Value, String> {
    let cwd = path.unwrap_or_else(|| ".".to_string());
    let count_str = format!("-{}", max_count.unwrap_or(10).min(50));
    let mut args = vec!["log", &count_str];
    if oneline.unwrap_or(true) {
        args.push("--oneline");
    }
    run_git_command(&args, &cwd).await
}

// ============================================================
// Git Commit (stage + commit)
// ============================================================

#[tauri::command]
pub async fn tool_git_commit(
    message: String,
    path: Option<String>,
    files: Option<Vec<String>>,
) -> Result<Value, String> {
    let cwd = path.unwrap_or_else(|| ".".to_string());

    // Stage files
    if let Some(ref file_list) = files {
        for f in file_list {
            run_git_command(&["add", f.as_str()], &cwd).await?;
        }
    } else {
        // Stage all
        run_git_command(&["add", "-A"], &cwd).await?;
    }

    // Commit
    run_git_command(&["commit", "-m", &message], &cwd).await
}

async fn run_git_command(args: &[&str], cwd: &str) -> Result<Value, String> {
    let output = tokio::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| format!("Git command failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "command": format!("git {}", args.join(" ")),
        "text": if exit_code == 0 { stdout } else { format!("Error (exit {}): {}{}", exit_code, stdout, stderr) }
    }))
}

// ============================================================
// Context Memory (persistent agent memory)
// ============================================================

#[tauri::command]
pub async fn tool_memory_read(
    key: Option<String>,
) -> Result<Value, String> {
    let memory_dir = get_memory_dir()?;

    if let Some(k) = key {
        let path = memory_dir.join(format!("{k}.json"));
        if path.exists() {
            let content = tokio::fs::read_to_string(&path)
                .await
                .map_err(|e| e.to_string())?;
            let value: Value = serde_json::from_str(&content).unwrap_or(json!(content));
            Ok(json!({
                "key": k,
                "value": value,
                "text": format!("Memory '{k}': {content}")
            }))
        } else {
            Ok(json!({
                "key": k,
                "value": null,
                "text": format!("No memory found for key '{k}'")
            }))
        }
    } else {
        // List all memory keys
        let mut keys = Vec::new();
        if let Ok(mut entries) = tokio::fs::read_dir(&memory_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".json") {
                    keys.push(name.trim_end_matches(".json").to_string());
                }
            }
        }
        let text = if keys.is_empty() {
            "No memories stored".to_string()
        } else {
            format!("Stored memories: {}", keys.join(", "))
        };
        Ok(json!({ "keys": keys, "text": text }))
    }
}

#[tauri::command]
pub async fn tool_memory_write(
    key: String,
    value: Value,
) -> Result<Value, String> {
    let memory_dir = get_memory_dir()?;
    tokio::fs::create_dir_all(&memory_dir)
        .await
        .map_err(|e| e.to_string())?;

    let path = memory_dir.join(format!("{key}.json"));
    let content = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "success": true,
        "key": key,
        "text": format!("Saved memory '{key}'")
    }))
}

fn get_memory_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .map(|p| PathBuf::from(p).join("Handbox").join("agent_memory"))
            .map_err(|_| "APPDATA not found".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_dir()
            .map(|p| p.join("handbox").join("agent_memory"))
            .ok_or_else(|| "Data dir not found".to_string())
    }
}

// ============================================================
// Web Crawling — recursive BFS crawl with DOM parsing
// ============================================================

pub async fn tool_web_crawl(
    url: String,
    max_depth: Option<usize>,
    max_pages: Option<usize>,
    selector: Option<String>,
    follow_pattern: Option<String>,
    _respect_robots: Option<bool>,
) -> Result<Value, String> {
    use scraper::{Html, Selector};
    use std::collections::{HashSet, VecDeque};

    let max_depth = max_depth.unwrap_or(2);
    let max_pages = max_pages.unwrap_or(10);
    let content_selector = selector.unwrap_or_else(|| "body".to_string());
    let follow_regex = follow_pattern.as_ref().and_then(|p| regex_lite::Regex::new(p).ok());

    let base_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let base_domain = base_url.host_str().unwrap_or("").to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Handbox/2.0 Research Crawler")
        .build()
        .map_err(|e| format!("Client build failed: {e}"))?;

    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<(String, usize)> = VecDeque::new();
    let mut results: Vec<Value> = Vec::new();

    queue.push_back((url.clone(), 0));
    visited.insert(url.clone());

    while let Some((current_url, depth)) = queue.pop_front() {
        if results.len() >= max_pages { break; }

        let response = match client.get(&current_url).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let document = Html::parse_document(&body);

        // Extract content via selector
        let content = if let Ok(sel) = Selector::parse(&content_selector) {
            document.select(&sel)
                .map(|el| el.text().collect::<Vec<_>>().join(" "))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            document.root_element().text().collect::<Vec<_>>().join(" ")
        };

        // Extract title
        let title = Selector::parse("title").ok()
            .and_then(|sel| document.select(&sel).next())
            .map(|el| el.text().collect::<String>())
            .unwrap_or_default();

        // Extract links for further crawling
        let mut links_found = Vec::new();
        if depth < max_depth {
            if let Ok(a_sel) = Selector::parse("a[href]") {
                for el in document.select(&a_sel) {
                    if let Some(href) = el.value().attr("href") {
                        let resolved = base_url.join(href).ok();
                        if let Some(link_url) = resolved {
                            let link_str = link_url.to_string();
                            let same_domain = link_url.host_str() == Some(base_domain.as_str());
                            let matches_pattern = follow_regex.as_ref()
                                .map(|r| r.is_match(&link_str))
                                .unwrap_or(true);
                            if same_domain && matches_pattern && !visited.contains(&link_str) {
                                visited.insert(link_str.clone());
                                links_found.push(link_str.clone());
                                queue.push_back((link_str, depth + 1));
                            }
                        }
                    }
                }
            }
        }

        // Truncate content to reasonable size
        let content_truncated = if content.len() > 5000 {
            format!("{}... [truncated]", &content[..5000])
        } else {
            content
        };

        results.push(json!({
            "url": current_url,
            "title": title,
            "status": status,
            "content": content_truncated,
            "links_found": links_found.len(),
            "depth": depth,
        }));
    }

    let summary = format!("Crawled {} pages from {}", results.len(), base_domain);
    Ok(json!({
        "pages": results,
        "total_pages": results.len(),
        "text": summary,
    }))
}

// ============================================================
// File Download — download URL to local file
// ============================================================

pub async fn tool_file_download(
    url: String,
    output_path: Option<String>,
    _overwrite: Option<bool>,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client build failed: {e}"))?;

    let response = client.get(&url).send().await
        .map_err(|e| format!("Download failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}: download failed", status));
    }

    // Determine filename
    let content_type = response.headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let filename = output_path.unwrap_or_else(|| {
        // Try Content-Disposition header
        response.headers()
            .get("content-disposition")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| {
                s.split("filename=").nth(1)
                    .map(|f| f.trim_matches('"').to_string())
            })
            .unwrap_or_else(|| {
                // Fallback: extract from URL path
                url::Url::parse(&url).ok()
                    .and_then(|u| u.path_segments()?.last().map(|s| s.to_string()))
                    .unwrap_or_else(|| "download".to_string())
            })
    });

    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response body: {e}"))?;
    let size = bytes.len();

    tokio::fs::write(&filename, &bytes).await
        .map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(json!({
        "path": filename,
        "size_bytes": size,
        "content_type": content_type,
        "text": format!("Downloaded {} ({} bytes) to {}", url, size, filename),
    }))
}

// ============================================================
// Archive — compress/decompress ZIP and tar.gz
// ============================================================

pub async fn tool_archive_compress(
    source_path: String,
    output_path: String,
    format: Option<String>,
) -> Result<Value, String> {
    let fmt = format.unwrap_or_else(|| {
        if output_path.ends_with(".tar.gz") || output_path.ends_with(".tgz") {
            "tar.gz".to_string()
        } else {
            "zip".to_string()
        }
    });

    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source path not found: {source_path}"));
    }

    match fmt.as_str() {
        "zip" => {
            let file = std::fs::File::create(&output_path)
                .map_err(|e| format!("Cannot create output: {e}"))?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            if source.is_dir() {
                fn add_dir(zip: &mut zip::ZipWriter<std::fs::File>, base: &std::path::Path, current: &std::path::Path, opts: zip::write::SimpleFileOptions) -> Result<(), String> {
                    for entry in std::fs::read_dir(current).map_err(|e| e.to_string())? {
                        let entry = entry.map_err(|e| e.to_string())?;
                        let path = entry.path();
                        let rel = path.strip_prefix(base).unwrap_or(&path);
                        let name = rel.to_string_lossy().replace('\\', "/");
                        if path.is_dir() {
                            zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
                            add_dir(zip, base, &path, opts)?;
                        } else {
                            zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                            let data = std::fs::read(&path).map_err(|e| e.to_string())?;
                            std::io::Write::write_all(zip, &data).map_err(|e| e.to_string())?;
                        }
                    }
                    Ok(())
                }
                add_dir(&mut zip, source, source, options)?;
            } else {
                let name = source.file_name().unwrap_or_default().to_string_lossy();
                zip.start_file(name.as_ref(), options).map_err(|e| e.to_string())?;
                let data = std::fs::read(source).map_err(|e| e.to_string())?;
                std::io::Write::write_all(&mut zip, &data).map_err(|e| e.to_string())?;
            }
            zip.finish().map_err(|e| e.to_string())?;
        }
        "tar.gz" | "tgz" => {
            let file = std::fs::File::create(&output_path)
                .map_err(|e| format!("Cannot create output: {e}"))?;
            let enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
            let mut tar = tar::Builder::new(enc);

            if source.is_dir() {
                tar.append_dir_all(".", source).map_err(|e| e.to_string())?;
            } else {
                let name = source.file_name().unwrap_or_default();
                tar.append_path_with_name(source, name).map_err(|e| e.to_string())?;
            }
            tar.into_inner().map_err(|e| e.to_string())?
                .finish().map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported format: {fmt}. Use 'zip' or 'tar.gz'.")),
    }

    let size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    Ok(json!({
        "path": output_path,
        "format": fmt,
        "size_bytes": size,
        "text": format!("Compressed {} → {} ({} bytes)", source_path, output_path, size),
    }))
}

pub async fn tool_archive_decompress(
    archive_path: String,
    output_dir: Option<String>,
) -> Result<Value, String> {
    let archive = std::path::Path::new(&archive_path);
    if !archive.exists() {
        return Err(format!("Archive not found: {archive_path}"));
    }

    let out_dir = output_dir.unwrap_or_else(|| {
        archive.parent().map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string())
    });
    tokio::fs::create_dir_all(&out_dir).await.map_err(|e| e.to_string())?;

    let ext = archive_path.to_lowercase();
    let mut extracted_files = Vec::new();

    if ext.ends_with(".zip") {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            let out_path = std::path::Path::new(&out_dir).join(&name);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
                extracted_files.push(name);
            }
        }
    } else if ext.ends_with(".tar.gz") || ext.ends_with(".tgz") {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let dec = flate2::read::GzDecoder::new(file);
        let mut tar = tar::Archive::new(dec);
        for entry in tar.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
            let name = path.to_string_lossy().to_string();
            entry.unpack_in(&out_dir).map_err(|e| e.to_string())?;
            extracted_files.push(name);
        }
    } else {
        return Err(format!("Unsupported archive format. Use .zip or .tar.gz"));
    }

    Ok(json!({
        "output_dir": out_dir,
        "files": extracted_files,
        "total_files": extracted_files.len(),
        "text": format!("Extracted {} files to {}", extracted_files.len(), out_dir),
    }))
}

pub async fn tool_archive_list(
    archive_path: String,
) -> Result<Value, String> {
    let archive = std::path::Path::new(&archive_path);
    if !archive.exists() {
        return Err(format!("Archive not found: {archive_path}"));
    }

    let ext = archive_path.to_lowercase();
    let mut entries = Vec::new();

    if ext.ends_with(".zip") {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let entry = zip.by_index_raw(i).map_err(|e| e.to_string())?;
            entries.push(json!({
                "name": entry.name(),
                "size": entry.size(),
                "compressed_size": entry.compressed_size(),
                "is_dir": entry.is_dir(),
            }));
        }
    } else if ext.ends_with(".tar.gz") || ext.ends_with(".tgz") {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let dec = flate2::read::GzDecoder::new(file);
        let mut tar = tar::Archive::new(dec);
        for entry in tar.entries().map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path().map_err(|e| e.to_string())?;
            entries.push(json!({
                "name": path.to_string_lossy(),
                "size": entry.size(),
                "is_dir": entry.header().entry_type().is_dir(),
            }));
        }
    } else {
        return Err("Unsupported archive format".to_string());
    }

    Ok(json!({
        "entries": entries,
        "total": entries.len(),
        "text": format!("{} entries in {}", entries.len(), archive_path),
    }))
}

// ============================================================
// Database — SQLite + PostgreSQL query execution
// ============================================================

pub async fn tool_db_query(
    db_type: String,
    connection: String,
    query: String,
    params: Option<Vec<Value>>,
) -> Result<Value, String> {
    // Safety check for destructive queries
    let query_upper = query.to_uppercase();
    let dangerous = ["DROP TABLE", "DROP DATABASE", "TRUNCATE", "DELETE FROM", "ALTER TABLE"];
    for pattern in &dangerous {
        if query_upper.contains(pattern) {
            return Err(format!("Dangerous SQL operation blocked: {pattern}. Use with caution."));
        }
    }

    match db_type.as_str() {
        "sqlite" => {
            let conn = rusqlite::Connection::open(&connection)
                .map_err(|e| format!("SQLite open failed: {e}"))?;

            let mut stmt = conn.prepare(&query)
                .map_err(|e| format!("SQL prepare failed: {e}"))?;

            let column_count = stmt.column_count();
            let column_names: Vec<String> = (0..column_count)
                .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
                .collect();

            let param_values: Vec<Box<dyn rusqlite::types::ToSql>> = params.as_ref()
                .map(|p| p.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
                    match v {
                        Value::String(s) => Box::new(s.clone()),
                        Value::Number(n) => {
                            if let Some(i) = n.as_i64() { Box::new(i) }
                            else if let Some(f) = n.as_f64() { Box::new(f) }
                            else { Box::new(n.to_string()) }
                        }
                        Value::Bool(b) => Box::new(*b),
                        Value::Null => Box::new(rusqlite::types::Null),
                        _ => Box::new(v.to_string()),
                    }
                }).collect())
                .unwrap_or_default();

            let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

            // Check if it's a SELECT-like query
            if query_upper.trim_start().starts_with("SELECT") || query_upper.trim_start().starts_with("PRAGMA") {
                let rows: Vec<Value> = stmt.query_map(param_refs.as_slice(), |row| {
                    let mut obj = serde_json::Map::new();
                    for (i, name) in column_names.iter().enumerate() {
                        let val: rusqlite::Result<Value> = row.get::<_, String>(i)
                            .map(Value::String)
                            .or_else(|_| row.get::<_, i64>(i).map(|n| json!(n)))
                            .or_else(|_| row.get::<_, f64>(i).map(|n| json!(n)))
                            .or_else(|_| row.get::<_, bool>(i).map(|b| json!(b)))
                            .or_else(|_| Ok(Value::Null));
                        obj.insert(name.clone(), val.unwrap_or(Value::Null));
                    }
                    Ok(Value::Object(obj))
                }).map_err(|e| format!("Query failed: {e}"))?
                .filter_map(|r| r.ok())
                .collect();

                let row_count = rows.len();
                Ok(json!({
                    "columns": column_names,
                    "rows": rows,
                    "row_count": row_count,
                    "text": format!("Query returned {} rows", row_count),
                }))
            } else {
                let affected = stmt.execute(param_refs.as_slice())
                    .map_err(|e| format!("Execute failed: {e}"))?;
                Ok(json!({
                    "affected_rows": affected,
                    "text": format!("Executed: {} rows affected", affected),
                }))
            }
        }
        "postgres" | "postgresql" => {
            let (client, connection) = tokio_postgres::connect(&connection, tokio_postgres::NoTls)
                .await
                .map_err(|e| format!("PostgreSQL connect failed: {e}"))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!("PostgreSQL connection error: {e}");
                }
            });

            let rows = client.query(&query, &[])
                .await
                .map_err(|e| format!("Query failed: {e}"))?;

            let mut result_rows = Vec::new();
            for row in &rows {
                let mut obj = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let val: Value = if let Ok(v) = row.try_get::<_, String>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<_, i64>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<_, f64>(i) {
                        json!(v)
                    } else if let Ok(v) = row.try_get::<_, bool>(i) {
                        json!(v)
                    } else {
                        Value::Null
                    };
                    obj.insert(col.name().to_string(), val);
                }
                result_rows.push(Value::Object(obj));
            }

            let row_count = result_rows.len();
            Ok(json!({
                "rows": result_rows,
                "row_count": row_count,
                "text": format!("Query returned {} rows", row_count),
            }))
        }
        _ => Err(format!("Unsupported database type: {db_type}. Use 'sqlite' or 'postgres'.")),
    }
}

pub async fn tool_db_schema(
    db_type: String,
    connection: String,
) -> Result<Value, String> {
    match db_type.as_str() {
        "sqlite" => {
            let conn = rusqlite::Connection::open(&connection)
                .map_err(|e| format!("SQLite open failed: {e}"))?;

            let mut stmt = conn.prepare(
                "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
            ).map_err(|e| e.to_string())?;

            let tables: Vec<Value> = stmt.query_map([], |row| {
                Ok(json!({
                    "name": row.get::<_, String>(0)?,
                    "type": row.get::<_, String>(1)?,
                    "sql": row.get::<_, String>(2).unwrap_or_default(),
                }))
            }).map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

            Ok(json!({
                "tables": tables,
                "db_type": "sqlite",
                "text": format!("SQLite schema: {} tables/views", tables.len()),
            }))
        }
        "postgres" | "postgresql" => {
            let (client, connection) = tokio_postgres::connect(&connection, tokio_postgres::NoTls)
                .await
                .map_err(|e| format!("PostgreSQL connect failed: {e}"))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!("PostgreSQL connection error: {e}");
                }
            });

            let rows = client.query(
                "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
                &[],
            ).await.map_err(|e| e.to_string())?;

            let tables: Vec<Value> = rows.iter().map(|row| {
                json!({
                    "name": row.get::<_, String>(0),
                    "type": row.get::<_, String>(1),
                })
            }).collect();

            Ok(json!({
                "tables": tables,
                "db_type": "postgres",
                "text": format!("PostgreSQL schema: {} tables", tables.len()),
            }))
        }
        _ => Err(format!("Unsupported database type: {db_type}")),
    }
}

// ============================================================
// Python Runtime — execute Python scripts
// ============================================================

pub async fn tool_python_execute(
    script: String,
    working_dir: Option<String>,
    timeout_ms: Option<u64>,
    capture_files: Option<Vec<String>>,
) -> Result<Value, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000));

    // Write script to temp file
    let temp_dir = std::env::temp_dir();
    let script_name = format!("hb_python_{}.py", uuid::Uuid::new_v4().simple());
    let script_path = temp_dir.join(&script_name);
    tokio::fs::write(&script_path, &script).await
        .map_err(|e| format!("Failed to write temp script: {e}"))?;

    // Determine python command (python3 on Unix, python on Windows)
    let python_cmd = if cfg!(windows) { "python" } else { "python3" };

    let mut cmd = tokio::process::Command::new(python_cmd);
    cmd.arg(&script_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    if let Some(ref wd) = working_dir {
        cmd.current_dir(wd);
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn Python: {e}. Is Python installed?"))?;

    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| "Python script timed out")?
        .map_err(|e| format!("Python execution failed: {e}"))?;

    // Cleanup temp script
    let _ = tokio::fs::remove_file(&script_path).await;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    // Capture generated files as base64
    let mut captured = Vec::new();
    if let Some(files) = capture_files {
        for file_path in files {
            if let Ok(data) = tokio::fs::read(&file_path).await {
                let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
                captured.push(json!({
                    "path": file_path,
                    "size": data.len(),
                    "base64": b64,
                }));
            }
        }
    }

    let text = if exit_code == 0 {
        if stdout.is_empty() { "(no output)".to_string() } else { stdout.clone() }
    } else {
        format!("Exit code {exit_code}\nstdout:\n{stdout}\nstderr:\n{stderr}")
    };

    Ok(json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "captured_files": captured,
        "text": text,
    }))
}

// ============================================================
// Clipboard — read/write system clipboard
// ============================================================

pub async fn tool_clipboard_read() -> Result<Value, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Clipboard access failed: {e}"))?;

    if let Ok(text) = clipboard.get_text() {
        return Ok(json!({
            "type": "text",
            "content": text,
            "text": format!("Clipboard: {} chars", text.len()),
        }));
    }

    Ok(json!({
        "type": "empty",
        "content": "",
        "text": "Clipboard is empty",
    }))
}

pub async fn tool_clipboard_write(
    content: String,
) -> Result<Value, String> {
    let len = content.len();
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Clipboard access failed: {e}"))?;

    clipboard.set_text(&content)
        .map_err(|e| format!("Clipboard write failed: {e}"))?;

    Ok(json!({
        "success": true,
        "text": format!("Copied {} chars to clipboard", len),
    }))
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- HTML processing tests ---

    #[test]
    fn test_html_to_text_basic() {
        let html = "<p>Hello <b>world</b></p>";
        let text = html_to_text(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("world"));
    }

    #[test]
    fn test_html_to_text_strips_script_and_style() {
        let html = "<html><script>var x = 1;</script><style>.a{color:red}</style><p>Content</p></html>";
        let text = html_to_text(html);
        assert!(!text.contains("var x"));
        assert!(!text.contains("color:red"));
        assert!(text.contains("Content"));
    }

    #[test]
    fn test_html_to_text_entity_decoding() {
        let html = "A &amp; B &lt; C &gt; D &quot;E&quot;";
        let text = html_to_text(html);
        assert!(text.contains("A & B"));
        assert!(text.contains("< C >"));
        assert!(text.contains("\"E\""));
    }

    #[test]
    fn test_html_to_text_empty() {
        assert_eq!(html_to_text(""), "");
    }

    #[test]
    fn test_extract_title() {
        assert_eq!(extract_title("<html><title>Hello World</title></html>"), "Hello World");
        assert_eq!(extract_title("<html><body>No title</body></html>"), "");
    }

    #[test]
    fn test_extract_title_with_attrs() {
        assert_eq!(
            extract_title("<html><title lang=\"en\">My Page</title></html>"),
            "My Page"
        );
    }

    // --- URL handling tests ---

    #[test]
    fn test_decode_ddg_url_with_uddg() {
        let url = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=abc";
        assert_eq!(decode_ddg_url(url), "https://example.com");
    }

    #[test]
    fn test_decode_ddg_url_plain() {
        let url = "https://example.com";
        assert_eq!(decode_ddg_url(url), "https://example.com");
    }

    #[test]
    fn test_decode_ddg_url_protocol_relative() {
        let url = "//example.com/path";
        assert_eq!(decode_ddg_url(url), "https://example.com/path");
    }

    #[test]
    fn test_extract_attr() {
        let html = r#"<a href="https://example.com" class="link">"#;
        assert_eq!(extract_attr(html, "href"), "https://example.com");
        assert_eq!(extract_attr(html, "class"), "link");
        assert_eq!(extract_attr(html, "id"), "");
    }

    // --- Glob matching tests ---

    #[test]
    fn test_glob_match_extension() {
        assert!(glob_match("*.rs", "main.rs"));
        assert!(glob_match("*.rs", "lib.rs"));
        assert!(!glob_match("*.rs", "main.ts"));
        assert!(!glob_match("*.rs", "rs"));
    }

    #[test]
    fn test_glob_match_contains() {
        assert!(glob_match("test", "test_file.rs"));
        assert!(glob_match("test", "my_test.ts"));
        assert!(!glob_match("test", "prod.rs"));
    }

    // --- Binary extension detection ---

    #[test]
    fn test_is_binary_extension() {
        assert!(is_binary_extension("image.png"));
        assert!(is_binary_extension("doc.pdf"));
        assert!(is_binary_extension("lib.dll"));
        assert!(is_binary_extension("app.exe"));
        assert!(is_binary_extension("data.sqlite3"));
        assert!(!is_binary_extension("main.rs"));
        assert!(!is_binary_extension("index.ts"));
        assert!(!is_binary_extension("README.md"));
        assert!(!is_binary_extension("Cargo.toml"));
        assert!(!is_binary_extension("noext"));
    }

    // --- File operations tests (async) ---

    #[tokio::test]
    async fn test_file_write_and_read() {
        let dir = std::env::temp_dir().join("handbox_test_rw");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let path = dir.join("test_file.txt");

        // Write
        let write_result = tool_file_write(
            path.to_string_lossy().to_string(),
            "line1\nline2\nline3\n".to_string(),
            Some(true),
        ).await;
        assert!(write_result.is_ok());
        let wr = write_result.unwrap();
        assert_eq!(wr["success"].as_bool(), Some(true));
        assert_eq!(wr["lines"].as_u64(), Some(3));

        // Read
        let read_result = tool_file_read(
            path.to_string_lossy().to_string(),
            None,
            None,
        ).await;
        assert!(read_result.is_ok());
        let rr = read_result.unwrap();
        assert_eq!(rr["total_lines"].as_u64(), Some(3));
        assert!(rr["text"].as_str().unwrap().contains("line1"));
        assert!(rr["text"].as_str().unwrap().contains("line2"));

        // Read with offset
        let read_offset = tool_file_read(
            path.to_string_lossy().to_string(),
            Some(1),
            Some(1),
        ).await;
        assert!(read_offset.is_ok());
        let ro = read_offset.unwrap();
        assert_eq!(ro["lines_shown"].as_u64(), Some(1));
        assert!(ro["text"].as_str().unwrap().contains("line2"));

        // Cleanup
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_file_read_not_found() {
        let result = tool_file_read("/nonexistent/path/file.txt".to_string(), None, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_file_edit_find_replace() {
        let dir = std::env::temp_dir().join("handbox_test_edit");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let path = dir.join("edit_test.txt");

        // Write initial content
        tool_file_write(
            path.to_string_lossy().to_string(),
            "Hello world\nGoodbye world\n".to_string(),
            Some(true),
        ).await.unwrap();

        // Single replace
        let edit_result = tool_file_edit(
            path.to_string_lossy().to_string(),
            "Hello".to_string(),
            "Hi".to_string(),
            None,
        ).await;
        assert!(edit_result.is_ok());

        // Verify
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert!(content.contains("Hi world"));
        assert!(content.contains("Goodbye world"));

        // Edit not found
        let edit_nf = tool_file_edit(
            path.to_string_lossy().to_string(),
            "NOTEXIST".to_string(),
            "X".to_string(),
            None,
        ).await;
        assert!(edit_nf.is_err());
        assert!(edit_nf.unwrap_err().contains("not found"));

        // Multiple occurrences without replace_all should error
        tool_file_write(
            path.to_string_lossy().to_string(),
            "AAA BBB AAA\n".to_string(),
            Some(true),
        ).await.unwrap();
        let edit_multi = tool_file_edit(
            path.to_string_lossy().to_string(),
            "AAA".to_string(),
            "CCC".to_string(),
            Some(false),
        ).await;
        assert!(edit_multi.is_err());
        assert!(edit_multi.unwrap_err().contains("2 times"));

        // replace_all should work
        let edit_all = tool_file_edit(
            path.to_string_lossy().to_string(),
            "AAA".to_string(),
            "CCC".to_string(),
            Some(true),
        ).await;
        assert!(edit_all.is_ok());
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert_eq!(content, "CCC BBB CCC\n");

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_file_edit_empty_old_string_rejected() {
        let dir = std::env::temp_dir().join("handbox_test_edit_empty");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let path = dir.join("test.txt");

        tool_file_write(
            path.to_string_lossy().to_string(),
            "Hello world\n".to_string(),
            Some(true),
        ).await.unwrap();

        // Empty old_string must be rejected
        let result = tool_file_edit(
            path.to_string_lossy().to_string(),
            "".to_string(),
            "REPLACED".to_string(),
            None,
        ).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));

        // File should be unchanged
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert_eq!(content, "Hello world\n");

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_file_edit_lines() {
        let dir = std::env::temp_dir().join("handbox_test_editlines");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let path = dir.join("lines_test.txt");

        tool_file_write(
            path.to_string_lossy().to_string(),
            "line1\nline2\nline3\nline4\nline5\n".to_string(),
            Some(true),
        ).await.unwrap();

        // Replace line 2
        let result = tool_file_edit_lines(
            path.to_string_lossy().to_string(),
            2,
            Some(2),
            "REPLACED".to_string(),
        ).await;
        assert!(result.is_ok());

        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert!(content.contains("line1\n"));
        assert!(content.contains("REPLACED\n"));
        assert!(content.contains("line3\n"));
        assert!(!content.contains("line2"));

        // Replace lines 3-4 with single line
        let result = tool_file_edit_lines(
            path.to_string_lossy().to_string(),
            3,
            Some(4),
            "MERGED".to_string(),
        ).await;
        assert!(result.is_ok());
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert!(content.contains("MERGED\n"));
        assert!(!content.contains("line3"));
        assert!(!content.contains("line4"));

        // Delete line (empty new_text)
        let result = tool_file_edit_lines(
            path.to_string_lossy().to_string(),
            2,
            Some(2),
            "".to_string(),
        ).await;
        assert!(result.is_ok());
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert!(!content.contains("REPLACED"));

        // Out of range
        let result = tool_file_edit_lines(
            path.to_string_lossy().to_string(),
            0,
            None,
            "X".to_string(),
        ).await;
        assert!(result.is_err());

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_bash_execute() {
        // Simple echo command
        let result = tool_bash_execute(
            "echo hello".to_string(),
            None,
            Some(5000),
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["exit_code"].as_i64(), Some(0));
        assert!(r["stdout"].as_str().unwrap().contains("hello"));
    }

    #[tokio::test]
    async fn test_bash_execute_exit_code() {
        // Failing command
        let result = tool_bash_execute(
            "exit 42".to_string(),
            None,
            Some(5000),
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["exit_code"].as_i64(), Some(42));
    }

    #[tokio::test]
    async fn test_grep_search() {
        let dir = std::env::temp_dir().join("handbox_test_grep");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        tokio::fs::create_dir_all(&dir).await.unwrap();

        // Create test files
        tokio::fs::write(dir.join("a.txt"), "Hello world\nGoodbye world\nFoo bar\n").await.unwrap();
        tokio::fs::write(dir.join("b.rs"), "fn main() {\n    println!(\"world\");\n}\n").await.unwrap();

        // Search for "world"
        let result = tool_grep_search(
            "world".to_string(),
            Some(dir.to_string_lossy().to_string()),
            None,
            Some(50),
            None,
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert!(r["total_matches"].as_u64().unwrap() >= 3);

        // Search with glob filter
        let result = tool_grep_search(
            "world".to_string(),
            Some(dir.to_string_lossy().to_string()),
            Some("*.rs".to_string()),
            Some(50),
            None,
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["total_matches"].as_u64(), Some(1));

        // Search with no matches
        let result = tool_grep_search(
            "ZZZZNOTEXIST".to_string(),
            Some(dir.to_string_lossy().to_string()),
            None,
            None,
            None,
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["total_matches"].as_u64(), Some(0));

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_glob_search() {
        let dir = std::env::temp_dir().join("handbox_test_glob");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let sub = dir.join("sub");
        tokio::fs::create_dir_all(&sub).await.unwrap();
        tokio::fs::write(dir.join("a.rs"), "rust").await.unwrap();
        tokio::fs::write(dir.join("b.ts"), "ts").await.unwrap();
        tokio::fs::write(sub.join("c.rs"), "rust2").await.unwrap();

        let result = tool_glob_search(
            "*.rs".to_string(),
            Some(dir.to_string_lossy().to_string()),
            None,
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["total"].as_u64(), Some(2)); // a.rs + sub/c.rs

        let result = tool_glob_search(
            "*.ts".to_string(),
            Some(dir.to_string_lossy().to_string()),
            None,
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["total"].as_u64(), Some(1)); // b.ts

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_project_tree() {
        let dir = std::env::temp_dir().join("handbox_test_tree");
        let _ = tokio::fs::remove_dir_all(&dir).await;
        let sub = dir.join("subdir");
        tokio::fs::create_dir_all(&sub).await.unwrap();
        tokio::fs::write(dir.join("file1.txt"), "content").await.unwrap();
        tokio::fs::write(sub.join("file2.rs"), "fn main() {}").await.unwrap();

        let result = tool_project_tree(
            Some(dir.to_string_lossy().to_string()),
            Some(3),
            Some(100),
        ).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        let tree = r["tree"].as_str().unwrap();
        assert!(tree.contains("subdir/"));
        assert!(tree.contains("file1.txt"));
        assert!(tree.contains("file2.rs"));

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn test_git_status() {
        // Run git status in the project root (should work since we're in a git repo)
        let result = tool_git_status(Some(".".to_string())).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r["exit_code"].as_i64(), Some(0));
    }

    #[tokio::test]
    async fn test_memory_write_and_read() {
        // Write memory
        let wr = tool_memory_write(
            "test_key_12345".to_string(),
            serde_json::json!({"hello": "world", "count": 42}),
        ).await;
        assert!(wr.is_ok());
        assert_eq!(wr.unwrap()["success"].as_bool(), Some(true));

        // Read memory
        let rr = tool_memory_read(Some("test_key_12345".to_string())).await;
        assert!(rr.is_ok());
        let rr = rr.unwrap();
        assert_eq!(rr["value"]["hello"].as_str(), Some("world"));
        assert_eq!(rr["value"]["count"].as_i64(), Some(42));

        // Read non-existent
        let rr = tool_memory_read(Some("nonexistent_key_xyz".to_string())).await;
        assert!(rr.is_ok());
        assert!(rr.unwrap()["value"].is_null());

        // List keys
        let rr = tool_memory_read(None).await;
        assert!(rr.is_ok());
        let keys = rr.unwrap()["keys"].as_array().unwrap().clone();
        let key_strs: Vec<&str> = keys.iter().filter_map(|k| k.as_str()).collect();
        assert!(key_strs.contains(&"test_key_12345"));

        // Cleanup
        let memory_dir = get_memory_dir().unwrap();
        let _ = tokio::fs::remove_file(memory_dir.join("test_key_12345.json")).await;
    }
}
