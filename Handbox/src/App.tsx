import { useState, useEffect } from 'react'
import { Box, Snackbar, Alert, CircularProgress, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/tauri'
import ProviderSetup from './components/ProviderSetup'
import { loadSavedCredentials, saveCredentials, clearSavedCredentials } from './components/ProviderSetup'
import MainLayout from './components/MainLayout'
import { useAppStore } from './stores/appStore'
import HandboxIcon from '@mui/icons-material/Hub'

function App() {
  const { isAuthenticated, setAuthenticated, setAWSStatus, skipAWSLogin, setUseAWSConnection } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Handbox 시작 중...')
  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info'
  }>({ open: false, message: '', severity: 'info' })

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    // 저장된 설정 확인 (AWS 사용 여부 포함)
    const savedCredentials = loadSavedCredentials()

    // AWS 연결이 필요한 경우에만 자격 증명 확인
    if (savedCredentials && savedCredentials.useAWS) {
      setLoadingMessage('저장된 AWS 자격 증명으로 연결 중...')
      try {
        await invoke('set_aws_credentials', {
          accessKeyId: savedCredentials.accessKeyId,
          secretAccessKey: savedCredentials.secretAccessKey,
          region: savedCredentials.region,
        })

        const result = await invoke<{
          connected: boolean
          region: string
          services: Array<{ name: string; available: boolean }>
        }>('test_aws_connection')

        if (result.connected) {
          setAWSStatus(result)
          setUseAWSConnection(true)
          setAuthenticated(true)
          setNotification({
            open: true,
            message: `AWS 연결 성공! (${result.region})`,
            severity: 'success',
          })
          setLoading(false)
          return
        } else {
          clearSavedCredentials()
          await invoke('clear_aws_credentials')
        }
      } catch (error) {
        console.log('AWS 연결 실패:', error)
        clearSavedCredentials()
      }
    } else if (savedCredentials && !savedCredentials.useAWS) {
      // AWS 없이 이전에 사용한 경우 - 바로 메인 화면으로
      setLoadingMessage('Handbox 시작 중...')
      skipAWSLogin()
      setLoading(false)
      setNotification({
        open: true,
        message: 'Handbox에 오신 것을 환영합니다!',
        severity: 'success',
      })
      return
    }

    // 새로운 사용자 - 설정 화면으로
    setLoadingMessage('초기 설정 준비 중...')
    setLoading(false)
  }

  // AWS 없이 시작 (API 키만 사용)
  const handleSkipAWS = () => {
    skipAWSLogin()
    saveCredentials({ useAWS: false })
    setNotification({
      open: true,
      message: 'Handbox에 오신 것을 환영합니다! AI 설정에서 API 키를 입력하세요.',
      severity: 'info',
    })
  }

  const handleLogin = async (credentials: {
    accessKeyId?: string
    secretAccessKey?: string
    region?: string
    rememberMe: boolean
    useAWS: boolean
  }) => {
    setLoading(true)

    // AWS 연결 사용하지 않는 경우
    if (!credentials.useAWS) {
      if (credentials.rememberMe) {
        saveCredentials({ useAWS: false })
      }
      skipAWSLogin()
      setNotification({
        open: true,
        message: 'Handbox에 오신 것을 환영합니다! AI 설정에서 API 키를 입력하세요.',
        severity: 'success',
      })
      setLoading(false)
      return
    }

    // AWS 연결 사용
    setLoadingMessage('AWS에 연결 중...')

    try {
      await invoke('set_aws_credentials', {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: credentials.region,
      })

      const result = await invoke<{
        connected: boolean
        region: string
        services: Array<{ name: string; available: boolean }>
      }>('test_aws_connection')

      if (result.connected) {
        setAWSStatus(result)
        setUseAWSConnection(true)
        setAuthenticated(true)

        if (credentials.rememberMe) {
          saveCredentials({
            accessKeyId: credentials.accessKeyId!,
            secretAccessKey: credentials.secretAccessKey!,
            region: credentials.region!,
            useAWS: true,
          })
        } else {
          clearSavedCredentials()
        }

        setNotification({
          open: true,
          message: `AWS Bedrock 연결 성공! (${result.region})`,
          severity: 'success',
        })
      } else {
        await invoke('clear_aws_credentials')
        setNotification({
          open: true,
          message: 'AWS 연결 실패. 자격 증명을 확인하세요.',
          severity: 'error',
        })
      }
    } catch (error) {
      setNotification({
        open: true,
        message: `연결 오류: ${error}`,
        severity: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          {/* Logo */}
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)',
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': {
                  transform: 'scale(1)',
                  boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)',
                },
                '50%': {
                  transform: 'scale(1.05)',
                  boxShadow: '0 15px 50px rgba(16, 185, 129, 0.6)',
                },
              },
            }}
          >
            <HandboxIcon sx={{ fontSize: 40, color: 'white' }} />
          </Box>

          {/* Title */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(90deg, #fff 0%, #6ee7b7 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 3,
            }}
          >
            Handbox
          </Typography>

          {/* Loading indicator */}
          <CircularProgress
            size={32}
            sx={{
              color: '#10b981',
              mb: 2,
            }}
          />

          {/* Loading message */}
          <Typography
            variant="body2"
            sx={{
              color: 'grey.400',
              display: 'block',
            }}
          >
            {loadingMessage}
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      {!isAuthenticated ? (
        <ProviderSetup onLogin={handleLogin} onSkip={handleSkipAWS} />
      ) : (
        <MainLayout />
      )}

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={notification.severity} sx={{ width: '100%', borderRadius: 2 }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default App
