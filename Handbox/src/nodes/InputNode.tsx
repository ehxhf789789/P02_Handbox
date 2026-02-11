import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Tooltip, Chip } from '@mui/material'
import InputIcon from '@mui/icons-material/Input'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import DataObjectIcon from '@mui/icons-material/DataObject'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'

interface InputNodeData {
  label: string
  color: string
  config?: {
    text_input?: string
    json_input?: string
    data?: string
  }
}

function InputNode({ data, selected }: NodeProps<InputNodeData>) {
  const textInput = data.config?.text_input || ''
  const jsonInput = data.config?.json_input || ''
  const hasInput = textInput.length > 0 || jsonInput.length > 0

  // 입력 텍스트 미리보기 (최대 100자)
  const getPreviewText = () => {
    if (textInput) {
      return textInput.length > 100 ? textInput.substring(0, 100) + '...' : textInput
    }
    if (jsonInput) {
      try {
        const parsed = JSON.parse(jsonInput)
        const preview = JSON.stringify(parsed).substring(0, 100)
        return preview.length < JSON.stringify(parsed).length ? preview + '...' : preview
      } catch {
        return jsonInput.substring(0, 100) + (jsonInput.length > 100 ? '...' : '')
      }
    }
    return null
  }

  const previewText = getPreviewText()
  const inputType = textInput ? 'text' : jsonInput ? 'json' : null

  return (
    <Box
      sx={{
        background: hasInput
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, #1e293b 100%)'
          : '#1e293b',
        borderRadius: 2,
        border: selected
          ? '2px solid #22c55e'
          : hasInput
          ? '2px solid rgba(34, 197, 94, 0.5)'
          : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected
          ? '0 0 20px rgba(34, 197, 94, 0.3)'
          : hasInput
          ? '0 0 15px rgba(34, 197, 94, 0.2)'
          : 'none',
        minWidth: 200,
        maxWidth: 280,
        transition: 'all 0.2s',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: 'rgba(34, 197, 94, 0.3)',
          p: 1.5,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <InputIcon sx={{ color: '#22c55e', fontSize: 20 }} />
        <Typography variant="body2" fontWeight="bold" color="white" sx={{ flex: 1 }}>
          {data.label}
        </Typography>
        {hasInput ? (
          <Tooltip title="입력 데이터 있음">
            <CheckCircleIcon sx={{ color: '#4ade80', fontSize: 16 }} />
          </Tooltip>
        ) : (
          <Tooltip title="입력 데이터 없음">
            <WarningIcon sx={{ color: '#fbbf24', fontSize: 16 }} />
          </Tooltip>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {/* 상태 표시 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <Chip
            size="small"
            label="워크플로우 시작"
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
            }}
          />
          {inputType && (
            <Chip
              size="small"
              icon={inputType === 'text' ? <TextFieldsIcon sx={{ fontSize: 12 }} /> : <DataObjectIcon sx={{ fontSize: 12 }} />}
              label={inputType === 'text' ? '텍스트' : 'JSON'}
              sx={{
                fontSize: '0.6rem',
                height: 18,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                '& .MuiChip-icon': { color: '#a5b4fc' },
              }}
            />
          )}
        </Box>

        {/* 입력 미리보기 */}
        {previewText ? (
          <Tooltip title={textInput || jsonInput} placement="bottom">
            <Box
              sx={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 1,
                p: 1,
                mt: 1,
                border: '1px solid rgba(34, 197, 94, 0.2)',
              }}
            >
              <Typography
                variant="caption"
                color="grey.400"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                입력 미리보기
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  lineHeight: 1.4,
                  fontFamily: inputType === 'json' ? 'monospace' : 'inherit',
                  wordBreak: 'break-word',
                  maxHeight: 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {previewText}
              </Typography>
            </Box>
          </Tooltip>
        ) : (
          <Box
            sx={{
              background: 'rgba(251, 191, 36, 0.1)',
              borderRadius: 1,
              p: 1,
              mt: 1,
              border: '1px dashed rgba(251, 191, 36, 0.3)',
              textAlign: 'center',
            }}
          >
            <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.7rem' }}>
              노드를 클릭하여 입력 데이터를 설정하세요
            </Typography>
          </Box>
        )}

        {/* 문자 수 표시 */}
        {hasInput && (
          <Typography
            variant="caption"
            color="grey.600"
            sx={{ display: 'block', mt: 1, fontSize: '0.6rem', textAlign: 'right' }}
          >
            {(textInput || jsonInput).length.toLocaleString()}자
          </Typography>
        )}
      </Box>

      {/* Output Handle Only */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#22c55e',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />
    </Box>
  )
}

export default memo(InputNode)
