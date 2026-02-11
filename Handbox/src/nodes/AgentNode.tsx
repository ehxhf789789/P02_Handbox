import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Chip } from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'

interface AgentNodeData {
  label: string
  color: string
  description?: string
  config?: {
    model_id?: string
    temperature?: number
    use_rag?: boolean
  }
}

function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <Box
      sx={{
        background: '#1e293b',
        borderRadius: 2,
        border: selected ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected ? '0 0 20px rgba(99, 102, 241, 0.3)' : 'none',
        minWidth: 200,
        transition: 'all 0.2s',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: data.color || '#6366f1',
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
        <SmartToyIcon sx={{ color: data.color, fontSize: 20 }} />
        <Typography variant="body2" fontWeight="bold" color="white">
          {data.label}
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {data.config?.model_id && (
          <Chip
            size="small"
            label={data.config.model_id.split('.')[1]?.split('-')[0] || 'Claude'}
            sx={{
              fontSize: '0.65rem',
              height: 20,
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#a5b4fc',
              mb: 1,
            }}
          />
        )}

        {data.description && (
          <Typography variant="caption" color="grey.500" sx={{ display: 'block' }}>
            {data.description}
          </Typography>
        )}

        {data.config?.use_rag && (
          <Chip
            size="small"
            label="RAG"
            sx={{
              fontSize: '0.6rem',
              height: 18,
              mt: 1,
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#86efac',
            }}
          />
        )}
      </Box>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: data.color || '#6366f1',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />
    </Box>
  )
}

export default memo(AgentNode)
