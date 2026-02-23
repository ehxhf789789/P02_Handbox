/**
 * Task Plan Viewer
 *
 * OrchestratorAgent가 생성한 작업 계획을 시각화하고,
 * 사용자가 검토/수정/승인할 수 있게 하는 컴포넌트.
 *
 * 기능:
 * - 작업 계획을 노드 그래프로 시각화
 * - 단계별 상세 정보 표시
 * - 단계 추가/수정/삭제/순서변경
 * - 실행 전 검토 및 승인
 * - XAI 설명 통합 표시
 */

import React, { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  LinearProgress,
  Divider,
  Alert,
  Collapse,
  useTheme,
  alpha,
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  DragIndicator as DragIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Loop as RunningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Psychology as XAIIcon,
  Warning as WarningIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { XAIExplanationPanel } from '../XAIExplanation'
import type {
  TaskPlan,
  TaskStep,
  PlanModification,
  Risk,
  Resource,
  XAIExplanation,
} from '../../agents/types'

// ============================================================
// Types
// ============================================================

interface TaskPlanViewerProps {
  plan: TaskPlan
  onApprove: () => void
  onModify: (modifications: PlanModification[]) => void
  onCancel: () => void
  isExecuting?: boolean
  executionProgress?: number
  currentStepId?: string
}

interface SortableStepProps {
  step: TaskStep
  index: number
  isCurrentStep: boolean
  onEdit: (step: TaskStep) => void
  onDelete: (stepId: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  isFirst: boolean
  isLast: boolean
  totalSteps: number
}

interface StepEditorDialogProps {
  open: boolean
  step: TaskStep | null
  isNew: boolean
  onSave: (step: Partial<TaskStep>) => void
  onClose: () => void
}

// ============================================================
// Step Status Icon
// ============================================================

const StepStatusIcon: React.FC<{ status: TaskStep['status'] }> = ({ status }) => {
  const statusConfig = {
    pending: { icon: <PendingIcon />, color: 'text.secondary' },
    running: { icon: <RunningIcon sx={{ animation: 'spin 1s linear infinite' }} />, color: 'info.main' },
    completed: { icon: <CheckIcon />, color: 'success.main' },
    failed: { icon: <ErrorIcon />, color: 'error.main' },
    skipped: { icon: <PendingIcon />, color: 'warning.main' },
  }

  const config = statusConfig[status]

  return (
    <Box sx={{ color: config.color }}>
      {config.icon}
    </Box>
  )
}

// ============================================================
// Sortable Step Item
// ============================================================

const StepItem: React.FC<SortableStepProps> = ({
  step,
  index,
  isCurrentStep,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  totalSteps,
}) => {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        borderLeft: `4px solid ${
          isCurrentStep
            ? theme.palette.info.main
            : step.status === 'completed'
            ? theme.palette.success.main
            : step.status === 'failed'
            ? theme.palette.error.main
            : theme.palette.divider
        }`,
        bgcolor: isCurrentStep
          ? alpha(theme.palette.info.main, 0.05)
          : 'background.paper',
      }}
    >
      <ListItem
        sx={{ py: 1 }}
        secondaryAction={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="위로 이동">
              <span>
                <IconButton
                  size="small"
                  onClick={() => onMoveUp(index)}
                  disabled={isFirst}
                >
                  <ArrowUpIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="아래로 이동">
              <span>
                <IconButton
                  size="small"
                  onClick={() => onMoveDown(index)}
                  disabled={isLast}
                >
                  <ArrowDownIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="편집">
              <IconButton size="small" onClick={() => onEdit(step)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="삭제">
              <IconButton
                size="small"
                onClick={() => onDelete(step.id)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <DragIcon sx={{ color: 'text.disabled' }} />
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 36 }}>
          <StepStatusIcon status={step.status} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {index + 1}. {step.name}
              </Typography>
              <Chip
                size="small"
                label={step.nodeType}
                sx={{ height: 18, fontSize: 10 }}
              />
              <Chip
                size="small"
                label={`${step.estimatedDuration}ms`}
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
              <IconButton
                size="small"
                onClick={() => setExpanded(!expanded)}
                sx={{ ml: 'auto', mr: 15 }}
              >
                {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
          }
          secondary={step.description}
          secondaryTypographyProps={{ fontSize: 12 }}
        />
      </ListItem>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pl: 9 }}>
          <Divider sx={{ mb: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                담당 에이전트
              </Typography>
              <Typography variant="body2">{step.assignedAgent}</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                의존성
              </Typography>
              <Typography variant="body2">
                {step.dependencies.length > 0 ? step.dependencies.join(', ') : '없음'}
              </Typography>
            </Box>
          </Box>
          {Object.keys(step.nodeConfig).length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                노드 설정
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, bgcolor: 'background.default' }}>
                <Typography
                  component="pre"
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(step.nodeConfig, null, 2)}
                </Typography>
              </Paper>
            </Box>
          )}
          {step.result && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                실행 결과
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, bgcolor: alpha(theme.palette.success.main, 0.05) }}>
                <Typography
                  component="pre"
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 150,
                    overflow: 'auto',
                  }}
                >
                  {typeof step.result === 'object'
                    ? JSON.stringify(step.result, null, 2)
                    : String(step.result)}
                </Typography>
              </Paper>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  )
}

// ============================================================
// Step Editor Dialog
// ============================================================

const StepEditorDialog: React.FC<StepEditorDialogProps> = ({
  open,
  step,
  isNew,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(step?.name || '')
  const [description, setDescription] = useState(step?.description || '')
  const [nodeType, setNodeType] = useState(step?.nodeType || 'control.script')
  const [estimatedDuration, setEstimatedDuration] = useState(step?.estimatedDuration || 1000)

  React.useEffect(() => {
    if (step) {
      setName(step.name)
      setDescription(step.description)
      setNodeType(step.nodeType)
      setEstimatedDuration(step.estimatedDuration)
    } else {
      setName('')
      setDescription('')
      setNodeType('control.script')
      setEstimatedDuration(1000)
    }
  }, [step])

  const handleSave = () => {
    onSave({
      name,
      description,
      nodeType,
      estimatedDuration,
      nodeConfig: step?.nodeConfig || {},
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isNew ? '새 단계 추가' : '단계 편집'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="단계 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <FormControl fullWidth>
            <InputLabel>노드 타입</InputLabel>
            <Select
              value={nodeType}
              label="노드 타입"
              onChange={(e) => setNodeType(e.target.value)}
            >
              <MenuItem value="data.file-loader">data.file-loader</MenuItem>
              <MenuItem value="data.preprocess">data.preprocess</MenuItem>
              <MenuItem value="ai.llm-invoke">ai.llm-invoke</MenuItem>
              <MenuItem value="ai.embedding">ai.embedding</MenuItem>
              <MenuItem value="control.script">control.script</MenuItem>
              <MenuItem value="control.conditional">control.conditional</MenuItem>
              <MenuItem value="control.merge">control.merge</MenuItem>
              <MenuItem value="viz.result-viewer">viz.result-viewer</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="예상 소요 시간 (ms)"
            type="number"
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 0)}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name}>
          {isNew ? '추가' : '저장'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ============================================================
// Risk Panel
// ============================================================

const RiskPanel: React.FC<{ risks: Risk[] }> = ({ risks }) => {
  const theme = useTheme()

  if (risks.length === 0) return null

  const highRisks = risks.filter(r => r.probability * r.impact > 0.5)

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <WarningIcon color="warning" />
        <Typography variant="subtitle2" fontWeight={600}>
          위험 요소
        </Typography>
        {highRisks.length > 0 && (
          <Chip
            size="small"
            label={`높은 위험 ${highRisks.length}개`}
            color="error"
            sx={{ ml: 'auto' }}
          />
        )}
      </Box>
      {risks.map((risk, idx) => (
        <Box
          key={idx}
          sx={{
            p: 1.5,
            mb: 1,
            borderRadius: 1,
            bgcolor: alpha(
              risk.probability * risk.impact > 0.5
                ? theme.palette.error.main
                : theme.palette.warning.main,
              0.1
            ),
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>
              {risk.type}
            </Typography>
            <Chip
              size="small"
              label={`${((risk.probability * risk.impact) * 100).toFixed(0)}%`}
              sx={{ height: 20, fontSize: 10 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" fontSize={12}>
            {risk.description}
          </Typography>
          <Typography variant="caption" color="primary" display="block" sx={{ mt: 0.5 }}>
            대응: {risk.mitigation}
          </Typography>
        </Box>
      ))}
    </Paper>
  )
}

// ============================================================
// Resource Panel
// ============================================================

const ResourcePanel: React.FC<{ resources: Resource[] }> = ({ resources }) => {
  const theme = useTheme()

  if (resources.length === 0) return null

  const unavailable = resources.filter(r => r.required && !r.available)

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          필요 리소스
        </Typography>
        {unavailable.length > 0 && (
          <Alert severity="error" sx={{ py: 0, ml: 'auto' }}>
            {unavailable.length}개 리소스 사용 불가
          </Alert>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {resources.map((resource, idx) => (
          <Chip
            key={idx}
            label={resource.name}
            icon={
              resource.available ? (
                <CheckIcon sx={{ fontSize: 14 }} />
              ) : (
                <ErrorIcon sx={{ fontSize: 14 }} />
              )
            }
            color={resource.available ? 'success' : 'error'}
            variant="outlined"
            size="small"
          />
        ))}
      </Box>
    </Paper>
  )
}

// ============================================================
// Main Component
// ============================================================

export const TaskPlanViewer: React.FC<TaskPlanViewerProps> = ({
  plan,
  onApprove,
  onModify,
  onCancel,
  isExecuting = false,
  executionProgress = 0,
  currentStepId,
}) => {
  const theme = useTheme()
  const [steps, setSteps] = useState<TaskStep[]>(plan.steps)
  const [showXAI, setShowXAI] = useState(false)
  const [editingStep, setEditingStep] = useState<TaskStep | null>(null)
  const [isAddingStep, setIsAddingStep] = useState(false)

  const totalDuration = useMemo(() => {
    return steps.reduce((sum, step) => sum + step.estimatedDuration, 0)
  }, [steps])

  const handleEditStep = (step: TaskStep) => {
    setEditingStep(step)
  }

  const handleDeleteStep = (stepId: string) => {
    setSteps(prev => prev.filter(s => s.id !== stepId))
    onModify([{ type: 'remove', stepId }])
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newSteps = [...steps]
      ;[newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]
      setSteps(newSteps)
      onModify([{
        type: 'reorder',
        stepId: steps[index].id,
        newOrder: index - 1,
      }])
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < steps.length - 1) {
      const newSteps = [...steps]
      ;[newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]
      setSteps(newSteps)
      onModify([{
        type: 'reorder',
        stepId: steps[index].id,
        newOrder: index + 1,
      }])
    }
  }

  const handleSaveStep = (stepData: Partial<TaskStep>) => {
    if (editingStep) {
      // 기존 단계 수정
      setSteps(prev =>
        prev.map(s => s.id === editingStep.id ? { ...s, ...stepData } : s)
      )
      onModify([{
        type: 'modify',
        stepId: editingStep.id,
        newStep: stepData,
      }])
    } else {
      // 새 단계 추가
      onModify([{
        type: 'add',
        newStep: stepData,
      }])
    }
    setEditingStep(null)
    setIsAddingStep(false)
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.02),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              작업 계획 검토
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {plan.interpretedIntent.primaryGoal}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip
                size="small"
                label={`${steps.length}개 단계`}
              />
              <Chip
                size="small"
                label={`예상 ${(totalDuration / 1000).toFixed(1)}초`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`복잡도 ${plan.interpretedIntent.complexity}/10`}
                color={plan.interpretedIntent.complexity > 7 ? 'warning' : 'default'}
                variant="outlined"
              />
              <Chip
                size="small"
                label={plan.status}
                color={
                  plan.status === 'completed' ? 'success' :
                  plan.status === 'executing' ? 'info' :
                  plan.status === 'failed' ? 'error' : 'default'
                }
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="XAI 설명 보기">
              <IconButton onClick={() => setShowXAI(!showXAI)}>
                <XAIIcon color={showXAI ? 'primary' : 'inherit'} />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setIsAddingStep(true)}
              disabled={isExecuting}
            >
              단계 추가
            </Button>
          </Box>
        </Box>

        {isExecuting && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                실행 진행률
              </Typography>
              <Typography variant="caption" fontWeight={600}>
                {(executionProgress * 100).toFixed(0)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={executionProgress * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}
      </Paper>

      {/* XAI Explanation */}
      <Collapse in={showXAI}>
        <Box sx={{ mb: 2 }}>
          <XAIExplanationPanel
            explanation={plan.explanation}
            onClose={() => setShowXAI(false)}
          />
        </Box>
      </Collapse>

      {/* Risks & Resources */}
      <RiskPanel risks={plan.risks} />
      <ResourcePanel resources={plan.requiredResources} />

      {/* Steps List */}
      <Paper variant="outlined" sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          실행 단계
        </Typography>

        <List disablePadding>
          {steps.map((step, index) => (
            <StepItem
              key={step.id}
              step={step}
              index={index}
              isCurrentStep={step.id === currentStepId}
              onEdit={handleEditStep}
              onDelete={handleDeleteStep}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              isFirst={index === 0}
              isLast={index === steps.length - 1}
              totalSteps={steps.length}
            />
          ))}
        </List>
      </Paper>

      {/* Action Buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          mt: 2,
          pt: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Button
          variant="outlined"
          color="error"
          startIcon={<CloseIcon />}
          onClick={onCancel}
          disabled={isExecuting}
        >
          취소
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={isExecuting ? <StopIcon /> : <PlayIcon />}
          onClick={onApprove}
          disabled={plan.requiredResources.some(r => r.required && !r.available)}
        >
          {isExecuting ? '중지' : '실행 승인'}
        </Button>
      </Box>

      {/* Step Editor Dialog */}
      <StepEditorDialog
        open={!!editingStep || isAddingStep}
        step={editingStep}
        isNew={isAddingStep}
        onSave={handleSaveStep}
        onClose={() => {
          setEditingStep(null)
          setIsAddingStep(false)
        }}
      />
    </Box>
  )
}

export default TaskPlanViewer
