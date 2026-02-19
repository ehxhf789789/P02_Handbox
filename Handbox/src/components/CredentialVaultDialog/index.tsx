// Credential Vault Dialog
// 자격증명 보안 저장소 관리 UI

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  InputAdornment,
  Tooltip,
  CircularProgress,
} from '@mui/material'
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Add as AddIcon,
  Cloud as CloudIcon,
  Key as KeyIcon,
  Security as SecurityIcon,
  Check as CheckIcon,
} from '@mui/icons-material'
import {
  useCredentialStore,
  CredentialProvider,
  CredentialType,
  PROVIDER_FIELDS,
  PROVIDER_NAMES,
} from '../../stores/credentialStore'

interface CredentialVaultDialogProps {
  open: boolean
  onClose: () => void
}

export default function CredentialVaultDialog({ open, onClose }: CredentialVaultDialogProps) {
  const {
    credentials,
    loading,
    error,
    loadCredentials,
    saveCredential,
    deleteCredential,
    clearError,
  } = useCredentialStore()

  // 폼 상태
  const [provider, setProvider] = useState<CredentialProvider>('aws')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // 초기 로드
  useEffect(() => {
    if (open) {
      loadCredentials()
    }
  }, [open, loadCredentials])

  // 프로바이더 변경 시 폼 초기화
  useEffect(() => {
    setValues({})
    setShowPasswords({})
    setName('')
    setDescription('')
  }, [provider])

  const handleSave = async () => {
    setSaving(true)
    setSuccess(false)
    clearError()

    const fields = PROVIDER_FIELDS[provider]
    const requiredFields = fields.filter((f) => f.required)
    const missingFields = requiredFields.filter((f) => !values[f.key])

    if (missingFields.length > 0) {
      setSaving(false)
      return
    }

    const result = await saveCredential({
      name: name || `${PROVIDER_NAMES[provider]} Credentials`,
      type: getCredentialType(provider),
      provider,
      description,
      values,
    })

    setSaving(false)

    if (result.success) {
      setSuccess(true)
      setValues({})
      setName('')
      setDescription('')
      setExpanded(false)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  const handleDelete = async (id: string, provider: CredentialProvider) => {
    if (window.confirm('Are you sure you want to delete this credential?')) {
      await deleteCredential(id, provider)
    }
  }

  const getCredentialType = (provider: CredentialProvider): CredentialType => {
    switch (provider) {
      case 'aws':
      case 'azure':
      case 'gcp':
        return 'access-key'
      case 'openai':
      case 'anthropic':
        return 'api-key'
      default:
        return 'custom'
    }
  }

  const getProviderIcon = (provider: CredentialProvider) => {
    switch (provider) {
      case 'aws':
      case 'azure':
      case 'gcp':
        return <CloudIcon sx={{ color: '#f59e0b' }} />
      default:
        return <KeyIcon sx={{ color: '#8b5cf6' }} />
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: '#1e293b',
          color: 'white',
        }}
      >
        <SecurityIcon sx={{ color: '#10b981' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Credential Vault
        </Typography>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: '#0f172a', color: 'white', p: 0 }}>
        {/* 에러 표시 */}
        {error && (
          <Alert severity="error" onClose={clearError} sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {/* 성공 표시 */}
        {success && (
          <Alert severity="success" sx={{ m: 2 }}>
            Credential saved successfully!
          </Alert>
        )}

        {/* 저장된 자격증명 목록 */}
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
            Saved Credentials
          </Typography>

          {credentials.length === 0 ? (
            <Typography variant="body2" sx={{ color: '#64748b', textAlign: 'center', py: 4 }}>
              No credentials saved yet. Add your first credential below.
            </Typography>
          ) : (
            <List sx={{ bgcolor: '#1e293b', borderRadius: 1 }}>
              {credentials.map((cred, index) => (
                <Box key={cred.id}>
                  {index > 0 && <Divider sx={{ borderColor: '#334155' }} />}
                  <ListItem>
                    <Box sx={{ mr: 2 }}>{getProviderIcon(cred.provider as CredentialProvider)}</Box>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1">{cred.name}</Typography>
                          <Chip
                            label={PROVIDER_NAMES[cred.provider as CredentialProvider] || cred.provider}
                            size="small"
                            sx={{
                              bgcolor: '#334155',
                              color: '#94a3b8',
                              fontSize: '0.7rem',
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {cred.description || `Added ${new Date(cred.createdAt).toLocaleDateString()}`}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Delete">
                        <IconButton
                          edge="end"
                          onClick={() => handleDelete(cred.id, cred.provider as CredentialProvider)}
                          sx={{ color: '#ef4444' }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </Box>

        <Divider sx={{ borderColor: '#334155' }} />

        {/* 새 자격증명 추가 */}
        <Accordion
          expanded={expanded}
          onChange={() => setExpanded(!expanded)}
          sx={{
            bgcolor: '#1e293b',
            color: 'white',
            '&:before': { display: 'none' },
            m: 2,
            borderRadius: 1,
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#94a3b8' }} />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AddIcon sx={{ color: '#10b981' }} />
              <Typography>Add New Credential</Typography>
            </Box>
          </AccordionSummary>

          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 프로바이더 선택 */}
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: '#94a3b8' }}>Provider</InputLabel>
                <Select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as CredentialProvider)}
                  label="Provider"
                  sx={{
                    color: 'white',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' },
                    '.MuiSvgIcon-root': { color: '#94a3b8' },
                  }}
                >
                  {Object.entries(PROVIDER_NAMES).map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* 이름 (선택) */}
              <TextField
                label="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="small"
                fullWidth
                placeholder={`${PROVIDER_NAMES[provider]} Credentials`}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    '& fieldset': { borderColor: '#334155' },
                    '&:hover fieldset': { borderColor: '#64748b' },
                  },
                  '& .MuiInputLabel-root': { color: '#94a3b8' },
                }}
              />

              {/* 프로바이더별 필드 */}
              {PROVIDER_FIELDS[provider].map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={values[field.key] || ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                  size="small"
                  fullWidth
                  required={field.required}
                  InputProps={
                    field.type === 'password'
                      ? {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() =>
                                  setShowPasswords({
                                    ...showPasswords,
                                    [field.key]: !showPasswords[field.key],
                                  })
                                }
                                edge="end"
                                sx={{ color: '#94a3b8' }}
                              >
                                {showPasswords[field.key] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }
                      : undefined
                  }
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: 'white',
                      '& fieldset': { borderColor: '#334155' },
                      '&:hover fieldset': { borderColor: '#64748b' },
                    },
                    '& .MuiInputLabel-root': { color: '#94a3b8' },
                  }}
                />
              ))}

              {/* 설명 (선택) */}
              <TextField
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    '& fieldset': { borderColor: '#334155' },
                    '&:hover fieldset': { borderColor: '#64748b' },
                  },
                  '& .MuiInputLabel-root': { color: '#94a3b8' },
                }}
              />

              {/* 저장 버튼 */}
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || loading}
                startIcon={saving ? <CircularProgress size={16} /> : <CheckIcon />}
                sx={{
                  bgcolor: '#10b981',
                  '&:hover': { bgcolor: '#059669' },
                  '&:disabled': { bgcolor: '#334155' },
                }}
              >
                {saving ? 'Saving...' : 'Save to Vault'}
              </Button>

              {/* 보안 안내 */}
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Credentials are securely stored in your operating system's credential manager (Windows
                Credential Manager / macOS Keychain / Linux Secret Service).
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#1e293b', borderTop: '1px solid #334155' }}>
        <Button onClick={onClose} sx={{ color: '#94a3b8' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
