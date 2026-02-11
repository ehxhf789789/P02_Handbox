import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Chip } from '@mui/material'
import StorageIcon from '@mui/icons-material/Storage'

interface KnowledgeBaseNodeData {
  label: string
  color: string
  description?: string
  config?: {
    index_name?: string
    chunk_size?: number
    top_k?: number
  }
}

function KnowledgeBaseNode({ data, selected }: NodeProps<KnowledgeBaseNodeData>) {
  return (
    <Box
      sx={{
        background: '#1e293b',
        borderRadius: 2,
        border: selected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected ? '0 0 20px rgba(245, 158, 11, 0.3)' : 'none',
        minWidth: 180,
        transition: 'all 0.2s',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: data.color || '#f59e0b',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />

      {/* Header */}
      <Box
        sx={{
          background: `${data.color}30`,
          p: 1.5,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <StorageIcon sx={{ color: data.color, fontSize: 20 }} />
        <Typography variant="body2" fontWeight="bold" color="white">
          {data.label}
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {data.config?.index_name && (
          <Typography variant="caption" color="grey.400" sx={{ display: 'block', mb: 0.5 }}>
            📁 {data.config.index_name}
          </Typography>
        )}

        {data.config?.top_k && (
          <Chip
            size="small"
            label={`Top ${data.config.top_k}`}
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fcd34d',
              mr: 0.5,
            }}
          />
        )}

        {data.config?.chunk_size && (
          <Chip
            size="small"
            label={`${data.config.chunk_size} chars`}
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: 'rgba(245, 158, 11, 0.1)',
              color: '#fde047',
            }}
          />
        )}
      </Box>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: data.color || '#f59e0b',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />
    </Box>
  )
}

export default memo(KnowledgeBaseNode)
