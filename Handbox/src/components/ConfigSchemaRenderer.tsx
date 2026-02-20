/**
 * ConfigSchemaRenderer — configSchema 기반 PropertyPanel 자동 생성
 *
 * NodeDefinition.configSchema (ConfigField[])를 읽어서
 * 적절한 MUI 폼 컨트롤을 자동으로 렌더링한다.
 *
 * 기존 PropertyPanel의 2600줄 하드코딩을 대체하기 위한 핵심 컴포넌트.
 */

import React, { useCallback, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Switch,
  FormControlLabel,
  Button,
  Chip,
  ListSubheader,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { invoke } from '@tauri-apps/api/tauri'
import type { ConfigField } from '../engine/types'
import { useAppStore, type AIProvider } from '../stores/appStore'

// ============================================================
// 프로바이더 및 모델 정의
// ============================================================

export interface ProviderInfo {
  id: AIProvider
  name: string
  icon: string
  models: { id: string; name: string; category?: string }[]
}

export const PROVIDER_DEFINITIONS: ProviderInfo[] = [
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    icon: '☁️',
    models: [
      { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', name: 'Claude 3.5 Sonnet', category: 'Anthropic' },
      { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus', category: 'Anthropic' },
      { id: 'anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet', category: 'Anthropic' },
      { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku', category: 'Anthropic' },
      { id: 'meta.llama3-1-405b-instruct-v1:0', name: 'Llama 3.1 405B', category: 'Meta' },
      { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B', category: 'Meta' },
      { id: 'amazon.titan-text-premier-v1:0', name: 'Titan Text Premier', category: 'Amazon' },
      { id: 'mistral.mistral-large-2407-v1:0', name: 'Mistral Large', category: 'Mistral' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'o1-preview', name: 'O1 Preview' },
      { id: 'o1-mini', name: 'O1 Mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    icon: '🔴',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
    ],
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    icon: '🔷',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Azure)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo (Azure)' },
      { id: 'gpt-35-turbo', name: 'GPT-3.5 Turbo (Azure)' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (로컬)',
    icon: '🦙',
    models: [
      { id: 'llama3', name: 'Llama 3' },
      { id: 'llama3:70b', name: 'Llama 3 70B' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'mixtral', name: 'Mixtral' },
      { id: 'codellama', name: 'Code Llama' },
      { id: 'phi3', name: 'Phi-3' },
      { id: 'gemma', name: 'Gemma' },
    ],
  },
]

/** 프로바이더가 API 키가 설정되었는지 확인 */
function useProviderAvailability(): Map<AIProvider, boolean> {
  const { aiModelConfig, awsStatus } = useAppStore()

  return useMemo(() => {
    const availability = new Map<AIProvider, boolean>()

    // Bedrock - AWS 연결 상태 확인
    availability.set('bedrock', awsStatus?.connected || false)

    // OpenAI - API 키 확인
    availability.set('openai', !!aiModelConfig.openaiApiKey?.trim())

    // Anthropic - API 키 확인
    availability.set('anthropic', !!aiModelConfig.anthropicApiKey?.trim())

    // Google - API 키 확인
    availability.set('google', !!aiModelConfig.googleApiKey?.trim())

    // Azure - Endpoint + API 키 확인
    availability.set('azure', !!(aiModelConfig.azureEndpoint?.trim() && aiModelConfig.azureApiKey?.trim()))

    // Ollama - Base URL이 있으면 가능 (기본값이 있으므로 항상 true로 처리)
    availability.set('ollama', true)

    return availability
  }, [aiModelConfig, awsStatus])
}

/** 사용 가능한 프로바이더 목록 (API 키 설정된 것 우선) */
export function getAvailableProviders(): { provider: ProviderInfo; available: boolean }[] {
  const { aiModelConfig, awsStatus } = useAppStore.getState()

  return PROVIDER_DEFINITIONS.map(provider => {
    let available = false
    switch (provider.id) {
      case 'bedrock': available = awsStatus?.connected || false; break
      case 'openai': available = !!aiModelConfig.openaiApiKey?.trim(); break
      case 'anthropic': available = !!aiModelConfig.anthropicApiKey?.trim(); break
      case 'google': available = !!aiModelConfig.googleApiKey?.trim(); break
      case 'azure': available = !!(aiModelConfig.azureEndpoint?.trim() && aiModelConfig.azureApiKey?.trim()); break
      case 'ollama': available = true; break
    }
    return { provider, available }
  })
}

/** 가장 우선적으로 사용 가능한 프로바이더 자동 선택 */
export function getDefaultAvailableProvider(): AIProvider | null {
  const providers = getAvailableProviders()

  // 우선순위: bedrock > openai > anthropic > google > azure > ollama
  const priority: AIProvider[] = ['bedrock', 'openai', 'anthropic', 'google', 'azure', 'ollama']

  for (const p of priority) {
    const found = providers.find(item => item.provider.id === p && item.available)
    if (found) return found.provider.id
  }

  return null
}

interface ConfigSchemaRendererProps {
  /** configSchema 필드 배열 */
  fields: ConfigField[]
  /** 현재 설정 값 */
  values: Record<string, any>
  /** 값 변경 콜백 */
  onChange: (key: string, value: any) => void
}

export default function ConfigSchemaRenderer({
  fields,
  values,
  onChange,
}: ConfigSchemaRendererProps) {
  // 조건부 표시 필드 필터링
  const visibleFields = fields.filter((field) => {
    if (!field.showWhen) return true
    return values[field.showWhen.key] === field.showWhen.value
  })

  // 그룹별로 정리
  const groups = new Map<string, ConfigField[]>()
  for (const field of visibleFields) {
    const group = field.group || ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(field)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from(groups.entries()).map(([groupName, groupFields]) => (
        <React.Fragment key={groupName || '__default'}>
          {groupName && (
            <Typography variant="subtitle2" color="grey.400" sx={{ mt: 1 }}>
              {groupName}
            </Typography>
          )}
          {groupFields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={values[field.key] ?? field.default}
              onChange={onChange}
            />
          ))}
        </React.Fragment>
      ))}
    </Box>
  )
}

// ============================================================
// 개별 필드 렌더러
// ============================================================

interface FieldRendererProps {
  field: ConfigField
  value: any
  onChange: (key: string, value: any) => void
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const handleChange = useCallback(
    (newValue: any) => onChange(field.key, newValue),
    [field.key, onChange],
  )

  const commonSx = {
    '& .MuiOutlinedInput-root': {
      background: 'rgba(255,255,255,0.05)',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
      '&.Mui-focused fieldset': { borderColor: '#6366f1' },
    },
    '& .MuiInputLabel-root': { color: 'grey.400' },
    '& input, & textarea': { color: 'white', fontSize: '0.85rem' },
  }

  switch (field.type) {
    case 'text':
      return (
        <TextField
          fullWidth
          size="small"
          label={field.label}
          value={value || ''}
          placeholder={field.placeholder}
          helperText={field.description}
          required={field.required}
          onChange={(e) => handleChange(e.target.value)}
          sx={commonSx}
          FormHelperTextProps={{ sx: { color: 'grey.500', fontSize: '0.7rem' } }}
        />
      )

    case 'textarea':
    case 'code':
      return (
        <TextField
          fullWidth
          size="small"
          label={field.label}
          value={value || ''}
          placeholder={field.placeholder}
          helperText={field.description}
          required={field.required}
          multiline
          rows={field.rows || 4}
          onChange={(e) => handleChange(e.target.value)}
          sx={{
            ...commonSx,
            '& textarea': {
              fontFamily: field.type === 'code' ? 'monospace' : 'inherit',
              fontSize: '0.8rem',
            },
          }}
          FormHelperTextProps={{ sx: { color: 'grey.500', fontSize: '0.7rem' } }}
        />
      )

    case 'number':
      return (
        <TextField
          fullWidth
          size="small"
          type="number"
          label={field.label}
          value={value ?? field.default ?? ''}
          placeholder={field.placeholder}
          helperText={field.description}
          required={field.required}
          inputProps={{ min: field.min, max: field.max, step: field.step || 1 }}
          onChange={(e) => handleChange(Number(e.target.value))}
          sx={commonSx}
          FormHelperTextProps={{ sx: { color: 'grey.500', fontSize: '0.7rem' } }}
        />
      )

    case 'select':
      return (
        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: 'grey.400' }}>{field.label}</InputLabel>
          <Select
            value={value ?? field.default ?? ''}
            label={field.label}
            onChange={(e) => handleChange(e.target.value)}
            sx={{
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
            }}
          >
            {field.options?.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
          {field.description && (
            <Typography variant="caption" color="grey.500" sx={{ mt: 0.5, fontSize: '0.7rem' }}>
              {field.description}
            </Typography>
          )}
        </FormControl>
      )

    case 'toggle':
      return (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(value ?? field.default)}
              onChange={(e) => handleChange(e.target.checked)}
              size="small"
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#6366f1' } }}
            />
          }
          label={
            <Box>
              <Typography variant="body2" color="white" sx={{ fontSize: '0.85rem' }}>
                {field.label}
              </Typography>
              {field.description && (
                <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.7rem' }}>
                  {field.description}
                </Typography>
              )}
            </Box>
          }
        />
      )

    case 'slider':
      return (
        <Box>
          <Typography variant="body2" color="grey.300" sx={{ mb: 1, fontSize: '0.85rem' }}>
            {field.label}: <b>{value ?? field.default}</b>
          </Typography>
          <Slider
            value={value ?? field.default ?? 0.5}
            min={field.min ?? 0}
            max={field.max ?? 1}
            step={field.step ?? 0.1}
            onChange={(_, v) => handleChange(v)}
            sx={{ color: '#6366f1' }}
          />
          {field.description && (
            <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.7rem' }}>
              {field.description}
            </Typography>
          )}
        </Box>
      )

    case 'file':
      return (
        <Box>
          <Typography variant="body2" color="grey.300" sx={{ mb: 0.5, fontSize: '0.85rem' }}>
            {field.label}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={value || ''}
              placeholder={field.placeholder || '파일을 선택하세요'}
              onChange={(e) => handleChange(e.target.value)}
              sx={commonSx}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                try {
                  const result = await invoke<string | null>('select_file', {
                    title: field.label,
                    filters: field.accept ? field.accept.split(',').map(f => f.replace('.', '').trim()) : undefined,
                  })
                  if (result) handleChange(result)
                } catch {
                  // 다이얼로그 취소
                }
              }}
              sx={{ minWidth: 40, borderColor: 'rgba(255,255,255,0.2)', color: 'grey.300' }}
            >
              <InsertDriveFileIcon sx={{ fontSize: 18 }} />
            </Button>
          </Box>
        </Box>
      )

    case 'folder':
      return (
        <Box>
          <Typography variant="body2" color="grey.300" sx={{ mb: 0.5, fontSize: '0.85rem' }}>
            {field.label}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={value || ''}
              placeholder={field.placeholder || '폴더를 선택하세요'}
              onChange={(e) => handleChange(e.target.value)}
              sx={commonSx}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                try {
                  const result = await invoke<string | null>('select_folder', { title: field.label })
                  if (result) handleChange(result)
                } catch {
                  // 다이얼로그 취소
                }
              }}
              sx={{ minWidth: 40, borderColor: 'rgba(255,255,255,0.2)', color: 'grey.300' }}
            >
              <FolderOpenIcon sx={{ fontSize: 18 }} />
            </Button>
          </Box>
        </Box>
      )

    case 'provider':
      return <ProviderSelector field={field} value={value} onChange={handleChange} />

    case 'model':
      return <ModelSelector field={field} value={value} onChange={handleChange} />

    default:
      return (
        <TextField
          fullWidth
          size="small"
          label={field.label}
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          sx={commonSx}
        />
      )
  }
}

// ============================================================
// 프로바이더 선택 컴포넌트
// ============================================================

interface ProviderSelectorProps {
  field: ConfigField
  value: string
  onChange: (value: string) => void
}

function ProviderSelector({ field, value, onChange }: ProviderSelectorProps) {
  const availability = useProviderAvailability()

  // 사용 가능한 프로바이더가 없으면 자동으로 첫 번째 사용 가능한 것으로 설정
  React.useEffect(() => {
    if (!value) {
      const defaultProvider = getDefaultAvailableProvider()
      if (defaultProvider) {
        onChange(defaultProvider)
      }
    }
  }, [value, onChange])

  return (
    <FormControl fullWidth size="small">
      <InputLabel sx={{ color: 'grey.400' }}>{field.label}</InputLabel>
      <Select
        value={value || ''}
        label={field.label}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          background: 'rgba(255,255,255,0.05)',
          color: 'white',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
        }}
        renderValue={(selected) => {
          const provider = PROVIDER_DEFINITIONS.find(p => p.id === selected)
          const isAvailable = availability.get(selected as AIProvider) || false
          if (!provider) return selected
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>{provider.icon}</span>
              <span>{provider.name}</span>
              {isAvailable ? (
                <Chip label="연결됨" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#10b981', color: 'white' }} />
              ) : (
                <Chip label="API 키 필요" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#ef4444', color: 'white' }} />
              )}
            </Box>
          )
        }}
      >
        {/* API 키 있는 프로바이더 */}
        <ListSubheader sx={{ bgcolor: '#1e293b', color: '#10b981', fontSize: '0.75rem' }}>
          ✅ 사용 가능 (API 키 설정됨)
        </ListSubheader>
        {PROVIDER_DEFINITIONS.filter(p => availability.get(p.id)).map((provider) => (
          <MenuItem key={provider.id} value={provider.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <span>{provider.icon}</span>
              <span>{provider.name}</span>
              <CheckCircleIcon sx={{ ml: 'auto', fontSize: 16, color: '#10b981' }} />
            </Box>
          </MenuItem>
        ))}

        {/* API 키 없는 프로바이더 */}
        <ListSubheader sx={{ bgcolor: '#1e293b', color: '#94a3b8', fontSize: '0.75rem' }}>
          ⚠️ API 키 설정 필요
        </ListSubheader>
        {PROVIDER_DEFINITIONS.filter(p => !availability.get(p.id)).map((provider) => (
          <MenuItem key={provider.id} value={provider.id} disabled>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', opacity: 0.5 }}>
              <span>{provider.icon}</span>
              <span>{provider.name}</span>
              <CancelIcon sx={{ ml: 'auto', fontSize: 16, color: '#ef4444' }} />
            </Box>
          </MenuItem>
        ))}
      </Select>
      {field.description && (
        <Typography variant="caption" color="grey.500" sx={{ mt: 0.5, fontSize: '0.7rem' }}>
          {field.description}
        </Typography>
      )}
    </FormControl>
  )
}

// ============================================================
// 모델 선택 컴포넌트
// ============================================================

interface ModelSelectorProps {
  field: ConfigField
  value: string
  onChange: (value: string) => void
}

function ModelSelector({ field, value, onChange }: ModelSelectorProps) {
  // 부모 컴포넌트에서 provider 값을 알아야 함
  // ConfigSchemaRenderer는 values를 통해 이 정보를 알 수 있음
  // 그러나 여기서는 field만 받으므로, 전역 상태에서 현재 선택된 provider를 확인

  // TODO: 이상적으로는 부모에서 values를 전달받아야 함
  // 임시로 전체 프로바이더의 모델 목록을 보여줌

  const availability = useProviderAvailability()

  // 사용 가능한 프로바이더의 모델만 표시
  const availableProviders = PROVIDER_DEFINITIONS.filter(p => availability.get(p.id))

  return (
    <FormControl fullWidth size="small">
      <InputLabel sx={{ color: 'grey.400' }}>{field.label}</InputLabel>
      <Select
        value={value || ''}
        label={field.label}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          background: 'rgba(255,255,255,0.05)',
          color: 'white',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
        }}
      >
        {availableProviders.map((provider) => [
          <ListSubheader key={`header-${provider.id}`} sx={{ bgcolor: '#1e293b', color: '#10b981', fontSize: '0.75rem' }}>
            {provider.icon} {provider.name}
          </ListSubheader>,
          ...provider.models.map((model) => (
            <MenuItem key={model.id} value={model.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <span>{model.name}</span>
                {model.category && (
                  <Chip label={model.category} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#334155', color: '#94a3b8' }} />
                )}
              </Box>
            </MenuItem>
          )),
        ])}
      </Select>
      {field.description && (
        <Typography variant="caption" color="grey.500" sx={{ mt: 0.5, fontSize: '0.7rem' }}>
          {field.description}
        </Typography>
      )}
    </FormControl>
  )
}
