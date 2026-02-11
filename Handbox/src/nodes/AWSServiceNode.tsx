import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Chip } from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'

interface AWSServiceNodeData {
  label: string
  color: string
  description?: string
  config?: {
    endpoint?: string
    region?: string
  }
}

function AWSServiceNode({ data, selected }: NodeProps<AWSServiceNodeData>) {
  return (
    <Box
      sx={{
        background: '#1e293b',
        borderRadius: 2,
        border: selected ? '2px solid #ff9900' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected ? '0 0 20px rgba(255, 153, 0, 0.3)' : 'none',
        minWidth: 180,
        transition: 'all 0.2s',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#ff9900',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />

      {/* Header */}
      <Box
        sx={{
          background: 'rgba(255, 153, 0, 0.3)',
          p: 1.5,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <CloudIcon sx={{ color: '#ff9900', fontSize: 20 }} />
        <Typography variant="body2" fontWeight="bold" color="white">
          {data.label}
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {data.config?.region && (
          <Chip
            size="small"
            label={data.config.region}
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: 'rgba(255, 153, 0, 0.2)',
              color: '#fcd34d',
              mb: 0.5,
            }}
          />
        )}

        {data.description && (
          <Typography variant="caption" color="grey.500" sx={{ display: 'block' }}>
            {data.description}
          </Typography>
        )}
      </Box>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#ff9900',
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />
    </Box>
  )
}

export default memo(AWSServiceNode)
