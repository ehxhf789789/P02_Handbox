/**
 * XAI Explanation Panel
 *
 * 에이전트의 의사결정 과정을 시각화하는 컴포넌트.
 * 추론 단계, 대안, 사용된 지식, 신뢰도 근거를 표시.
 */

import React, { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Divider,
  IconButton,
  Tooltip,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  alpha,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Psychology as PsychologyIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  MenuBook as MenuBookIcon,
  Speed as SpeedIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  VisibilityOff as VisibilityOffIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material'
import type {
  XAIExplanation,
  ReasoningStep,
  Alternative,
  KnowledgeReference,
  ConfidenceFactor,
} from '../../agents/types'

// ============================================================
// Types
// ============================================================

interface XAIExplanationPanelProps {
  explanation: XAIExplanation
  confidence?: number
  processingTime?: number
  onClose?: () => void
  defaultExpanded?: boolean
  compact?: boolean
}

// ============================================================
// Sub-Components
// ============================================================

const ReasoningStepCard: React.FC<{ step: ReasoningStep; isLast: boolean }> = ({ step, isLast }) => {
  const theme = useTheme()
  const [showDetails, setShowDetails] = useState(false)

  return (
    <Step active completed>
      <StepLabel
        StepIconComponent={() => (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: theme.palette.primary.main,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {step.step}
          </Box>
        )}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {step.action}
          </Typography>
          {step.duration > 0 && (
            <Chip
              size="small"
              label={`${step.duration}ms`}
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
          <IconButton
            size="small"
            onClick={() => setShowDetails(!showDetails)}
            sx={{ ml: 'auto' }}
          >
            {showDetails ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
          </IconButton>
        </Box>
      </StepLabel>
      <StepContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {step.rationale}
        </Typography>
        <Collapse in={showDetails}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.background.default, 0.5),
              border: `1px solid ${theme.palette.divider}`,
              mt: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              입력:
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 100,
                overflow: 'auto',
                mb: 1,
              }}
            >
              {typeof step.input === 'object' ? JSON.stringify(step.input, null, 2) : String(step.input)}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              출력:
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 100,
                overflow: 'auto',
              }}
            >
              {typeof step.output === 'object' ? JSON.stringify(step.output, null, 2) : String(step.output || '-')}
            </Typography>
          </Box>
        </Collapse>
      </StepContent>
    </Step>
  )
}

const AlternativeCard: React.FC<{ alt: Alternative; index: number }> = ({ alt, index }) => {
  const theme = useTheme()

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return theme.palette.success.main
    if (score >= 0.5) return theme.palette.warning.main
    return theme.palette.error.main
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 1,
        borderLeft: `3px solid ${getScoreColor(alt.score)}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2">
          대안 {index + 1}: {alt.description}
        </Typography>
        <Chip
          size="small"
          label={`${(alt.score * 100).toFixed(0)}%`}
          sx={{
            ml: 'auto',
            bgcolor: alpha(getScoreColor(alt.score), 0.1),
            color: getScoreColor(alt.score),
            fontWeight: 600,
          }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" fontSize={12}>
        선택되지 않은 이유: {alt.rejectionReason}
      </Typography>
      <Typography variant="body2" color="text.secondary" fontSize={12}>
        예상 결과: {alt.expectedOutcome}
      </Typography>
    </Paper>
  )
}

const KnowledgeCard: React.FC<{ knowledge: KnowledgeReference }> = ({ knowledge }) => {
  const theme = useTheme()

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'memory':
        return <PsychologyIcon fontSize="small" />
      case 'pattern':
        return <TimelineIcon fontSize="small" />
      case 'rule':
        return <MenuBookIcon fontSize="small" />
      case 'example':
        return <LightbulbIcon fontSize="small" />
      default:
        return <InfoIcon fontSize="small" />
    }
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      memory: '기억',
      pattern: '패턴',
      rule: '규칙',
      example: '예시',
      'user-feedback': '사용자 피드백',
    }
    return labels[type] || type
  }

  return (
    <ListItem
      sx={{
        py: 0.5,
        px: 1,
        borderRadius: 1,
        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
      }}
    >
      <ListItemIcon sx={{ minWidth: 36 }}>
        {getTypeIcon(knowledge.type)}
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip size="small" label={getTypeLabel(knowledge.type)} sx={{ height: 18, fontSize: 10 }} />
            <Typography variant="body2" fontSize={12}>
              {knowledge.source}
            </Typography>
          </Box>
        }
        secondary={knowledge.summary}
        secondaryTypographyProps={{ fontSize: 11 }}
      />
      <Chip
        size="small"
        label={`${(knowledge.relevance * 100).toFixed(0)}%`}
        sx={{ height: 20, fontSize: 10 }}
      />
    </ListItem>
  )
}

const ConfidenceFactorBar: React.FC<{ factor: ConfidenceFactor }> = ({ factor }) => {
  const theme = useTheme()

  const getColor = (contribution: number) => {
    if (contribution > 0) return theme.palette.success.main
    if (contribution < 0) return theme.palette.error.main
    return theme.palette.grey[500]
  }

  const normalizedValue = (factor.contribution + 1) / 2 * 100

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" fontSize={12}>
          {factor.factor}
        </Typography>
        <Typography
          variant="body2"
          fontSize={12}
          fontWeight={600}
          color={getColor(factor.contribution)}
        >
          {factor.contribution >= 0 ? '+' : ''}{(factor.contribution * 100).toFixed(0)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={normalizedValue}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.divider, 0.3),
          '& .MuiLinearProgress-bar': {
            bgcolor: getColor(factor.contribution),
            borderRadius: 3,
          },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {factor.explanation}
      </Typography>
    </Box>
  )
}

// ============================================================
// Main Component
// ============================================================

export const XAIExplanationPanel: React.FC<XAIExplanationPanelProps> = ({
  explanation,
  confidence,
  processingTime,
  onClose,
  defaultExpanded = false,
  compact = false,
}) => {
  const theme = useTheme()
  const [expanded, setExpanded] = useState<string | false>(defaultExpanded ? 'reasoning' : false)

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false)
  }

  const confidenceColor = useMemo(() => {
    const conf = confidence ?? 0.5
    if (conf >= 0.8) return theme.palette.success.main
    if (conf >= 0.5) return theme.palette.warning.main
    return theme.palette.error.main
  }, [confidence, theme])

  const totalDuration = useMemo(() => {
    return explanation.reasoningSteps.reduce((sum, step) => sum + step.duration, 0)
  }, [explanation.reasoningSteps])

  if (compact) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderLeft: `4px solid ${confidenceColor}`,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <PsychologyIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={600}>
            AI 추론
          </Typography>
          {confidence != null && (
            <Chip
              size="small"
              label={`신뢰도: ${(confidence * 100).toFixed(0)}%`}
              sx={{
                ml: 'auto',
                bgcolor: alpha(confidenceColor, 0.1),
                color: confidenceColor,
              }}
            />
          )}
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {explanation.summary}
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, 0.95),
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <PsychologyIcon color="primary" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            AI 의사결정 분석 (XAI)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {explanation.decisionType}
          </Typography>
        </Box>
        {confidence != null && (
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              신뢰도
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color={confidenceColor}
            >
              {(confidence * 100).toFixed(0)}%
            </Typography>
          </Box>
        )}
        {processingTime != null && (
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              처리 시간
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {processingTime}ms
            </Typography>
          </Box>
        )}
        {onClose && (
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Summary */}
      <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.info.main, 0.05) }}>
        <Typography variant="body2">
          {explanation.summary}
        </Typography>
      </Box>

      <Divider />

      {/* Reasoning Steps */}
      <Accordion
        expanded={expanded === 'reasoning'}
        onChange={handleAccordionChange('reasoning')}
        disableGutters
        elevation={0}
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimelineIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">추론 과정</Typography>
            <Chip
              size="small"
              label={`${explanation.reasoningSteps.length}단계`}
              sx={{ ml: 1, height: 20, fontSize: 10 }}
            />
            {totalDuration > 0 && (
              <Chip
                size="small"
                icon={<SpeedIcon sx={{ fontSize: 12 }} />}
                label={`${totalDuration}ms`}
                sx={{ height: 20, fontSize: 10 }}
              />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 2, pt: 0 }}>
          <Stepper orientation="vertical" sx={{ ml: -1 }}>
            {explanation.reasoningSteps.map((step, idx) => (
              <ReasoningStepCard
                key={step.step}
                step={step}
                isLast={idx === explanation.reasoningSteps.length - 1}
              />
            ))}
          </Stepper>
        </AccordionDetails>
      </Accordion>

      <Divider />

      {/* Alternatives */}
      {explanation.alternatives.length > 0 && (
        <>
          <Accordion
            expanded={expanded === 'alternatives'}
            onChange={handleAccordionChange('alternatives')}
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LightbulbIcon fontSize="small" color="warning" />
                <Typography variant="subtitle2">고려된 대안</Typography>
                <Chip
                  size="small"
                  label={`${explanation.alternatives.length}개`}
                  sx={{ ml: 1, height: 20, fontSize: 10 }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 2, pt: 0 }}>
              {explanation.alternatives.map((alt, idx) => (
                <AlternativeCard key={idx} alt={alt} index={idx} />
              ))}
            </AccordionDetails>
          </Accordion>
          <Divider />
        </>
      )}

      {/* Knowledge Used */}
      {explanation.knowledgeUsed.length > 0 && (
        <>
          <Accordion
            expanded={expanded === 'knowledge'}
            onChange={handleAccordionChange('knowledge')}
            disableGutters
            elevation={0}
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MenuBookIcon fontSize="small" color="info" />
                <Typography variant="subtitle2">사용된 지식</Typography>
                <Chip
                  size="small"
                  label={`${explanation.knowledgeUsed.length}개`}
                  sx={{ ml: 1, height: 20, fontSize: 10 }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List dense disablePadding>
                {explanation.knowledgeUsed.map((knowledge, idx) => (
                  <KnowledgeCard key={idx} knowledge={knowledge} />
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
          <Divider />
        </>
      )}

      {/* Confidence Factors */}
      {explanation.confidenceFactors.length > 0 && (
        <Accordion
          expanded={expanded === 'confidence'}
          onChange={handleAccordionChange('confidence')}
          disableGutters
          elevation={0}
          sx={{ '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SpeedIcon fontSize="small" color="success" />
              <Typography variant="subtitle2">신뢰도 근거</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 2 }}>
            {explanation.confidenceFactors.map((factor, idx) => (
              <ConfidenceFactorBar key={idx} factor={factor} />
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  )
}

export default XAIExplanationPanel
