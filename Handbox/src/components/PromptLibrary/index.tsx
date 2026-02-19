/**
 * PromptLibrary - 프롬프트 템플릿 라이브러리
 *
 * Few-shot, Chain-of-Thought, ReAct 등 다양한 프롬프트 템플릿 제공
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PreviewIcon from '@mui/icons-material/Preview'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PsychologyIcon from '@mui/icons-material/Psychology'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import RouteIcon from '@mui/icons-material/Route'
import CategoryIcon from '@mui/icons-material/Category'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: 'few-shot' | 'cot' | 'react' | 'custom'
  template: string
  tags: string[]
  examples?: { input: string; output: string }[]
}

const BUILTIN_TEMPLATES: PromptTemplate[] = [
  // Few-shot 템플릿
  {
    id: 'fewshot-classification',
    name: '텍스트 분류',
    description: '예시 기반 텍스트 분류',
    category: 'few-shot',
    template: `다음 텍스트를 분류하세요.

예시:
입력: "오늘 날씨가 정말 좋네요!"
분류: 긍정

입력: "이 제품은 최악이에요."
분류: 부정

입력: "내일 회의가 있습니다."
분류: 중립

입력: "{{input}}"
분류:`,
    tags: ['분류', '감정분석', 'NLP'],
    examples: [
      { input: '정말 기대됩니다!', output: '긍정' },
      { input: '실망스럽네요.', output: '부정' },
    ],
  },
  {
    id: 'fewshot-ner',
    name: '개체명 인식',
    description: '텍스트에서 개체명(이름, 장소 등) 추출',
    category: 'few-shot',
    template: `텍스트에서 개체명을 추출하세요.

예시:
텍스트: "김철수는 서울에서 삼성전자에 다닙니다."
개체: [김철수:인명, 서울:장소, 삼성전자:기관]

텍스트: "애플의 CEO 팀 쿡이 WWDC에서 발표했다."
개체: [애플:기관, 팀 쿡:인명, WWDC:행사]

텍스트: "{{input}}"
개체:`,
    tags: ['NER', '개체명', '정보추출'],
  },
  {
    id: 'fewshot-summary',
    name: '문서 요약',
    description: '긴 텍스트를 간결하게 요약',
    category: 'few-shot',
    template: `다음 텍스트를 2-3문장으로 요약하세요.

예시:
텍스트: "인공지능 기술이 빠르게 발전하면서 다양한 산업에 적용되고 있다. 특히 의료, 금융, 제조 분야에서 AI 활용이 증가하고 있으며, 이로 인해 업무 효율성이 크게 향상되었다."
요약: AI 기술이 의료, 금융, 제조 등 다양한 산업에 적용되어 업무 효율성을 높이고 있다.

텍스트: "{{input}}"
요약:`,
    tags: ['요약', '압축', '핵심추출'],
  },

  // Chain-of-Thought 템플릿
  {
    id: 'cot-math',
    name: '수학 문제 풀이',
    description: '단계별 수학 문제 해결',
    category: 'cot',
    template: `문제를 단계별로 풀어보세요.

문제: {{input}}

풀이:
1단계: 문제를 이해합니다.
2단계: 필요한 정보를 정리합니다.
3단계: 계산을 수행합니다.
4단계: 결과를 검증합니다.

답:`,
    tags: ['수학', '계산', '논리'],
  },
  {
    id: 'cot-analysis',
    name: '분석적 추론',
    description: '복잡한 문제를 단계별로 분석',
    category: 'cot',
    template: `다음 질문에 대해 단계별로 분석하세요.

질문: {{input}}

분석:
먼저, 질문의 핵심을 파악합니다.
그 다음, 관련 요소들을 나열합니다.
각 요소의 관계를 분석합니다.
마지막으로, 결론을 도출합니다.

결론:`,
    tags: ['분석', '추론', '논리'],
  },
  {
    id: 'cot-decision',
    name: '의사결정 지원',
    description: '장단점 분석을 통한 의사결정',
    category: 'cot',
    template: `다음 선택지를 분석하고 최선의 결정을 제안하세요.

상황: {{input}}

분석:
1. 각 옵션의 장점:
2. 각 옵션의 단점:
3. 리스크 평가:
4. 우선순위 고려:

추천:`,
    tags: ['의사결정', '분석', '비교'],
  },

  // ReAct 템플릿
  {
    id: 'react-research',
    name: '정보 검색 에이전트',
    description: '생각-행동-관찰 패턴의 리서치',
    category: 'react',
    template: `당신은 정보를 검색하고 분석하는 에이전트입니다.

질문: {{input}}

Thought 1: 이 질문에 답하기 위해 어떤 정보가 필요한지 생각합니다.
Action 1: [search] 관련 정보 검색
Observation 1: (검색 결과)

Thought 2: 검색 결과를 바탕으로 추가로 필요한 정보를 파악합니다.
Action 2: [analyze] 정보 분석
Observation 2: (분석 결과)

Final Answer:`,
    tags: ['에이전트', 'ReAct', '검색'],
  },
  {
    id: 'react-task',
    name: '작업 수행 에이전트',
    description: '단계별 작업 수행',
    category: 'react',
    template: `당신은 작업을 수행하는 에이전트입니다.

작업: {{input}}

사용 가능한 도구: [search], [calculate], [write], [execute]

Thought: 작업을 완료하기 위한 계획을 세웁니다.
Action: 첫 번째 행동을 선택합니다.
Observation: 행동의 결과를 관찰합니다.
... (반복)

Result:`,
    tags: ['에이전트', '작업', '자동화'],
  },

  // 사용자 정의
  {
    id: 'custom-blank',
    name: '빈 템플릿',
    description: '직접 프롬프트 작성',
    category: 'custom',
    template: `{{input}}`,
    tags: ['사용자정의', '자유형식'],
  },
]

const CATEGORY_INFO = {
  'few-shot': { label: 'Few-shot', icon: <FormatListNumberedIcon />, color: '#ec4899' },
  cot: { label: 'Chain-of-Thought', icon: <PsychologyIcon />, color: '#a855f7' },
  react: { label: 'ReAct', icon: <RouteIcon />, color: '#f59e0b' },
  custom: { label: '사용자 정의', icon: <AutoAwesomeIcon />, color: '#6366f1' },
}

interface PromptLibraryProps {
  onSelect: (template: PromptTemplate) => void
  selectedId?: string
}

export default function PromptLibrary({ onSelect, selectedId }: PromptLibraryProps) {
  const [search, setSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['few-shot', 'cot'])
  const [previewTemplate, setPreviewTemplate] = useState<PromptTemplate | null>(null)

  const filteredTemplates = BUILTIN_TEMPLATES.filter((t) => {
    const searchLower = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(searchLower) ||
      t.description.toLowerCase().includes(searchLower) ||
      t.tags.some((tag) => tag.toLowerCase().includes(searchLower))
    )
  })

  const groupedTemplates = filteredTemplates.reduce(
    (acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = []
      }
      acc[template.category].push(template)
      return acc
    },
    {} as Record<string, PromptTemplate[]>
  )

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleCopy = async (template: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(template.template)
    } catch (e) {
      console.error('복사 실패:', e)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 검색 */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <TextField
          size="small"
          placeholder="프롬프트 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'grey.500' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
            },
          }}
        />
      </Box>

      {/* 템플릿 목록 */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List dense disablePadding>
          {Object.entries(CATEGORY_INFO).map(([categoryId, info]) => {
            const templates = groupedTemplates[categoryId] || []
            if (templates.length === 0 && search) return null

            const isExpanded = expandedCategories.includes(categoryId)

            return (
              <Box key={categoryId}>
                {/* 카테고리 헤더 */}
                <ListItemButton
                  onClick={() => toggleCategory(categoryId)}
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: info.color }}>
                    {info.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {info.label}
                        </Typography>
                        <Chip label={templates.length} size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
                      </Box>
                    }
                  />
                  {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                </ListItemButton>

                {/* 템플릿 목록 */}
                <Collapse in={isExpanded}>
                  {templates.map((template) => (
                    <ListItem
                      key={template.id}
                      disablePadding
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="미리보기">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPreviewTemplate(template)
                              }}
                            >
                              <PreviewIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="복사">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopy(template)
                              }}
                            >
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemButton
                        onClick={() => onSelect(template)}
                        selected={selectedId === template.id}
                        sx={{
                          py: 0.75,
                          pl: 4,
                          pr: 8,
                          '&.Mui-selected': {
                            backgroundColor: `${info.color}20`,
                            borderRight: `2px solid ${info.color}`,
                          },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="caption" sx={{ fontWeight: 500 }}>
                              {template.name}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'grey.500' }}>
                              {template.description}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </Collapse>
              </Box>
            )
          })}
        </List>
      </Box>

      {/* 미리보기 다이얼로그 */}
      <Dialog
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        maxWidth="md"
        fullWidth
      >
        {previewTemplate && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CategoryIcon sx={{ color: CATEGORY_INFO[previewTemplate.category].color }} />
              {previewTemplate.name}
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="grey.500" sx={{ mb: 2 }}>
                {previewTemplate.description}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                {previewTemplate.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  color: 'grey.300',
                }}
              >
                {previewTemplate.template}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPreviewTemplate(null)}>닫기</Button>
              <Button
                variant="contained"
                onClick={() => {
                  onSelect(previewTemplate)
                  setPreviewTemplate(null)
                }}
              >
                사용하기
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}

export { BUILTIN_TEMPLATES }
