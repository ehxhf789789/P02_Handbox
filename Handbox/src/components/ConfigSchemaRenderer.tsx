/**
 * ConfigSchemaRenderer — configSchema 기반 PropertyPanel 자동 생성
 *
 * NodeDefinition.configSchema (ConfigField[])를 읽어서
 * 적절한 MUI 폼 컨트롤을 자동으로 렌더링한다.
 *
 * 기존 PropertyPanel의 2600줄 하드코딩을 대체하기 위한 핵심 컴포넌트.
 */

import React, { useCallback } from 'react'
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
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import { invoke } from '@tauri-apps/api/tauri'
import type { ConfigField } from '../engine/types'

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
    case 'model':
      // Provider/Model 선택은 ProviderRegistry와 연동
      return (
        <TextField
          fullWidth
          size="small"
          label={field.label}
          value={value || ''}
          placeholder={field.placeholder || (field.type === 'provider' ? '기본 프로바이더 사용' : '기본 모델 사용')}
          helperText={field.description}
          onChange={(e) => handleChange(e.target.value)}
          sx={commonSx}
          FormHelperTextProps={{ sx: { color: 'grey.500', fontSize: '0.7rem' } }}
        />
      )

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
