<p align="center">
  <img src="docs/images/logo.png" alt="Handbox Logo" width="120"/>
</p>

<h1 align="center">Handbox</h1>

<p align="center">
  <strong>AI 기반 워크플로우 자동화 플랫폼</strong><br>
  드래그 앤 드롭으로 복잡한 AI 워크플로우를 쉽게 설계하고 실행하세요
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#installation">Installation</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

**Handbox**는 비개발자도 쉽게 사용할 수 있는 AI 워크플로우 자동화 데스크톱 애플리케이션입니다.
노드 기반 비주얼 프로그래밍 인터페이스를 통해 복잡한 AI 파이프라인을 직관적으로 설계하고 실행할 수 있습니다.

### Why Handbox?

- **No-Code AI 워크플로우**: 코딩 없이 드래그 앤 드롭으로 AI 파이프라인 구축
- **멀티 AI 프로바이더 지원**: AWS Bedrock, OpenAI, Anthropic 등 다양한 AI 서비스 통합
- **로컬 우선**: 데스크톱 앱으로 데이터 프라이버시 보장
- **확장 가능**: 커스텀 노드 및 플러그인 지원

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Visual Workflow Editor** | ReactFlow 기반 노드 에디터로 워크플로우 시각적 설계 |
| **다양한 노드 유형** | 입력/출력, AI 에이전트, 데이터 처리, API 연동 등 50+ 노드 제공 |
| **실시간 실행** | 워크플로우 실행 상태 실시간 모니터링 |
| **템플릿 시스템** | 사전 정의된 워크플로우 템플릿으로 빠른 시작 |

### AI Integration

- **AWS Bedrock**: Claude, Titan 등 AWS 관리형 AI 모델
- **OpenAI API**: GPT-4, GPT-3.5 등 OpenAI 모델
- **Anthropic API**: Claude 시리즈 직접 연동
- **로컬 LLM**: Ollama 연동 지원 (예정)

### Document Processing

- **PDF 처리**: 텍스트 추출, 분석, 생성
- **Word/Excel**: 문서 파싱 및 생성
- **HWP 지원**: 한글 문서 처리 (한국 환경 특화)

### External API Integration

- **KIPRIS**: 한국 특허정보 조회
- **NTIS**: 국가과학기술정보서비스 연동
- **ScienceON**: KISTI 학술정보 검색

---

## Quick Start

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10, macOS 11, Ubuntu 20.04 | Windows 11, macOS 13+ |
| RAM | 8GB | 16GB |
| Storage | 2GB | 5GB |
| Node.js | v18+ | v20+ |
| Rust | 1.70+ | 1.80+ |

### One-Line Install (Windows PowerShell)

```powershell
# Clone and setup
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox
.\setup_all.ps1
```

### Manual Installation

```bash
# 1. Clone repository
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox

# 2. Install frontend dependencies
cd Handbox
npm install

# 3. Build Rust backend
cd src-tauri
cargo build

# 4. Run development server
cd ..
npm run tauri dev
```

---

## Installation

### Prerequisites

#### 1. Rust & Cargo
```powershell
# Windows (winget)
winget install Rustlang.Rustup

# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 2. Node.js & npm
```powershell
# Windows (winget)
winget install OpenJS.NodeJS.LTS

# macOS (Homebrew)
brew install node
```

#### 3. Visual Studio Build Tools (Windows only)
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

#### 4. Tauri CLI
```bash
cargo install tauri-cli
```

### Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure your settings in `.env`:
```env
# AWS Credentials (Optional - for AWS Bedrock)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1

# OpenAI API (Optional)
OPENAI_API_KEY=your_openai_key

# Anthropic API (Optional)
ANTHROPIC_API_KEY=your_anthropic_key
```

---

## Usage

### Running the Application

#### Development Mode (Hot Reload)
```bash
cd Handbox
npm run tauri dev
```

#### Production Build
```bash
cd Handbox
npm run tauri build
```

Build outputs:
- Windows: `src-tauri/target/release/handbox.exe`
- macOS: `src-tauri/target/release/bundle/macos/Handbox.app`
- Linux: `src-tauri/target/release/bundle/appimage/handbox.AppImage`

### First Launch

1. **시작하기**: 앱 실행 후 AI 프로바이더 선택 (AWS/OpenAI/Anthropic 또는 나중에 설정)
2. **워크플로우 생성**: 좌측 노드 팔레트에서 노드를 드래그하여 캔버스에 배치
3. **연결**: 노드 간 연결선을 그려 데이터 흐름 정의
4. **실행**: 상단 실행 버튼 클릭하여 워크플로우 실행

### Workflow Templates

Handbox는 다양한 사전 정의 템플릿을 제공합니다:

| Template | Description |
|----------|-------------|
| Text Generation | 기본 텍스트 생성 워크플로우 |
| Document Summary | 문서 요약 파이프라인 |
| RAG Workflow | 검색 증강 생성 파이프라인 |
| Data Extraction | 구조화 데이터 추출 |
| Multi-language Translation | 다국어 번역 워크플로우 |

---

## Project Structure

```
P02_Handbox/
├── Handbox/                    # Tauri Desktop Application
│   ├── src/                    # React Frontend
│   │   ├── App.tsx            # Main Application Component
│   │   ├── components/        # UI Components
│   │   │   ├── WorkflowEditor/    # Node Editor
│   │   │   ├── NodePalette/       # Node Library Panel
│   │   │   ├── PropertyPanel/     # Node Properties
│   │   │   └── MainLayout/        # Main UI Layout
│   │   ├── nodes/             # Custom ReactFlow Nodes
│   │   ├── stores/            # Zustand State Management
│   │   │   ├── appStore.ts        # App-level State
│   │   │   └── workflowStore.ts   # Workflow State
│   │   ├── data/              # Templates & Configurations
│   │   │   ├── nodeTemplates.ts   # Node Definitions
│   │   │   └── workflows/         # Workflow Templates
│   │   └── examples/          # Sample Workflows
│   ├── src-tauri/             # Rust Backend
│   │   ├── src/
│   │   │   ├── main.rs        # Application Entry
│   │   │   ├── commands/      # Tauri Commands
│   │   │   │   ├── aws_service.rs     # AWS Integration
│   │   │   │   ├── file_system.rs     # File Operations
│   │   │   │   ├── workflow.rs        # Workflow Execution
│   │   │   │   └── knowledge_base.rs  # KB Operations
│   │   │   ├── aws/           # AWS SDK Integration
│   │   │   └── agents/        # Agent Logic
│   │   ├── Cargo.toml         # Rust Dependencies
│   │   └── tauri.conf.json    # Tauri Configuration
│   ├── package.json           # Node.js Dependencies
│   └── vite.config.ts         # Vite Configuration
├── aws_agent/                  # Python Backend Agent
│   ├── api/                   # FastAPI Server
│   ├── agents/                # AI Agent Logic
│   ├── preprocessing/         # Data Preprocessing
│   └── vectorstore/           # Vector Database
├── requirements.txt           # Python Dependencies
├── .env.example              # Environment Template
└── README.md                 # This File
```

---

## Configuration

### AI Provider Settings

앱 내 설정에서 AI 프로바이더를 구성할 수 있습니다:

1. **Settings** → **AI Settings** 메뉴 열기
2. 사용할 프로바이더 선택 및 API 키 입력
3. 모델 및 파라미터 설정

### Supported Models

| Provider | Models |
|----------|--------|
| AWS Bedrock | Claude 3.5 Sonnet, Claude 3 Haiku, Titan |
| OpenAI | GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus/Haiku |

---

## Development

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Material-UI, ReactFlow, Zustand |
| **Desktop Runtime** | Tauri (Rust) |
| **Backend Services** | Rust (Native), Python FastAPI (Optional) |
| **AI Integration** | AWS SDK for Rust, OpenAI API, Anthropic API |
| **Build Tools** | Vite, Cargo |

### Development Commands

```bash
# Frontend only (browser)
npm run dev

# Full Tauri app (dev mode)
npm run tauri dev

# Type checking
npm run build

# Rust linting
cd src-tauri && cargo clippy

# Run tests
cargo test
```

### Creating Custom Nodes

1. `src/nodes/` 디렉토리에 새 노드 컴포넌트 생성
2. `src/data/nodeTemplates.ts`에 노드 정의 추가
3. 필요시 `src-tauri/src/commands/`에 백엔드 명령 추가

---

## Troubleshooting

### Common Issues

#### Rust 컴파일 오류
```bash
# Update Rust
rustup update

# Clean build
cd src-tauri && cargo clean && cargo build
```

#### npm 의존성 오류
```bash
rm -rf node_modules package-lock.json
npm install
```

#### Tauri CLI 오류
```bash
cargo install tauri-cli --force
```

#### WebView2 오류 (Windows)
Windows에서 WebView2 런타임이 필요합니다. [Microsoft 공식 페이지](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)에서 다운로드하세요.

---

## Roadmap

### v1.1 (Coming Soon)
- [ ] Ollama 로컬 LLM 지원
- [ ] 워크플로우 버전 관리
- [ ] 협업 기능 (Cloud Sync)

### v1.2
- [ ] 플러그인 마켓플레이스
- [ ] 자동화 스케줄러
- [ ] REST API 노출

### v2.0
- [ ] 멀티 에이전트 오케스트레이션
- [ ] 실시간 협업 편집
- [ ] 엔터프라이즈 기능

---

## Contributing

기여를 환영합니다! 자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/ehxhf789789/P02_Handbox/issues)
- **Email**: support@handbox.app

---

<p align="center">
  Made with ❤️ by the Handbox Team
</p>
