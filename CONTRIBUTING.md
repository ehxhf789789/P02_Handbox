# Contributing to Handbox

Handbox에 기여해 주셔서 감사합니다! 이 문서는 새로운 개발자가 빠르게 개발 환경을 구축하고 기여할 수 있도록 안내합니다.

## Quick Start (5분 안에 개발 환경 구축)

### Prerequisites

다음 소프트웨어가 설치되어 있어야 합니다:

| Software | Version | Installation |
|----------|---------|--------------|
| Node.js | v18+ | `winget install OpenJS.NodeJS.LTS` |
| Rust | 1.70+ | `winget install Rustlang.Rustup` |
| Git | Latest | `winget install Git.Git` |
| VS Build Tools | 2022 | `winget install Microsoft.VisualStudio.2022.BuildTools` (Windows only) |

### Step 1: Clone Repository

```bash
git clone https://github.com/ehxhf789789/P02_Handbox.git
cd P02_Handbox
```

### Step 2: Install Dependencies

**Windows (PowerShell):**
```powershell
# One-command setup
.\setup_all.ps1
```

**Manual Setup (All Platforms):**
```bash
# 1. Install Tauri CLI
cargo install tauri-cli

# 2. Install frontend dependencies
cd Handbox
npm install

# 3. Verify Rust build
cd src-tauri
cargo build
```

### Step 3: Run Development Server

```bash
cd Handbox
npm run tauri dev
```

## Development Workflow

### Project Structure

```
P02_Handbox/
├── Handbox/                    # Main Tauri App
│   ├── src/                    # React Frontend (TypeScript)
│   ├── src-tauri/              # Rust Backend
│   │   ├── src/                # Rust source code
│   │   ├── Cargo.toml          # Rust dependencies (locked)
│   │   └── Cargo.lock          # Exact dependency versions
│   ├── package.json            # Node dependencies
│   └── package-lock.json       # Exact npm versions
├── aws_agent/                  # Python Backend (Optional)
└── requirements.txt            # Python dependencies
```

### Making Changes

#### Frontend (React/TypeScript)
```bash
cd Handbox
npm run dev          # Browser-only development
npm run tauri dev    # Full app with hot reload
```

#### Backend (Rust)
```bash
cd Handbox/src-tauri
cargo build          # Build
cargo check          # Fast type checking
cargo clippy         # Linting
cargo test           # Run tests
```

#### Python Agent (Optional)
```bash
pip install -r requirements.txt
cd aws_agent
python -m api.server  # Start FastAPI server
```

### Code Style

- **TypeScript**: Prettier + ESLint (auto-format on save recommended)
- **Rust**: `cargo fmt` before committing
- **Python**: Black + isort

### Commit Guidelines

커밋 메시지는 다음 형식을 따릅니다:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 설정 등

**Example:**
```
feat(workflow): add conditional branching node

- Implement IF/ELSE logic in workflow execution
- Add conditional node UI component
- Update node templates

Closes #123
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** your changes with descriptive messages
4. **Push** to your fork: `git push origin feature/my-feature`
5. **Open** a Pull Request with:
   - Clear description of changes
   - Screenshots/videos for UI changes
   - Link to related issues

## Testing

### Frontend
```bash
cd Handbox
npm run build       # Type checking + build
```

### Backend
```bash
cd Handbox/src-tauri
cargo test
cargo clippy -- -D warnings
```

## Troubleshooting

### "Rust compilation failed"
```bash
# Update Rust
rustup update

# Clean and rebuild
cd Handbox/src-tauri
cargo clean
cargo build
```

### "npm install failed"
```bash
cd Handbox
rm -rf node_modules package-lock.json
npm install
```

### "WebView2 not found" (Windows)
Download and install [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

### "Permission denied" on scripts (Windows)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Questions?

- GitHub Issues: https://github.com/ehxhf789789/P02_Handbox/issues
- Email: support@handbox.app

---

Happy coding! 🚀
