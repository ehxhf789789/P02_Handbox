<p align="center">
  <img src="Handbox/public/images/logo.png" alt="Handbox Logo" width="120"/>
</p>

<h1 align="center">Handbox</h1>

<p align="center">
  <strong>Sandbox AI Agent Designer</strong><br>
  다양한 클라우드 CLI와 API를 통합하는 시각적 AI 에이전트 설계 플랫폼
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#installation">Installation</a> •
  <a href="#platforms">Platforms</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

**Handbox**는 다양한 AI 플랫폼과 클라우드 서비스를 통합하여 워크플로우를 시각적으로 설계하고 실행할 수 있는 **샌드박스형 AI 에이전트 설계 플랫폼**입니다.

AWS, GCP, Azure 등의 클라우드 CLI뿐만 아니라 OpenAI, Anthropic 등 개별 API를 직접 입력하여 자유롭게 AI 파이프라인을 구축할 수 있습니다.

### Why Handbox?

| Feature | Description |
|---------|-------------|
| **Sandbox Environment** | 안전한 샌드박스 환경에서 AI 에이전트를 설계하고 테스트 |
| **Multi-Platform CLI** | AWS, GCP, Azure 등 다양한 클라우드 CLI 통합 |
| **Custom API Support** | OpenAI, Anthropic, 커스텀 API 직접 연동 |
| **Visual Designer** | 드래그 앤 드롭으로 복잡한 AI 워크플로우 설계 |
| **Local-First** | 데스크톱 앱으로 데이터 프라이버시 보장 |

---

## Features

### Core Features

```
┌─────────────────────────────────────────────────────────────────┐
│                        HANDBOX                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │  Input   │───▶│  Agent   │───▶│ Process  │───▶│  Output  │ │
│   │  Node    │    │  Node    │    │  Node    │    │  Node    │ │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│                                                                  │
│   [AWS CLI] [GCP CLI] [Azure CLI] [OpenAI] [Anthropic] [Custom] │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

- **Visual Workflow Editor**: ReactFlow 기반 노드 에디터
- **50+ Built-in Nodes**: 입력/출력, AI 에이전트, 데이터 처리, API 연동
- **Real-time Execution**: 워크플로우 실행 상태 실시간 모니터링
- **Template System**: 사전 정의 템플릿으로 빠른 시작

### Supported Platforms & APIs

#### Cloud Platforms (CLI Integration)
| Platform | Status | Features |
|----------|--------|----------|
| **AWS** | Supported | Bedrock, S3, Lambda, Comprehend, Translate |
| **GCP** | Planned | Vertex AI, Cloud Functions, BigQuery |
| **Azure** | Planned | OpenAI Service, Cognitive Services |

#### AI APIs (Direct Integration)
| Provider | Models |
|----------|--------|
| **AWS Bedrock** | Claude 3.5, Titan, Llama 2 |
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-3.5 |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus/Haiku |
| **Custom API** | Any REST/GraphQL API |

#### Document Processing
- **PDF**: 텍스트 추출, 분석, 생성
- **Office**: Word, Excel, PowerPoint
- **HWP**: 한글 문서 (한국 특화)

#### External Services
- **KIPRIS**: 한국 특허정보
- **NTIS**: 국가과학기술정보
- **ScienceON**: KISTI 학술정보

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

### Installation

```bash
# 1. Clone
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox

# 2. Install dependencies
cd Handbox
npm install

# 3. Run development server
npm run tauri dev
```

**Windows PowerShell (One-liner):**
```powershell
git clone https://github.com/ehxhf789789/P02_Handbox.git; cd P02_Handbox; .\setup_all.ps1
```

---

## Installation

### Prerequisites

```bash
# 1. Rust
winget install Rustlang.Rustup      # Windows
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # macOS/Linux

# 2. Node.js
winget install OpenJS.NodeJS.LTS    # Windows
brew install node                    # macOS

# 3. Build Tools (Windows only)
winget install Microsoft.VisualStudio.2022.BuildTools

# 4. Tauri CLI
cargo install tauri-cli
```

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Cloud CLI (Optional - install separately)
# aws configure
# gcloud auth login
# az login

# Direct API Keys (Optional)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# AWS Bedrock (Optional)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_DEFAULT_REGION=us-east-1
```

---

## Usage

### Running the Application

```bash
# Development (Hot Reload)
cd Handbox && npm run tauri dev

# Production Build
cd Handbox && npm run tauri build
```

### First Launch

1. **Provider Setup**: 사용할 AI 프로바이더 선택 (또는 나중에 설정)
2. **Create Workflow**: 좌측 노드 팔레트에서 노드 드래그
3. **Connect Nodes**: 노드 간 연결선으로 데이터 흐름 정의
4. **Execute**: 상단 실행 버튼으로 워크플로우 실행

### Adding Custom APIs

1. **Settings** → **External API Settings**
2. **Add API** 클릭
3. API 이름, Endpoint, 인증 방식 입력
4. 저장 후 노드 팔레트에서 사용

---

## Project Structure

```
P02_Handbox/
├── Handbox/                    # Tauri Desktop App
│   ├── src/                    # React Frontend (TypeScript)
│   │   ├── components/         # UI Components
│   │   ├── nodes/              # Custom ReactFlow Nodes
│   │   ├── stores/             # Zustand State
│   │   └── data/               # Templates
│   ├── src-tauri/              # Rust Backend
│   │   ├── src/
│   │   │   ├── commands/       # Tauri Commands
│   │   │   ├── aws/            # AWS SDK
│   │   │   └── agents/         # Agent Logic
│   │   └── icons/              # App Icons
│   └── public/
│       └── images/             # Theme Logos
│           ├── logo.png        # Default
│           ├── logo-dark.png   # Dark Mode (white)
│           └── logo-light.png  # Light Mode (black)
├── aws_agent/                  # Python Backend (Optional)
├── icon/                       # Source Icons
│   ├── white_logo.png          # Dark mode
│   ├── black_logo.png          # Light mode
│   └── window_logo.png         # Taskbar/App icon
├── requirements.txt            # Python deps
└── .env.example               # Environment template
```

---

## Development

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Material-UI, ReactFlow, Zustand |
| **Desktop** | Tauri (Rust) |
| **Backend** | Rust + Python FastAPI (Optional) |
| **AI SDKs** | AWS SDK, OpenAI, Anthropic |

### Commands

```bash
npm run dev           # Frontend only
npm run tauri dev     # Full app
npm run tauri build   # Production build
npm run tauri icon <path>  # Generate icons

cd src-tauri
cargo build           # Build Rust
cargo clippy          # Lint
cargo test            # Test
```

---

## Roadmap

### v1.1
- [ ] GCP CLI Integration
- [ ] Azure CLI Integration
- [ ] Ollama Local LLM

### v1.2
- [ ] Plugin Marketplace
- [ ] Workflow Scheduler
- [ ] REST API Export

### v2.0
- [ ] Multi-Agent Orchestration
- [ ] Real-time Collaboration
- [ ] Enterprise Features

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

```bash
# Quick setup for contributors
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox/Handbox
npm install
npm run tauri dev
```

---

## License

MIT License - see [LICENSE](LICENSE)

---

<p align="center">
  <strong>Handbox</strong> - Design AI Workflows, Your Way
</p>
