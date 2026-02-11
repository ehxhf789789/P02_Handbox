# Handbox 개발 환경 구축 가이드

## 설치 상태 (2026-02-09)

| 구성요소 | 버전 | 상태 |
|----------|------|------|
| Rust | 1.93.0 | 설치 완료 |
| Cargo | 1.93.0 | 설치 완료 |
| Node.js | v24.13.0 | 설치 완료 |
| npm | 11.6.2 | 설치 완료 |
| Tauri CLI | 2.10.0 | 설치 완료 |
| npm 의존성 | 182 packages | 설치 완료 |
| Rust 의존성 | - | 컴파일 완료 |

---

## 프로젝트 개요
- **프레임워크**: Tauri (Rust + React)
- **프론트엔드**: React 18 + TypeScript + Vite
- **백엔드**: Rust (Tauri) + AWS SDK
- **Python 에이전트**: FastAPI + LangChain

---

## 1. 필수 소프트웨어 설치

### 1.1 Rust 및 Cargo 설치

Windows에서 Rust를 설치하려면 **rustup**을 사용합니다.

1. [https://rustup.rs](https://rustup.rs) 방문
2. `rustup-init.exe` 다운로드 및 실행
3. 또는 PowerShell에서 실행:
   ```powershell
   winget install Rustlang.Rustup
   ```

설치 확인:
```powershell
rustc --version
cargo --version
```

### 1.2 Node.js 및 npm 설치

1. [https://nodejs.org](https://nodejs.org) 방문하여 LTS 버전 다운로드
2. 또는 PowerShell에서 실행:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

설치 확인:
```powershell
node --version
npm --version
```

### 1.3 Visual Studio Build Tools (Windows 필수)

Rust 컴파일에 필요한 C++ 빌드 도구:

1. [Visual Studio Build Tools](https://visualstudio.microsoft.com/ko/visual-cpp-build-tools/) 다운로드
2. 설치 시 **"C++ 빌드 도구"** 워크로드 선택
3. 또는 PowerShell에서:
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```

### 1.4 Tauri CLI 설치

```powershell
cargo install tauri-cli
```

---

## 2. 프로젝트 의존성 설치

### 2.1 프론트엔드 의존성 (Node.js)

```powershell
cd Handbox
npm install
```

### 2.2 Rust 의존성 (Cargo)

```powershell
cd Handbox/src-tauri
cargo build
```

### 2.3 Python 의존성 (선택사항)

Python 에이전트를 사용하려면:

```powershell
pip install -r requirements.txt
```

---

## 3. 개발 서버 실행

### 3.1 개발 모드 (Hot Reload 지원)

```powershell
cd Handbox
npm run tauri dev
```

이 명령어는:
- Vite 개발 서버 시작 (포트 5173)
- Tauri 앱 빌드 및 실행
- 프론트엔드 변경 시 자동 새로고침

### 3.2 프론트엔드만 개발

```powershell
cd Handbox
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

---

## 4. 프로덕션 빌드

### 4.1 전체 앱 빌드

```powershell
cd Handbox
npm run tauri build
```

빌드 결과물:
- Windows: `src-tauri/target/release/aws-agent-studio.exe`
- 인스톨러: `src-tauri/target/release/bundle/`

---

## 5. 프로젝트 구조

```
Handbox-Project/
├── Handbox/                    # Tauri 데스크톱 앱
│   ├── src/                    # React 프론트엔드
│   │   ├── App.tsx            # 메인 컴포넌트
│   │   ├── components/        # UI 컴포넌트
│   │   ├── nodes/             # ReactFlow 노드
│   │   ├── stores/            # Zustand 상태 관리
│   │   └── data/              # 템플릿 및 워크플로우
│   ├── src-tauri/             # Rust 백엔드
│   │   ├── src/               # Rust 소스
│   │   │   ├── main.rs       # 진입점
│   │   │   ├── aws/          # AWS 통합
│   │   │   ├── agents/       # 에이전트 로직
│   │   │   └── commands/     # Tauri 명령어
│   │   ├── Cargo.toml        # Rust 의존성
│   │   └── tauri.conf.json   # Tauri 설정
│   ├── package.json          # Node.js 의존성
│   └── vite.config.ts        # Vite 설정
├── aws_agent/                 # Python 백엔드 에이전트
│   ├── api/                  # FastAPI 서버
│   ├── agents/               # AI 에이전트
│   ├── preprocessing/        # 데이터 전처리
│   └── vectorstore/          # 벡터 저장소
├── requirements.txt          # Python 의존성
└── .env.example             # 환경 변수 예제
```

---

## 6. 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일 생성:

```powershell
copy .env.example .env
```

필요한 AWS 자격 증명 설정:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

---

## 7. 문제 해결

### Rust 컴파일 오류
- Visual Studio Build Tools가 설치되어 있는지 확인
- `rustup update`로 Rust 업데이트

### npm 의존성 오류
```powershell
rm -rf node_modules
npm install
```

### Tauri 오류
```powershell
cargo install tauri-cli --force
```

---

## 8. 유용한 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 프론트엔드 개발 서버 |
| `npm run tauri dev` | Tauri 앱 개발 모드 |
| `npm run build` | 프론트엔드 빌드 |
| `npm run tauri build` | 전체 앱 빌드 |
| `cargo build` | Rust만 빌드 |
| `cargo check` | Rust 문법 검사 |
