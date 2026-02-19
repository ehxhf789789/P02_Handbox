import React from 'react'
import ReactDOM from 'react-dom/client'

// ===== 앱 초기화: App import 전에 실행 필수 =====
import { registerBuiltinExecutors } from './executors'
import { registerBuiltinProviders } from './providers'
import { registerBuiltinPlugins, initializePluginSystem } from './plugins'
import { registerAllTools } from './tools'

// NodeRegistry에 먼저 등록해야 WorkflowEditor가 정상 작동
registerBuiltinExecutors()
registerBuiltinProviders()
registerBuiltinPlugins()

// Tier 1 도구 시스템 등록 (52개 내장 노드)
registerAllTools()

// Tier 2 플러그인 시스템 비동기 초기화 (설치된 플러그인 복원)
initializePluginSystem().catch(err =>
  console.warn('[Plugins] 플러그인 시스템 초기화 실패:', err)
)

// ===== App import는 초기화 이후 =====
import App from './App'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1',
    },
    secondary: {
      main: '#22c55e',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
  typography: {
    fontFamily: "'Pretendard', 'Segoe UI', sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        // 전역 스크롤바 스타일
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: '#475569 transparent',
        },
        '*::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '*::-webkit-scrollbar-track': {
          background: 'rgba(15, 23, 42, 0.5)',
          borderRadius: '4px',
        },
        '*::-webkit-scrollbar-thumb': {
          background: 'linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%)',
          borderRadius: '4px',
          border: '2px solid transparent',
          backgroundClip: 'content-box',
          '&:hover': {
            background: 'linear-gradient(180deg, #818cf8 0%, #a78bfa 100%)',
            backgroundClip: 'content-box',
          },
        },
        '*::-webkit-scrollbar-corner': {
          background: 'transparent',
        },
        // 얇은 스크롤바 (좁은 영역용)
        '.thin-scrollbar::-webkit-scrollbar': {
          width: '4px',
          height: '4px',
        },
        '.thin-scrollbar::-webkit-scrollbar-thumb': {
          background: 'rgba(99, 102, 241, 0.5)',
          borderRadius: '2px',
          border: 'none',
        },
        // 숨김 스크롤바 (호버시 표시)
        '.hover-scrollbar::-webkit-scrollbar-thumb': {
          background: 'transparent',
        },
        '.hover-scrollbar:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(99, 102, 241, 0.6)',
        },
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
