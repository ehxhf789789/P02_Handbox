# Handbox: Claude Code Level Architecture

## 목표
Claude Code가 제공하는 기능을 Handbox 워크플로우로 구현 가능하게 만들기

## Claude Code 핵심 기능 분석

### 1. Tool Capabilities
| Tool | 기능 | Handbox 구현 |
|------|------|-------------|
| Read | 파일 읽기 (이미지, PDF 포함) | ✅ file-read, pdf-read |
| Write | 파일 생성 | ✅ file-write |
| Edit | 정밀한 파일 수정 (old_string → new_string) | ⚠️ 구현 필요 |
| Glob | 파일 패턴 검색 | ⚠️ 구현 필요 |
| Grep | 코드 내용 검색 | ⚠️ 구현 필요 |
| Bash | 셸 명령 실행 | ⚠️ 구현 필요 |
| WebSearch | 웹 검색 | ⚠️ 구현 필요 |
| WebFetch | URL 콘텐츠 가져오기 | ⚠️ 구현 필요 |
| Task | 서브 에이전트 생성 | ⚠️ 구현 필요 |

### 2. Agent Loop (가장 중요)

```rust
// hb-agent/src/agent_loop.rs
pub struct AgentLoop {
    planner: LLMPlanner,
    executor: ToolExecutor,
    memory: ContextMemory,
    max_turns: usize,
}

impl AgentLoop {
    pub async fn run(&mut self, initial_prompt: &str) -> AgentResult {
        let mut context = Context::new(initial_prompt);

        for turn in 0..self.max_turns {
            // 1. Plan: LLM이 다음 행동 결정
            let plan = self.planner.plan(&context).await?;

            match plan {
                Plan::ToolCalls(calls) => {
                    // 2. Execute: 도구 실행 (병렬 가능)
                    let results = self.executor.execute_parallel(calls).await?;

                    // 3. Update context
                    context.add_tool_results(results);
                }
                Plan::Response(response) => {
                    // 최종 응답
                    return Ok(AgentResult::Success(response));
                }
                Plan::AskUser(question) => {
                    // 사용자 입력 대기
                    return Ok(AgentResult::NeedInput(question));
                }
            }

            // 4. Memory: 중요 정보 저장
            self.memory.update(&context)?;
        }

        Err(AgentError::MaxTurnsReached)
    }
}
```

### 3. 신규 Local MCP Tools 구현

```rust
// hb-tool-executor/src/local_mcp/mod.rs

// === File System Tools ===

/// 정밀한 파일 수정 (Claude Code의 Edit tool)
pub fn edit_file(path: &str, old_string: &str, new_string: &str) -> Result<()> {
    let content = fs::read_to_string(path)?;
    if content.matches(old_string).count() != 1 {
        return Err("old_string must be unique in file");
    }
    let new_content = content.replace(old_string, new_string);
    fs::write(path, new_content)?;
    Ok(())
}

/// Glob 패턴으로 파일 검색
pub fn glob_files(pattern: &str, path: &str) -> Vec<PathBuf> {
    glob::glob(&format!("{}/{}", path, pattern))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

/// ripgrep 스타일 코드 검색
pub fn grep_content(pattern: &str, path: &str, options: GrepOptions) -> Vec<GrepMatch> {
    // Use regex crate for pattern matching
    let re = Regex::new(pattern).unwrap();
    // Walk directory and search
}

// === Shell Tools ===

/// 셸 명령 실행 (타임아웃, 작업 디렉토리 지원)
pub async fn bash_execute(
    command: &str,
    cwd: Option<&str>,
    timeout_ms: u64,
) -> Result<BashOutput> {
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(command);

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let output = tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        cmd.output()
    ).await??;

    Ok(BashOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

// === Web Tools ===

/// 웹 검색 (Brave Search API 또는 DuckDuckGo)
pub async fn web_search(query: &str, max_results: usize) -> Vec<SearchResult> {
    // Use Brave Search API or scrape DuckDuckGo
}

/// URL 콘텐츠 가져오기 (HTML → Markdown 변환)
pub async fn web_fetch(url: &str) -> Result<WebContent> {
    let html = reqwest::get(url).await?.text().await?;
    let markdown = html2md::parse_html(&html);
    Ok(WebContent { markdown, url: url.to_string() })
}

// === Git Tools ===

/// Git 상태 확인
pub fn git_status(repo_path: &str) -> GitStatus {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .unwrap();
    // Parse output
}

/// Git diff
pub fn git_diff(repo_path: &str, staged: bool) -> String {
    let args = if staged { vec!["diff", "--staged"] } else { vec!["diff"] };
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .unwrap();
    String::from_utf8_lossy(&output.stdout).to_string()
}
```

### 4. Context Memory System

```rust
// hb-agent/src/memory.rs

pub struct ContextMemory {
    /// 현재 대화 컨텍스트
    conversation: Vec<Message>,

    /// 파일 캐시 (읽은 파일 내용)
    file_cache: HashMap<PathBuf, FileContent>,

    /// 작업 디렉토리
    working_dir: PathBuf,

    /// 영속 메모리 (SQLite)
    persistent: SqliteMemory,
}

impl ContextMemory {
    /// 컨텍스트 압축 (토큰 한계 대응)
    pub fn compress(&mut self, max_tokens: usize) {
        // 오래된 메시지 요약
        // 중요하지 않은 도구 결과 제거
        // 파일 캐시 정리
    }

    /// 중요 정보 영속 저장
    pub fn remember(&self, key: &str, value: &str) {
        self.persistent.store(key, value);
    }

    /// 영속 메모리에서 검색
    pub fn recall(&self, query: &str) -> Vec<MemoryItem> {
        self.persistent.search(query)
    }
}
```

### 5. Multi-Turn Workflow Execution

```
User: "이 프로젝트의 모든 TODO 주석을 찾아서 리스트로 만들어줘"

Turn 1:
  Plan: [glob("**/*.rs"), glob("**/*.ts")]
  Execute: Found 150 files

Turn 2:
  Plan: [grep("TODO|FIXME", files)]
  Execute: Found 23 matches

Turn 3:
  Plan: Response with formatted list
  Output: "## TODO List\n1. file.rs:42 - TODO: Implement caching..."
```

### 6. 구현 우선순위

#### Phase 1: Core Tools (1주)
- [ ] `bash-execute` - 셸 명령 실행
- [ ] `file-edit` - 정밀 파일 수정
- [ ] `glob-search` - 파일 패턴 검색
- [ ] `grep-search` - 코드 내용 검색

#### Phase 2: Agent Loop (2주)
- [ ] `AgentLoop` 구조체
- [ ] `LLMPlanner` - 도구 호출 계획
- [ ] `ContextMemory` - 컨텍스트 관리
- [ ] Multi-turn execution

#### Phase 3: Advanced Tools (1주)
- [ ] `web-search` - 웹 검색
- [ ] `web-fetch` - URL 콘텐츠
- [ ] `git-*` - Git 작업
- [ ] `task-spawn` - 서브 에이전트

#### Phase 4: UI Integration (1주)
- [ ] Agent 모드 UI
- [ ] 대화형 인터페이스
- [ ] 도구 실행 시각화
- [ ] 메모리 관리 UI

## 예상 결과

```
User: "src 폴더에서 deprecated 함수들을 찾아서 삭제해줘"

Handbox Agent:
1. [glob] src/**/*.rs 검색 → 45개 파일
2. [grep] #[deprecated] 패턴 검색 → 8개 매치
3. [read] 각 파일 읽기
4. [edit] deprecated 함수 제거
5. [bash] cargo check 실행 → 성공
6. [response] "8개의 deprecated 함수를 삭제했습니다"
```

이것이 Handbox를 Claude Code 수준으로 만드는 로드맵입니다.
