/**
 * WorkflowPreview Component
 *
 * 생성된 워크플로우를 미리보기로 표시.
 * 노드 목록과 연결 정보를 간략히 보여줌.
 */

import { memo } from 'react'
import { Box, Typography, Chip, Tooltip } from '@mui/material'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import type { WorkflowFile } from '../../types/WorkflowFile'

interface WorkflowPreviewProps {
  workflow: WorkflowFile
}

function WorkflowPreview({ workflow }: WorkflowPreviewProps) {
  const { nodes, edges, meta } = workflow

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AccountTreeIcon sx={{ color: '#10b981', fontSize: 18 }} />
        <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 600 }}>
          {meta.name}
        </Typography>
      </Box>

      {/* 설명 */}
      {meta.description && (
        <Typography
          variant="caption"
          sx={{ color: 'grey.400', display: 'block', mb: 1.5 }}
        >
          {meta.description}
        </Typography>
      )}

      {/* 노드 목록 */}
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'grey.500', mb: 0.5, display: 'block' }}>
          노드 ({nodes.length}개)
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {nodes.map((node) => (
            <Tooltip key={node.id} title={`${node.type}: ${node.data.label}`}>
              <Chip
                label={node.data.label}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  background: node.data.color
                    ? `${node.data.color}30`
                    : 'rgba(99, 102, 241, 0.2)',
                  color: node.data.color || '#a5b4fc',
                  border: `1px solid ${node.data.color || '#6366f1'}40`,
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Box>

      {/* 연결 요약 */}
      {edges.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ color: 'grey.500', mb: 0.5, display: 'block' }}>
            연결 ({edges.length}개)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {edges.slice(0, 5).map((edge) => {
              const sourceNode = nodes.find(n => n.id === edge.source)
              const targetNode = nodes.find(n => n.id === edge.target)
              return (
                <Box
                  key={edge.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.65rem',
                    color: 'grey.400',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'grey.300' }}>
                    {sourceNode?.data.label || edge.source}
                  </Typography>
                  <ArrowForwardIcon sx={{ fontSize: 12, color: 'grey.600' }} />
                  <Typography variant="caption" sx={{ color: 'grey.300' }}>
                    {targetNode?.data.label || edge.target}
                  </Typography>
                </Box>
              )
            })}
            {edges.length > 5 && (
              <Typography variant="caption" sx={{ color: 'grey.600', fontStyle: 'italic' }}>
                +{edges.length - 5}개 더...
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default memo(WorkflowPreview)
