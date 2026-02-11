import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Chip, Tooltip, CircularProgress } from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import StorageIcon from '@mui/icons-material/Storage'
import CloudIcon from '@mui/icons-material/Cloud'
import PsychologyIcon from '@mui/icons-material/Psychology'
import InputIcon from '@mui/icons-material/Input'
import OutputIcon from '@mui/icons-material/Output'
import TransformIcon from '@mui/icons-material/Transform'
import SearchIcon from '@mui/icons-material/Search'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import ImageIcon from '@mui/icons-material/Image'
import HubIcon from '@mui/icons-material/Hub'
import DataObjectIcon from '@mui/icons-material/DataObject'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import DescriptionIcon from '@mui/icons-material/Description'
import ApiIcon from '@mui/icons-material/Api'
import BarChartIcon from '@mui/icons-material/BarChart'
import PowerOffIcon from '@mui/icons-material/PowerOff'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import ScienceIcon from '@mui/icons-material/Science'
import { useWorkflowStore, NodeExecutionStatus } from '../stores/workflowStore'

interface GenericNodeData {
  label: string
  color: string
  description?: string
  provider?: string
  useCase?: string
  config?: Record<string, any>
  enabled?: boolean
}

// 노드 타입에 따른 아이콘 매핑
const getNodeIcon = (nodeType: string) => {
  // KISTI ScienceON
  if (nodeType.startsWith('kisti-')) return <ScienceIcon sx={{ fontSize: 18 }} />
  // 문서 파싱
  if (nodeType.startsWith('doc-')) return <DescriptionIcon sx={{ fontSize: 18 }} />
  // 문서 내보내기
  if (nodeType.startsWith('export-')) return <DescriptionIcon sx={{ fontSize: 18 }} />
  // 이미지 생성
  if (nodeType.startsWith('img-')) return <ImageIcon sx={{ fontSize: 18 }} />
  // 시각화
  if (nodeType.startsWith('viz-')) return <BarChartIcon sx={{ fontSize: 18 }} />
  // 지식베이스/벡터
  if (nodeType.startsWith('kb-') || nodeType.startsWith('vector-')) return <StorageIcon sx={{ fontSize: 18 }} />
  // API
  if (nodeType.startsWith('api-')) return <ApiIcon sx={{ fontSize: 18 }} />
  // 모델
  if (nodeType.startsWith('model-')) return <PsychologyIcon sx={{ fontSize: 18 }} />
  // AWS
  if (nodeType.startsWith('aws-')) return <CloudIcon sx={{ fontSize: 18 }} />
  // Bedrock
  if (nodeType.startsWith('bedrock-')) return <CloudIcon sx={{ fontSize: 18 }} />
  // 에이전트
  if (nodeType.includes('agent')) return <SmartToyIcon sx={{ fontSize: 18 }} />
  // 임베딩
  if (nodeType.includes('embed')) return <DataObjectIcon sx={{ fontSize: 18 }} />
  // 검색/벡터
  if (nodeType.includes('search') || nodeType.includes('vector')) return <SearchIcon sx={{ fontSize: 18 }} />
  // 저장소
  if (nodeType.includes('knowledge') || nodeType.includes('storage') || nodeType === 'aws-s3' || nodeType === 'aws-dynamodb') return <StorageIcon sx={{ fontSize: 18 }} />
  // 입력
  if (nodeType === 'input' || nodeType.includes('loader')) return <InputIcon sx={{ fontSize: 18 }} />
  // 출력
  if (nodeType === 'output') return <OutputIcon sx={{ fontSize: 18 }} />
  // 변환
  if (nodeType.includes('split') || nodeType.includes('transform')) return <TransformIcon sx={{ fontSize: 18 }} />
  // 프롬프트
  if (nodeType.includes('prompt') || nodeType.includes('text')) return <TextFieldsIcon sx={{ fontSize: 18 }} />
  // 이미지
  if (nodeType.includes('image') || nodeType.includes('stable')) return <ImageIcon sx={{ fontSize: 18 }} />
  // 제어
  if (nodeType.includes('conditional') || nodeType.includes('loop') || nodeType.includes('merge') || nodeType.includes('hub')) return <HubIcon sx={{ fontSize: 18 }} />
  return <SmartToyIcon sx={{ fontSize: 18 }} />
}

// 노드 타입에 따른 카테고리
const getNodeCategory = (nodeType: string): string => {
  if (nodeType.startsWith('model-')) return 'Bedrock Model'
  if (nodeType.startsWith('aws-')) return 'AWS Service'
  if (nodeType.startsWith('bedrock-')) return 'Bedrock Platform'
  if (nodeType.startsWith('doc-')) return 'Document Parser'
  if (nodeType.startsWith('export-')) return 'Export'
  if (nodeType.startsWith('img-')) return 'Image Gen'
  if (nodeType.startsWith('viz-')) return 'Visualization'
  if (nodeType.startsWith('kb-') || nodeType.startsWith('vector-')) return 'Knowledge Base'
  if (nodeType.startsWith('api-')) return 'API'
  if (nodeType.includes('agent')) return 'AI Agent'
  if (nodeType === 'input' || nodeType === 'output') return 'I/O'
  if (nodeType.includes('knowledge') || nodeType.includes('embed') || nodeType.includes('vector') || nodeType.includes('split') || nodeType.includes('loader')) return 'Data'
  if (nodeType.includes('prompt')) return 'Prompt'
  return 'Control'
}

// 설정 개수에 따른 설명
const getConfigSummary = (config: Record<string, any> | undefined, nodeType: string): string | null => {
  if (!config) return null

  const keys = Object.keys(config)
  if (keys.length === 0) return null

  // 특정 노드 타입에 따른 요약
  if (nodeType.startsWith('model-')) {
    const temp = config.temperature
    const maxTokens = config.max_tokens || config.maxTokens
    const parts = []
    if (temp !== undefined) parts.push(`T:${temp}`)
    if (maxTokens) parts.push(`${maxTokens}토큰`)
    return parts.length > 0 ? parts.join(' • ') : null
  }

  if (nodeType === 'prompt-template' && config.template) {
    const templateLength = config.template.length
    return `템플릿 ${templateLength}자`
  }

  if (nodeType.startsWith('api-') && config.api_url) {
    try {
      const url = new URL(config.api_url)
      return url.hostname
    } catch {
      return config.api_url.substring(0, 20) + '...'
    }
  }

  if (config.system_prompt) {
    return `시스템 프롬프트 ${config.system_prompt.length}자`
  }

  return `${keys.length}개 설정`
}

// 실행 상태에 따른 출력 포맷팅
const formatOutput = (output: string | Record<string, any> | undefined): string => {
  if (!output) return ''
  if (typeof output === 'string') return output

  // 객체인 경우 주요 정보만 추출 (줄바꿈으로 구분)
  const lines: string[] = []

  // 평가 결과 (에이전트)
  if (output.verdict) {
    lines.push(`결과: ${output.verdict}`)
    if (output.novelty_score) lines.push(`신규성: ${output.novelty_score}점`)
    if (output.progress_score) lines.push(`진보성: ${output.progress_score}점`)
    if (output.confidence) lines.push(`신뢰도: ${output.confidence}`)
  }

  // 투표 집계 결과
  if (output.final_verdict && output.approved_count !== undefined) {
    lines.push(`최종: ${output.final_verdict}`)
    lines.push(`투표: ${output.approved_count}/${output.total_evaluators || 10}`)
    if (output.accuracy) lines.push(`정확도: ${output.accuracy}`)
  }

  // 문서 처리
  if (output.documents_parsed !== undefined) {
    lines.push(`문서: ${output.documents_parsed}개 처리`)
    if (output.total_pages) lines.push(`페이지: ${output.total_pages}`)
  }

  // 파일 로드
  if (output.files_loaded !== undefined) {
    lines.push(`파일: ${output.files_loaded}개`)
    if (output.total_size) lines.push(`크기: ${output.total_size}`)
  }

  // 문서 통합/병합
  if (output.merged_count !== undefined) {
    lines.push(`통합: ${output.merged_count}개`)
    if (output.output_format) lines.push(`형식: ${output.output_format}`)
  }

  // 텍스트 처리
  if (output.chunks_created !== undefined) {
    lines.push(`청크: ${output.chunks_created}개`)
  }

  // 임베딩
  if (output.vectors_created !== undefined) {
    lines.push(`벡터: ${output.vectors_created}개`)
  }

  // 검색 결과
  if (output.results_found !== undefined) {
    lines.push(`검색: ${output.results_found}건`)
  }

  // API 호출
  if (output.api_calls !== undefined) {
    lines.push(`API: ${output.api_calls}건`)
    if (output.response_time) lines.push(`응답: ${output.response_time}`)
  }

  // 모델 사용
  if (output.tokens_used !== undefined) {
    lines.push(`토큰: ${output.tokens_used}`)
    if (output.response_time) lines.push(`응답: ${output.response_time}`)
  }

  // 시각화
  if (output.visualization) {
    lines.push(`시각화: ${output.visualization}`)
  }

  // 검증 결과
  if (output.match !== undefined) {
    lines.push(`일치: ${output.match ? '일치함' : '불일치'}`)
    if (output.result_type) lines.push(`유형: ${output.result_type}`)
  }

  // 일반 상태
  if (output.status && lines.length === 0) {
    lines.push(`상태: ${output.status}`)
  }

  return lines.length > 0 ? lines.join('\n') : JSON.stringify(output).slice(0, 80)
}

function GenericNode({ data, selected, type, id }: NodeProps<GenericNodeData>) {
  const category = getNodeCategory(type || '')
  const icon = getNodeIcon(type || '')
  const configSummary = getConfigSummary(data.config, type || '')
  const hasConfig = data.config && Object.keys(data.config).length > 0
  const isDisabled = data.enabled === false

  // 실행 상태 가져오기
  const executionResult = useWorkflowStore((state) => state.nodeExecutionResults[id])
  const executionStatus: NodeExecutionStatus = executionResult?.status || 'idle'
  const executionOutput = executionResult?.output
  const executionDuration = executionResult?.duration

  // 중단점 상태
  const breakpointNodeId = useWorkflowStore((state) => state.breakpointNodeId)
  const isBreakpoint = breakpointNodeId === id

  // 상태별 배경 글로우
  const getStatusGlow = () => {
    switch (executionStatus) {
      case 'running': return '0 0 20px rgba(251, 191, 36, 0.5)'
      case 'completed': return '0 0 15px rgba(34, 197, 94, 0.3)'
      case 'error': return '0 0 15px rgba(239, 68, 68, 0.3)'
      default: return selected ? `0 0 20px ${data.color}40` : 'none'
    }
  }

  return (
    <Box
      sx={{
        background: isDisabled ? '#111827' : '#1e293b',
        borderRadius: 2,
        border: executionStatus === 'running'
          ? '2px solid #fbbf24'
          : executionStatus === 'completed'
            ? '2px solid #22c55e'
            : executionStatus === 'error'
              ? '2px solid #ef4444'
              : isBreakpoint
                ? '2px dashed #f97316'
                : selected
                  ? `2px solid ${data.color}`
                  : isDisabled
                    ? '2px dashed rgba(107, 114, 128, 0.5)'
                    : '1px solid rgba(255,255,255,0.1)',
        boxShadow: getStatusGlow(),
        minWidth: 180,
        maxWidth: 240,
        transition: 'all 0.3s',
        opacity: isDisabled ? 0.5 : 1,
        position: 'relative',
        // 실행 중 애니메이션
        animation: executionStatus === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        '@keyframes pulse': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(251, 191, 36, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(251, 191, 36, 0.6)' },
        },
        // React Flow 기본 스타일 오버라이드
        '& .react-flow__handle': {
          background: isDisabled ? '#6b7280' : data.color,
        },
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: data.color,
          width: 10,
          height: 10,
          border: '2px solid #0f172a',
        }}
      />

      {/* Breakpoint Badge */}
      {isBreakpoint && (
        <Tooltip title="중단점 - 이 노드에서 실행 중지">
          <Box
            sx={{
              position: 'absolute',
              top: -8,
              left: -8,
              background: '#f97316',
              borderRadius: '50%',
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              animation: 'breakpointPulse 2s ease-in-out infinite',
              '@keyframes breakpointPulse': {
                '0%, 100%': { boxShadow: '0 0 5px rgba(249, 115, 22, 0.3)' },
                '50%': { boxShadow: '0 0 15px rgba(249, 115, 22, 0.8)' },
              },
            }}
          >
            <StopCircleIcon sx={{ fontSize: 14, color: 'white' }} />
          </Box>
        </Tooltip>
      )}

      {/* Disabled Badge */}
      {isDisabled && (
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            background: '#ef4444',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          <PowerOffIcon sx={{ fontSize: 14, color: 'white' }} />
        </Box>
      )}

      {/* Execution Status Badge */}
      {!isDisabled && executionStatus !== 'idle' && (
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            background: executionStatus === 'running'
              ? '#fbbf24'
              : executionStatus === 'completed'
                ? '#22c55e'
                : '#ef4444',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {executionStatus === 'running' && (
            <CircularProgress size={14} sx={{ color: 'white' }} />
          )}
          {executionStatus === 'completed' && (
            <CheckCircleIcon sx={{ fontSize: 16, color: 'white' }} />
          )}
          {executionStatus === 'error' && (
            <ErrorIcon sx={{ fontSize: 16, color: 'white' }} />
          )}
        </Box>
      )}

      {/* Header */}
      <Box
        sx={{
          background: isDisabled ? 'rgba(107, 114, 128, 0.3)' : `${data.color}30`,
          p: 1.5,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box sx={{ color: isDisabled ? '#6b7280' : data.color }}>{icon}</Box>
        <Typography variant="body2" fontWeight="bold" color={isDisabled ? 'grey.500' : 'white'} sx={{ flex: 1, fontSize: '0.85rem' }}>
          {data.label}
        </Typography>
        {hasConfig && !isDisabled && (
          <Tooltip title="설정됨">
            <CheckCircleOutlineIcon sx={{ color: data.color, fontSize: 14, opacity: 0.8 }} />
          </Tooltip>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {/* Category Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
          <Chip
            size="small"
            label={category}
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: `${data.color}20`,
              color: data.color,
            }}
          />

          {/* Provider */}
          {data.provider && (
            <Chip
              size="small"
              label={data.provider}
              sx={{
                fontSize: '0.6rem',
                height: 18,
                background: 'rgba(255,255,255,0.1)',
                color: '#94a3b8',
              }}
            />
          )}
        </Box>

        {/* Description */}
        {data.description && (
          <Typography variant="caption" color="grey.500" sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem' }}>
            {data.description}
          </Typography>
        )}

        {/* Use Case */}
        {data.useCase && (
          <Typography variant="caption" color="grey.600" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', fontStyle: 'italic' }}>
            {data.useCase}
          </Typography>
        )}

        {/* Config Summary - 더 눈에 띄게 */}
        {configSummary && (
          <Box
            sx={{
              mt: 1,
              pt: 1,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <SettingsIcon sx={{ fontSize: 12, color: 'grey.600' }} />
            <Typography variant="caption" color="grey.400" sx={{ fontSize: '0.65rem' }}>
              {configSummary}
            </Typography>
          </Box>
        )}

        {/* 설정 안내 (설정이 없을 때) */}
        {!hasConfig && executionStatus === 'idle' && (
          <Box
            sx={{
              mt: 1,
              pt: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Typography variant="caption" color="grey.700" sx={{ fontSize: '0.6rem', fontStyle: 'italic' }}>
              클릭하여 설정
            </Typography>
          </Box>
        )}

        {/* Execution Output - 실행 결과 표시 */}
        {executionStatus !== 'idle' && (
          <Box
            sx={{
              mt: 1,
              pt: 1,
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* 상태 표시 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              {executionStatus === 'running' && (
                <>
                  <CircularProgress size={10} sx={{ color: '#fbbf24' }} />
                  <Typography variant="caption" sx={{ color: '#fbbf24', fontSize: '0.65rem', fontWeight: 'bold' }}>
                    실행 중...
                  </Typography>
                </>
              )}
              {executionStatus === 'completed' && (
                <>
                  <CheckCircleIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                  <Typography variant="caption" sx={{ color: '#22c55e', fontSize: '0.65rem', fontWeight: 'bold' }}>
                    완료 {executionDuration && `(${(executionDuration / 1000).toFixed(1)}s)`}
                  </Typography>
                </>
              )}
              {executionStatus === 'error' && (
                <>
                  <ErrorIcon sx={{ fontSize: 12, color: '#ef4444' }} />
                  <Typography variant="caption" sx={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 'bold' }}>
                    오류
                  </Typography>
                </>
              )}
            </Box>

            {/* Output 내용 */}
            {executionOutput && executionStatus === 'completed' && (
              <Tooltip title={typeof executionOutput === 'object' ? JSON.stringify(executionOutput, null, 2) : executionOutput}>
                <Box
                  sx={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: 1,
                    p: 0.75,
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#86efac',
                      fontSize: '0.6rem',
                      display: 'block',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {formatOutput(executionOutput)}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: data.color,
          width: 10,
          height: 10,
          border: '2px solid #0f172a',
        }}
      />
    </Box>
  )
}

export default memo(GenericNode)
