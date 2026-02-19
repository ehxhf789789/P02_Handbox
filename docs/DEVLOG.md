# Handbox v2 - Development Log

## Overview

Handbox v2는 "MCP 백과사전이자 통합 플랫폼"으로 재설계된 연구용 AI 샌드박스입니다.
연구자가 모든 확장자의 문서/파일을 전처리하고, MCP 도구와 LLM을 자유롭게 조합하여
RAG, AI Agent, Chain-of-Thought 등 어떤 AI 워크플로우든 시각적으로 구축하고 실험할 수 있습니다.

## Architecture: 3-Tier Tool System

```
┌─────────────────────────────────────────────────────┐
│                    Handbox v2                        │
├─────────────────────────────────────────────────────┤
│  Tier 1: Built-in Tools (Rust)                       │
│  - 52 atomic nodes: IO, Transform, Storage, Doc,     │
│    Process, Control, Variable, Debug, Viz, LLM       │
│  - No external dependencies                          │
├─────────────────────────────────────────────────────┤
│  Tier 2: Plugins (MCP Servers)                       │
│  - GitHub MCP servers: install/remove/auto-discover  │
│  - MCP tool → NodeDefinition auto-conversion         │
│  - 8 recommended plugins (filesystem, brave-search,  │
│    github, sqlite, puppeteer, google-maps, slack,    │
│    memory)                                           │
├─────────────────────────────────────────────────────┤
│  Tier 3: LLM (API only)                             │
│  - Provider-agnostic: Bedrock, OpenAI, Anthropic     │
│  - Swappable via ProviderRegistry                    │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + ReactFlow 11 + MUI 5 + Zustand 4
- **Backend**: Rust (Tauri 1.5)
- **Protocol**: MCP (Model Context Protocol) via JSON-RPC 2.0 over stdio

---

## Implementation Status

### Phase 1: Rust Backend (Tier 1 Built-in Tools) - COMPLETE

| File | Tools | Description |
|------|-------|-------------|
| `tool_io.rs` | file_read, file_write, file_list, file_info, http_request | 파일 I/O + HTTP |
| `tool_transform.rs` | json_parse, json_query, json_stringify, csv_parse, csv_stringify, text_split, text_regex, text_template, xml_parse | 데이터 변환 |
| `tool_storage.rs` | kv_get/set/delete/list, vector_store/search/hybrid, sqlite_query/schema | 저장소 |
| `tool_doc.rs` | doc_parse, doc_convert | 범용 문서 파서 (PDF, Excel, CSV, HTML, OCR) |
| `tool_process.rs` | shell_exec, code_eval | 시스템 명령 + 코드 실행 |

**Helper Engines** (`src-tauri/src/tools/`):
| File | Purpose |
|------|---------|
| `json_query.rs` | JSONPath-like query engine (Level 2: path, filter, aggregation, pipe) |
| `template_engine.rs` | Handlebars-like template engine (variables, conditionals, loops, filters) |
| `text_chunker.rs` | Smart text chunking (separator, tokens, sentences, sliding_window, recursive) |
| `vector_index.rs` | Vector similarity search (cosine, euclidean, dot product) + SQLite storage |
| `doc_parsers.rs` | Multi-format document parser (PDF, Excel, CSV, HTML, pandoc, OCR) |

### Phase 2: Frontend Node Definitions (52 Nodes) - COMPLETE

| File | Count | Nodes |
|------|-------|-------|
| `io.tools.ts` | 5 | file-read, file-write, file-list, file-info, http-request |
| `transform.tools.ts` | 9 | json-query, json-parse, json-stringify, csv-parse, csv-stringify, text-split, text-regex, text-template, xml-parse |
| `storage.tools.ts` | 8 | kv-get/set/delete/list, vector-store/search/hybrid, sqlite-query |
| `doc.tools.ts` | 2 | doc-parse, doc-convert |
| `process.tools.ts` | 2 | shell-exec, code-eval |
| `control.tools.ts` | 10 | if, switch, loop, forEach, while, merge, split, gate, variable-get, variable-set |
| `variable.tools.ts` | 2 | constant, input |
| `debug.tools.ts` | 3 | log, inspect, breakpoint |
| `viz.tools.ts` | 5 | table, chart, json, text, stats |
| `llm.tools.ts` | 6 | chat, embed, structured, prompt.template, prompt.fewshot, prompt.chain |

### Phase 3: Plugin System (Tier 2) - COMPLETE

**Rust Backend** (`plugin_manager.rs`):
- plugin_install, plugin_uninstall, plugin_list, plugin_list_available, plugin_update_manifest
- Supports GitHub/npm/local sources
- Auto-detects runtime (node/python) and entry points

**Frontend**:
| File | Purpose |
|------|---------|
| `plugins/types.ts` | PluginManifest, PluginStatus, PluginMCPTool types |
| `plugins/PluginStore.ts` | Zustand store with persist - install/uninstall/start/stop |
| `plugins/PluginToNode.ts` | MCP tool → NodeDefinition auto-conversion + NodeRegistry sync |
| `plugins/PluginManager.ts` | High-level lifecycle orchestrator with event system |
| `plugins/index.ts` | initializePluginSystem() entry point |

**UI** (`components/PluginManagerDialog/`):
- 3 tabs: Installed (search + accordion), Plugin Store (grid), Manual Install (URL input)

### Phase 4: ExecutionEngine Extension - COMPLETE

| Feature | Description |
|---------|-------------|
| Conditional routing | IF/Switch nodes skip inactive downstream paths |
| Loop sub-execution | ForEach/Loop/While execute downstream subgraph per iteration |
| Step execution mode | stepMode + stepSignal for debugger integration |
| Helper functions | getDownstreamNodeIds, isOnInactivePath, markInactiveBranches |

### Phase 5: UI Components & Integration - COMPLETE

| Component | Description |
|-----------|-------------|
| `PluginManagerDialog` | 3-tab plugin management (installed/store/manual install) |
| `ExecutionDebugger` | Bottom drawer with execution logs timeline + variable inspection |
| `MainLayout` | Integrated toolbar buttons (plugins, debugger) + debug log collection |
| `NodePalette` | Reactive to NodeRegistry changes via subscribe pattern |

### Phase 5 Validation: 5 Reference Pipelines - COMPLETE

| Pipeline | File | Nodes | Description |
|----------|------|-------|-------------|
| Basic RAG | `v2-basic-rag.json` | 10 | file.read → text.split → embed → vector.store → search → template → llm.chat |
| Data Analysis | `v2-data-analysis.json` | 8 | doc.parse → json.query × 2 → merge → template → llm.chat |
| Multi-step Agent | `v2-multistep-agent.json` | 10 | llm.structured → json.query → switch → tools → merge → result |
| Document Generation | `v2-document-generation.json` | 7 | file.list → forEach → doc.parse → template → llm.chat → file.write |
| Plugin Integration | `v2-plugin-integration.json` | 9 | brave-search → json.query + http → merge → template → llm.chat |

---

## Build Verification

```
cargo check    → 0 errors, 14 warnings (pre-existing, unused code)
tsc --noEmit   → 0 errors
vite build     → Success (1,124 KB → 345 KB gzipped)
```

---

## Key Files & Directories

```
src-tauri/src/
├── commands/
│   ├── tool_io.rs              # Tier 1: File I/O + HTTP
│   ├── tool_transform.rs       # Tier 1: JSON/CSV/Text/XML transforms
│   ├── tool_storage.rs         # Tier 1: KV, Vector, SQLite
│   ├── tool_doc.rs             # Tier 1: Universal document parser
│   ├── tool_process.rs         # Tier 1: Shell exec + code eval
│   └── plugin_manager.rs       # Tier 2: Plugin lifecycle
└── tools/
    ├── json_query.rs           # JSONPath query engine
    ├── template_engine.rs      # Handlebars-like templates
    ├── text_chunker.rs         # Smart text chunking
    ├── vector_index.rs         # Vector similarity search
    └── doc_parsers.rs          # Multi-format document parsers

src/
├── tools/                      # 52 Tier 1 node definitions
│   ├── io.tools.ts
│   ├── transform.tools.ts
│   ├── storage.tools.ts
│   ├── doc.tools.ts
│   ├── process.tools.ts
│   ├── control.tools.ts
│   ├── variable.tools.ts
│   ├── debug.tools.ts
│   ├── viz.tools.ts
│   ├── llm.tools.ts
│   └── index.ts                # registerAllTools()
├── plugins/                    # Tier 2 plugin system
│   ├── types.ts
│   ├── PluginStore.ts
│   ├── PluginToNode.ts
│   ├── PluginManager.ts
│   └── index.ts                # initializePluginSystem()
├── engine/
│   └── ExecutionEngine.ts      # Extended with loops/conditionals/step mode
├── components/
│   ├── PluginManagerDialog/    # Plugin management UI
│   ├── ExecutionDebugger/      # Execution debugger drawer
│   ├── MainLayout/             # Integrated toolbar + debug logging
│   └── NodePalette/            # Reactive to registry changes
└── examples/
    ├── v2-basic-rag.json       # Reference pipeline 1
    ├── v2-data-analysis.json   # Reference pipeline 2
    ├── v2-multistep-agent.json # Reference pipeline 3
    ├── v2-document-generation.json # Reference pipeline 4
    └── v2-plugin-integration.json  # Reference pipeline 5
```

---

## Getting Started (New Dev Environment)

```bash
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox/Handbox
npm install
cd src-tauri && cargo build && cd ..
npm run tauri dev
```

### Prerequisites
- Node.js 18+
- Rust (rustup) with stable toolchain
- Tauri CLI: `cargo install tauri-cli`

---

## Remaining Work / Future Enhancements

1. **E2E Testing with Real APIs**: Connect actual LLM API keys (Bedrock/OpenAI/Anthropic) and test full pipelines
2. **Plugin E2E**: Test actual MCP plugin installation from GitHub (brave-search, filesystem, etc.)
3. **Performance**: HNSW index for vector search (instant-distance crate), code splitting for frontend bundle
4. **Additional Parsers**: HWP (Korean), EPUB, OCR improvements (Tesseract/Textract integration)
5. **Workflow Persistence**: Save/load v2 format workflows with WorkflowFile schema
6. **Sub-workflows**: Enable nested workflow execution (SubWorkflowConfig)
7. **Collaborative Features**: Workflow sharing, version control
