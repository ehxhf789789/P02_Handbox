/**
 * StorageToggle - 로컬/클라우드 저장소 전환 위젯
 *
 * 사용자가 데이터 저장 위치를 선택할 수 있는 토글 컴포넌트
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Chip,
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import CloudIcon from '@mui/icons-material/Cloud'
import StorageIcon from '@mui/icons-material/Storage'
import LockIcon from '@mui/icons-material/Lock'

export type StorageMode = 'local-sqlite' | 'local-json' | 'cloud-s3' | 'cloud-vector'

interface StorageToggleProps {
  value: StorageMode
  onChange: (mode: StorageMode) => void
  disabled?: boolean
  compact?: boolean
}

interface StorageOption {
  value: StorageMode
  label: string
  description: string
  icon: React.ReactNode
  category: 'local' | 'cloud'
  available: boolean
}

const STORAGE_OPTIONS: StorageOption[] = [
  {
    value: 'local-sqlite',
    label: 'SQLite',
    description: '로컬 SQL 데이터베이스',
    icon: <StorageIcon sx={{ fontSize: 18 }} />,
    category: 'local',
    available: true,
  },
  {
    value: 'local-json',
    label: 'JSON',
    description: '로컬 JSON 파일',
    icon: <HomeIcon sx={{ fontSize: 18 }} />,
    category: 'local',
    available: true,
  },
  {
    value: 'cloud-s3',
    label: 'S3',
    description: 'AWS S3 클라우드 저장소',
    icon: <CloudIcon sx={{ fontSize: 18 }} />,
    category: 'cloud',
    available: true,
  },
  {
    value: 'cloud-vector',
    label: 'Vector DB',
    description: 'S3 + OpenSearch 벡터 DB',
    icon: <CloudIcon sx={{ fontSize: 18 }} />,
    category: 'cloud',
    available: true,
  },
]

export default function StorageToggle({
  value,
  onChange,
  disabled = false,
  compact = false,
}: StorageToggleProps) {
  const [category, setCategory] = useState<'local' | 'cloud'>(
    value.startsWith('local') ? 'local' : 'cloud'
  )

  const handleCategoryChange = (_: React.MouseEvent, newCategory: 'local' | 'cloud' | null) => {
    if (newCategory) {
      setCategory(newCategory)
      // 카테고리 변경 시 해당 카테고리의 첫 번째 옵션 선택
      const firstOption = STORAGE_OPTIONS.find(
        (opt) => opt.category === newCategory && opt.available
      )
      if (firstOption) {
        onChange(firstOption.value)
      }
    }
  }

  const handleModeChange = (_: React.MouseEvent, newMode: StorageMode | null) => {
    if (newMode) {
      onChange(newMode)
    }
  }

  const filteredOptions = STORAGE_OPTIONS.filter((opt) => opt.category === category)
  const currentOption = STORAGE_OPTIONS.find((opt) => opt.value === value)

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={currentOption?.description || ''}>
          <Chip
            icon={category === 'local' ? <HomeIcon /> : <CloudIcon />}
            label={currentOption?.label || value}
            size="small"
            variant="outlined"
            sx={{
              borderColor: category === 'local' ? '#10b981' : '#3b82f6',
              color: category === 'local' ? '#10b981' : '#3b82f6',
              '& .MuiChip-icon': {
                color: 'inherit',
              },
            }}
          />
        </Tooltip>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* 카테고리 선택 (로컬 / 클라우드) */}
      <Box sx={{ mb: 1.5 }}>
        <ToggleButtonGroup
          value={category}
          exclusive
          onChange={handleCategoryChange}
          disabled={disabled}
          size="small"
          fullWidth
          sx={{
            '& .MuiToggleButton-root': {
              flex: 1,
              py: 1,
              textTransform: 'none',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              '&.Mui-selected': {
                backgroundColor:
                  category === 'local' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                borderColor: category === 'local' ? '#10b981' : '#3b82f6',
                color: category === 'local' ? '#10b981' : '#3b82f6',
              },
            },
          }}
        >
          <ToggleButton value="local">
            <HomeIcon sx={{ mr: 1, fontSize: 18 }} />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                로컬
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.7 }}>
                SQLite / JSON
              </Typography>
            </Box>
          </ToggleButton>
          <ToggleButton value="cloud">
            <CloudIcon sx={{ mr: 1, fontSize: 18 }} />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                클라우드
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.7 }}>
                AWS S3 / 벡터DB
              </Typography>
            </Box>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* 세부 모드 선택 */}
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleModeChange}
        disabled={disabled}
        size="small"
        fullWidth
        sx={{
          '& .MuiToggleButton-root': {
            flex: 1,
            py: 0.75,
            textTransform: 'none',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            '&.Mui-selected': {
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              borderColor: '#6366f1',
              color: '#a5b4fc',
            },
            '&.Mui-disabled': {
              opacity: 0.4,
            },
          },
        }}
      >
        {filteredOptions.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            disabled={!option.available || disabled}
          >
            <Tooltip title={option.description}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {option.icon}
                <Typography variant="caption">{option.label}</Typography>
                {!option.available && <LockIcon sx={{ fontSize: 12, ml: 0.5, opacity: 0.5 }} />}
              </Box>
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* 선택된 모드 설명 */}
      {currentOption && (
        <Box sx={{ mt: 1, px: 1 }}>
          <Typography variant="caption" color="grey.500">
            {currentOption.description}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
