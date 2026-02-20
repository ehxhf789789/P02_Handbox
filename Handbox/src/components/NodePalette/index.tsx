import { useState, useMemo, useEffect } from 'react'
import { Box, Typography, Accordion, AccordionSummary, AccordionDetails, Chip, TextField, InputAdornment, Tabs, Tab, Tooltip } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import StorageIcon from '@mui/icons-material/Storage'
import InputIcon from '@mui/icons-material/Input'
import OutputIcon from '@mui/icons-material/Output'
import TransformIcon from '@mui/icons-material/Transform'
import PsychologyIcon from '@mui/icons-material/Psychology'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import SearchIcon from '@mui/icons-material/Search'
import DataObjectIcon from '@mui/icons-material/DataObject'
import HubIcon from '@mui/icons-material/Hub'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
// PublicIcon 제거됨 - 공공데이터 API 노드 삭제
import ScienceIcon from '@mui/icons-material/Science'
import DescriptionIcon from '@mui/icons-material/Description'
import GavelIcon from '@mui/icons-material/Gavel'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ArticleIcon from '@mui/icons-material/Article'
import TableChartIcon from '@mui/icons-material/TableChart'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DownloadIcon from '@mui/icons-material/Download'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PreviewIcon from '@mui/icons-material/Preview'
import LockIcon from '@mui/icons-material/Lock'
import LinkIcon from '@mui/icons-material/Link'
import EditIcon from '@mui/icons-material/Edit'
import SchoolIcon from '@mui/icons-material/School'
import TextSnippetIcon from '@mui/icons-material/TextSnippet'
import SlideshowIcon from '@mui/icons-material/Slideshow'
import BarChartIcon from '@mui/icons-material/BarChart'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import AltRouteIcon from '@mui/icons-material/AltRoute'
import ConstructionIcon from '@mui/icons-material/Construction'
import BiotechIcon from '@mui/icons-material/Biotech'
import WebhookIcon from '@mui/icons-material/Webhook'
import JoinInnerIcon from '@mui/icons-material/JoinInner'
import { useDragStore } from '../../stores/dragStore'
import { useWorkflowStore, NodeTemplate } from '../../stores/workflowStore'
import { useAppStore } from '../../stores/appStore'
import { NODE_TEMPLATES, TEMPLATE_CATEGORIES } from '../../data/nodeTemplates'
import { NodeRegistry } from '../../registry/NodeRegistry'
import { getIcon } from '../../utils/iconMap'
import type { NodeDefinition } from '../../registry/NodeDefinition'
import { calculateCompatibleNodesMap } from '../../services/ConnectionGuideService'

// 템플릿 아이콘 이름 → React 컴포넌트 매핑
const TEMPLATE_ICON_MAP: Record<string, React.ReactNode> = {
  'Link': <LinkIcon sx={{ fontSize: 20 }} />,
  'Edit': <EditIcon sx={{ fontSize: 20 }} />,
  'Psychology': <PsychologyIcon sx={{ fontSize: 20 }} />,
  'Article': <ArticleIcon sx={{ fontSize: 20 }} />,
  'Description': <DescriptionIcon sx={{ fontSize: 20 }} />,
  'TableChart': <TableChartIcon sx={{ fontSize: 20 }} />,
  'FolderOpen': <FolderOpenIcon sx={{ fontSize: 20 }} />,
  'Storage': <StorageIcon sx={{ fontSize: 20 }} />,
  'Search': <SearchIcon sx={{ fontSize: 20 }} />,
  'JoinInner': <JoinInnerIcon sx={{ fontSize: 20 }} />,
  'School': <SchoolIcon sx={{ fontSize: 20 }} />,
  'Gavel': <GavelIcon sx={{ fontSize: 20 }} />,
  'TrendingUp': <TrendingUpIcon sx={{ fontSize: 20 }} />,
  'TextSnippet': <TextSnippetIcon sx={{ fontSize: 20 }} />,
  'Slideshow': <SlideshowIcon sx={{ fontSize: 20 }} />,
  'BarChart': <BarChartIcon sx={{ fontSize: 20 }} />,
  'SmartToy': <SmartToyIcon sx={{ fontSize: 20 }} />,
  'Webhook': <WebhookIcon sx={{ fontSize: 20 }} />,
  'AltRoute': <AltRouteIcon sx={{ fontSize: 20 }} />,
  'CallSplit': <CallSplitIcon sx={{ fontSize: 20 }} />,
  'Science': <ScienceIcon sx={{ fontSize: 20 }} />,
  'Construction': <ConstructionIcon sx={{ fontSize: 20 }} />,
  'Biotech': <BiotechIcon sx={{ fontSize: 20 }} />,
}

const getTemplateIcon = (iconName: string): React.ReactNode => {
  return TEMPLATE_ICON_MAP[iconName] || <DashboardIcon sx={{ fontSize: 20 }} />
}

// 인증 요구사항 타입
type AuthRequirement = 'none' | 'aws' | 'api_key'

interface NodeTypeConfig {
  type: string
  label: string
  icon: React.ReactNode
  color: string
  description: string
  useCase?: string
  provider?: string
  keywords?: string[]  // 검색용 키워드
  authRequired?: AuthRequirement  // 인증 요구사항
  stub?: boolean  // 미구현 (확장 예정) 노드
}

// ========================================
// 실제 구현된 노드만 포함 (180+ 더미 → ~35개)
// WorkflowEditor의 allNodeTypes와 일치해야 함
// ========================================

// 1. 입출력 (Input/Output) - 항상 사용 가능
const IO_NODES: NodeTypeConfig[] = [
  { type: 'input', label: '입력', icon: <InputIcon />, color: '#22c55e', description: '워크플로우 시작점', useCase: '사용자 입력', keywords: ['입력', 'input', '시작'] },
  { type: 'output', label: '출력', icon: <OutputIcon />, color: '#ef4444', description: '워크플로우 종료점', useCase: '결과 반환', keywords: ['출력', 'output', '종료'] },
  { type: 'local-folder', label: '폴더 로더', icon: <FolderOpenIcon />, color: '#f59e0b', description: '로컬 폴더 내 파일들', useCase: '다중 파일 로드', keywords: ['폴더', 'folder', '디렉토리'] },
  { type: 'local-file', label: '파일 로더', icon: <InsertDriveFileIcon />, color: '#eab308', description: '로컬 파일 선택', useCase: '단일 파일 로드', keywords: ['파일', 'file', '문서'] },
]

// 2. 문서 파싱 (Document Parsing) - Tauri 연동
const DOCUMENT_PARSER_NODES: NodeTypeConfig[] = [
  { type: 'doc-pdf-parser', label: 'PDF 파서', icon: <PictureAsPdfIcon />, color: '#ef4444', description: 'PDF 텍스트/표 추출', useCase: 'PDF 문서 분석', keywords: ['pdf', '문서', '파싱', '추출'] },
  { type: 'doc-hwp-parser', label: 'HWP/HWPX 파서', icon: <ArticleIcon />, color: '#3b82f6', description: '한글 문서 추출', useCase: '한글 파일 분석', keywords: ['hwp', 'hwpx', '한글', '문서'] },
  { type: 'doc-word-parser', label: 'Word 파서', icon: <ArticleIcon />, color: '#2563eb', description: 'DOCX/DOC 추출', useCase: 'Word 문서 분석', keywords: ['word', 'docx', 'doc', '워드'], stub: true },
  { type: 'doc-excel-parser', label: 'Excel 파서', icon: <TableChartIcon />, color: '#22c55e', description: 'XLSX/XLS 데이터 추출', useCase: '스프레드시트 분석', keywords: ['excel', 'xlsx', 'xls', '엑셀'], stub: true },
]

// 3. 텍스트 처리 (Text Processing) - Python API
const TEXT_PROCESSING_NODES: NodeTypeConfig[] = [
  { type: 'text-splitter', label: '텍스트 분할', icon: <TransformIcon />, color: '#c084fc', description: '청킹 처리', useCase: '토큰 제한 대응', keywords: ['텍스트', '분할', '청킹', 'chunk'] },
  { type: 'prompt-template', label: '프롬프트 템플릿', icon: <TextFieldsIcon />, color: '#06b6d4', description: '프롬프트 구성', useCase: 'LLM 입력 준비', keywords: ['프롬프트', 'prompt', '템플릿'] },
]

// 4. 지식베이스 (Knowledge Base) - [AWS 인증 필요]
const KNOWLEDGE_BASE_NODES: NodeTypeConfig[] = [
  { type: 'embedder', label: '임베딩 생성', icon: <DataObjectIcon />, color: '#d8b4fe', description: '텍스트 벡터화', useCase: '임베딩 생성', provider: 'AWS Bedrock', keywords: ['임베딩', '벡터', 'embedding'], authRequired: 'aws' },
  { type: 'vector-store', label: '벡터 저장소', icon: <StorageIcon />, color: '#8b5cf6', description: '벡터 DB 저장/검색', useCase: 'RAG 인덱싱', provider: 'AWS OpenSearch', keywords: ['벡터', 'vector', '저장소', 'db'], authRequired: 'aws' },
  { type: 'rag-retriever', label: 'RAG 검색', icon: <SearchIcon />, color: '#a855f7', description: '유사 문서 검색', useCase: 'RAG 검색', provider: 'AWS', keywords: ['rag', '검색', 'retriever', '유사도'], authRequired: 'aws' },
]

// 5. AI 모델 (Bedrock) - [AWS 인증 필요]
const AI_MODEL_NODES: NodeTypeConfig[] = [
  { type: 'model-claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', icon: <PsychologyIcon />, color: '#6366f1', description: '최신 고성능 모델', useCase: '복잡한 분석, 코딩', provider: 'Anthropic', keywords: ['claude', 'anthropic', 'llm', 'ai'], authRequired: 'aws' },
  { type: 'model-claude-3-opus', label: 'Claude 3 Opus', icon: <PsychologyIcon />, color: '#8b5cf6', description: '최고 성능 모델', useCase: '고급 추론, 연구', provider: 'Anthropic', keywords: ['claude', 'opus', 'llm'], authRequired: 'aws' },
  { type: 'model-claude-3-haiku', label: 'Claude 3 Haiku', icon: <PsychologyIcon />, color: '#c084fc', description: '빠른 응답', useCase: '실시간 처리', provider: 'Anthropic', keywords: ['claude', 'haiku', 'llm', '빠른'], authRequired: 'aws' },
  { type: 'custom-agent', label: '커스텀 에이전트', icon: <SmartToyIcon />, color: '#6366f1', description: '사용자 정의 에이전트', useCase: '커스텀 역할 수행', provider: 'AWS Bedrock', keywords: ['에이전트', 'agent', '커스텀'], authRequired: 'aws' },
]

// 7. 제어 흐름 (Control Flow)
const CONTROL_FLOW_NODES: NodeTypeConfig[] = [
  { type: 'merge', label: '병합', icon: <HubIcon />, color: '#c084fc', description: '다중 입력 결합', useCase: '여러 출력 합치기', keywords: ['병합', 'merge', '결합'] },
  { type: 'conditional', label: '조건 분기', icon: <HubIcon />, color: '#8b5cf6', description: 'IF/ELSE 분기', useCase: '조건부 실행', keywords: ['조건', 'if', 'else', '분기'], stub: true },
]

// 8. 내보내기 (Export) - Tauri 연동
const EXPORT_NODES: NodeTypeConfig[] = [
  { type: 'export-excel', label: 'Excel 내보내기', icon: <TableChartIcon />, color: '#22c55e', description: 'XLSX 파일 생성', useCase: '데이터 내보내기', keywords: ['excel', 'xlsx', '내보내기', '엑셀'] },
  { type: 'export-pdf', label: 'PDF 내보내기', icon: <PictureAsPdfIcon />, color: '#ef4444', description: 'PDF 파일 생성', useCase: '리포트 생성', keywords: ['pdf', '내보내기', '리포트'] },
]

// 9. 시각화 (Visualization)
const VISUALIZATION_NODES: NodeTypeConfig[] = [
  { type: 'viz-result-viewer', label: '결과 뷰어', icon: <PreviewIcon />, color: '#6366f1', description: '실행 결과 미리보기', useCase: '결과 확인', keywords: ['결과', '뷰어', '미리보기'] },
  { type: 'viz-evaluator-result', label: '평가 결과', icon: <AssessmentIcon />, color: '#f59e0b', description: 'CNT 평가 결과 표시', useCase: '평가위원 결과', keywords: ['평가', '결과', 'cnt'] },
  { type: 'viz-vote-chart', label: '투표 차트', icon: <AssessmentIcon />, color: '#22c55e', description: '투표 집계 시각화', useCase: '투표 현황', keywords: ['투표', '차트', '집계'] },
  { type: 'viz-citation', label: '인용 뷰어', icon: <DescriptionIcon />, color: '#3b82f6', description: '참고문헌 표시', useCase: '인용 정보', keywords: ['인용', 'citation', '참고문헌'] },
  { type: 'viz-json-viewer', label: 'JSON 뷰어', icon: <DataObjectIcon />, color: '#8b5cf6', description: 'JSON 구조 시각화', useCase: 'API 응답 확인', keywords: ['json', '뷰어', '시각화'] },
  { type: 'viz-chart', label: '차트', icon: <BarChartIcon sx={{ fontSize: 18 }} />, color: '#f59e0b', description: '데이터 차트 시각화', useCase: '그래프, 차트', keywords: ['차트', 'chart', '그래프', '시각화'] },
]

// ========================================
// 카테고리 정의 - 핵심 노드만 (8개 카테고리)
// ========================================
const NODE_CATEGORIES = [
  { title: '입출력', icon: <InputIcon />, nodes: IO_NODES, defaultExpanded: true },
  { title: '문서 파싱', icon: <ArticleIcon />, nodes: DOCUMENT_PARSER_NODES, defaultExpanded: true },
  { title: '텍스트 처리', icon: <TransformIcon />, nodes: TEXT_PROCESSING_NODES, defaultExpanded: true },
  { title: '지식베이스 [AWS]', icon: <StorageIcon />, nodes: KNOWLEDGE_BASE_NODES, defaultExpanded: true },
  { title: 'AI 모델 [AWS]', icon: <PsychologyIcon />, nodes: AI_MODEL_NODES, defaultExpanded: true },
  { title: '제어 흐름', icon: <HubIcon />, nodes: CONTROL_FLOW_NODES, defaultExpanded: false },
  { title: '내보내기', icon: <DownloadIcon />, nodes: EXPORT_NODES, defaultExpanded: true },
  { title: '시각화', icon: <PreviewIcon />, nodes: VISUALIZATION_NODES, defaultExpanded: true },
]

// 모든 노드를 하나의 배열로
const ALL_NODES = NODE_CATEGORIES.flatMap(cat => cat.nodes)

/** NodeDefinition → NodeTypeConfig 변환 (Registry 노드를 기존 UI와 호환) */
function definitionToConfig(def: NodeDefinition): NodeTypeConfig {
  return {
    type: def.type,
    label: def.meta.label,
    icon: getIcon(def.meta.icon, { fontSize: 18 }),
    color: def.meta.color,
    description: def.meta.description,
    keywords: def.meta.tags,
    authRequired: def.requirements?.provider === 'aws' ? 'aws' : 'none',
    stub: def.stub,
    provider: def.requirements?.provider,
  }
}

/** 하드코딩 목록에 없는 Registry 전용 노드를 수집 */
function getRegistryOnlyNodes(): NodeTypeConfig[] {
  const hardcodedTypes = new Set(ALL_NODES.map(n => n.type))
  return NodeRegistry.getAll()
    .filter(def => !hardcodedTypes.has(def.type) && !def.type.includes('legacy:'))
    .map(definitionToConfig)
}

export default function NodePalette() {
  const { startDrag, updatePosition, setCompatibleNodes } = useDragStore()
  const { addTemplate, nodes } = useWorkflowStore()
  const { useAWSConnection, awsStatus } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [registryVersion, setRegistryVersion] = useState(0)

  // NodeRegistry 변경 구독 (플러그인 설치/제거 시 자동 업데이트)
  useEffect(() => {
    const unsubscribe = NodeRegistry.subscribe(() => {
      setRegistryVersion(v => v + 1)
    })
    return unsubscribe
  }, [])

  // Registry에서 추가 노드 가져오기 (하드코딩에 없는 것만)
  // registryVersion이 변경되면 재계산 (NodeRegistry 변경 시)
  const registryExtraNodes = useMemo(() => getRegistryOnlyNodes(), [registryVersion])
  const allNodesWithRegistry = useMemo(() => [...ALL_NODES, ...registryExtraNodes], [registryExtraNodes])

  // Registry 기반 카테고리 (레거시 노드 + Registry 전용 노드를 카테고리별 병합)
  const registryCategories = useMemo(() => {
    const grouped = NodeRegistry.getGroupedByCategory()
    const categories = NodeRegistry.getCategories()
    const result: { id: string; title: string; icon: React.ReactNode; nodes: NodeTypeConfig[]; defaultExpanded: boolean }[] = []

    // 하드코딩 노드를 type으로 인덱싱
    const hardcodedSet = new Set(ALL_NODES.map(n => n.type))

    for (const cat of categories) {
      const defs = grouped.get(cat.id) || []
      // Registry 노드 중 legacy 태그 없는 것만 (중복 방지)
      const registryNodes = defs
        .filter(d => !d.meta.tags.some(t => t.startsWith('legacy:')))
        .map(definitionToConfig)

      // 해당 카테고리의 하드코딩 노드 (category 매핑)
      const catMap: Record<string, string[]> = {
        'io': ['input', 'output', 'local-folder', 'local-file'],
        'data': ['data.file-loader', 'data.preprocess'],
        'storage': ['storage.local', 'storage.cloud', 'storage.unified'],
        'rag': ['rag.retriever', 'rag.context-builder'],
        'prompt': ['prompt.template', 'prompt.agent', 'prompt.few-shot', 'prompt.cot'],
        'convert': ['doc-pdf-parser', 'doc-hwp-parser', 'doc-word-parser', 'doc-excel-parser'],
        'text': ['text-splitter', 'prompt-template'],
        'vector': ['embedder', 'vector-store', 'rag-retriever'],
        'ai': ['ai.llm-invoke', 'ai.embedding', 'model-claude-3-5-sonnet', 'model-claude-3-opus', 'model-claude-3-haiku', 'custom-agent'],
        'control': ['merge', 'conditional', 'control.merge', 'control.conditional', 'control.cli', 'control.script'],
        'export': ['export-excel', 'export-pdf', 'export.excel'],
        'viz': ['viz-result-viewer', 'viz-json-viewer', 'viz-chart', 'viz.result-viewer', 'viz.json-viewer', 'viz.chart', 'viz.table', 'viz.stats'],
        'extension': [],
      }
      const hardcodedTypes = catMap[cat.id] || []
      const hardcodedNodes = hardcodedTypes
        .map(t => ALL_NODES.find(n => n.type === t))
        .filter((n): n is NodeTypeConfig => !!n)

      // Registry 노드에서 이미 하드코딩에 있는 것은 제외
      const extraRegistryNodes = registryNodes.filter(n => !hardcodedSet.has(n.type))

      const allCatNodes = [...hardcodedNodes, ...extraRegistryNodes]
      if (allCatNodes.length === 0) continue

      result.push({
        id: cat.id,
        title: cat.label,
        icon: getIcon(cat.icon, { fontSize: 18 }),
        nodes: allCatNodes,
        defaultExpanded: cat.defaultExpanded,
      })
    }

    return result
  }, [registryExtraNodes, registryVersion])

  // 인증 상태 확인 헬퍼
  const isAuthMet = (authRequired?: AuthRequirement): boolean => {
    if (!authRequired || authRequired === 'none') return true
    if (authRequired === 'aws') return useAWSConnection && awsStatus?.connected === true
    if (authRequired === 'api_key') return true  // API 키는 노드별로 설정하므로 항상 사용 가능
    return true
  }

  // 인증 요구사항 라벨
  const getAuthLabel = (authRequired?: AuthRequirement): string => {
    if (!authRequired || authRequired === 'none') return ''
    if (authRequired === 'aws') return 'AWS 인증 필요'
    if (authRequired === 'api_key') return 'API 키 필요'
    return ''
  }

  // 검색 필터링 (하드코딩 + Registry 노드 모두 포함)
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    return allNodesWithRegistry.filter(node =>
      node.label.toLowerCase().includes(query) ||
      node.description.toLowerCase().includes(query) ||
      node.useCase?.toLowerCase().includes(query) ||
      node.provider?.toLowerCase().includes(query) ||
      node.keywords?.some(k => k.toLowerCase().includes(query))
    )
  }, [searchQuery, allNodesWithRegistry])

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    return NODE_TEMPLATES.filter(template =>
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.category.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const handleMouseDown = (e: React.MouseEvent, node: NodeTypeConfig) => {
    e.preventDefault()
    console.log('Starting drag:', node.type)

    // 호환 노드 계산 및 설정
    const compatibleMap = calculateCompatibleNodesMap(node.type, nodes)
    setCompatibleNodes(compatibleMap)
    console.log('[ConnectionGuide] 호환 노드:', compatibleMap.size, '개')

    startDrag({
      type: node.type,
      label: node.label,
      color: node.color,
      description: node.description,
      provider: node.provider || '',
      useCase: node.useCase || '',
    })
    updatePosition(e.clientX, e.clientY)
  }

  const handleAddTemplate = (template: NodeTemplate) => {
    addTemplate(template, { x: 100, y: 150 })
  }

  const renderNodeItem = (node: NodeTypeConfig) => {
    const authMet = isAuthMet(node.authRequired)
    const authLabel = getAuthLabel(node.authRequired)

    const nodeContent = (
      <Box
        key={node.type}
        onMouseDown={(e) => authMet && handleMouseDown(e, node)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1,
          mb: 0.5,
          borderRadius: 1,
          cursor: authMet ? 'grab' : 'not-allowed',
          border: '1px solid transparent',
          transition: 'all 0.2s',
          userSelect: 'none',
          opacity: authMet ? 1 : 0.5,
          '&:hover': authMet ? {
            background: `${node.color}15`,
            borderColor: `${node.color}40`,
          } : {},
          '&:active': authMet ? {
            cursor: 'grabbing',
          } : {},
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            background: `${node.color}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: authMet ? node.color : 'grey.600',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {node.icon}
          {!authMet && (
            <LockIcon sx={{ position: 'absolute', bottom: -4, right: -4, fontSize: 12, color: 'warning.main' }} />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" color={authMet ? 'white' : 'grey.500'} sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.label}
          </Typography>
          <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {authMet ? node.description : authLabel}
          </Typography>
        </Box>
        {node.stub && (
          <Chip label="준비 중" size="small" sx={{ height: 16, fontSize: '0.55rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }} />
        )}
        {node.provider && !node.stub && (
          <Chip label={node.provider} size="small" sx={{ height: 16, fontSize: '0.55rem', background: authMet ? `${node.color}30` : 'rgba(100,100,100,0.3)', color: authMet ? node.color : 'grey.500', flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }} />
        )}
      </Box>
    )

    // 인증이 필요하지만 충족되지 않은 경우 툴팁 표시
    if (!authMet && authLabel) {
      return (
        <Tooltip key={node.type} title={authLabel} placement="right" arrow>
          {nodeContent}
        </Tooltip>
      )
    }

    return nodeContent
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 검색 바 */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="노드 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'grey.500', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(255,255,255,0.05)',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused fieldset': { borderColor: '#6366f1' },
            },
            '& input': { color: 'white', fontSize: '0.85rem' },
            '& input::placeholder': { color: 'grey.500' },
          }}
        />

        {/* 검색 결과 개수 */}
        {searchQuery && (
          <Typography variant="caption" color="grey.500" sx={{ mt: 1, display: 'block' }}>
            {filteredNodes?.length || 0}개 노드, {filteredTemplates?.length || 0}개 템플릿 발견
          </Typography>
        )}
      </Box>

      {/* 검색 결과 또는 기본 뷰 */}
      {searchQuery ? (
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {/* 검색된 템플릿 */}
          {filteredTemplates && filteredTemplates.length > 0 && (
            <>
              <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1 }}>
                템플릿 ({filteredTemplates.length})
              </Typography>
              {filteredTemplates.map((template) => (
                <Box
                  key={template.id}
                  onClick={() => handleAddTemplate(template)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    mb: 0.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    background: 'rgba(16, 185, 129, 0.05)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      background: 'rgba(16, 185, 129, 0.15)',
                      borderColor: '#10b981',
                    },
                  }}
                >
                  <Box sx={{ fontSize: '1.2rem' }}>{getTemplateIcon(template.icon)}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="white" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                      {template.name}
                    </Typography>
                    <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.6rem' }}>
                      {template.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Box sx={{ my: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }} />
            </>
          )}

          {/* 검색된 노드 */}
          {filteredNodes && filteredNodes.length > 0 && (
            <>
              <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1 }}>
                노드 ({filteredNodes.length})
              </Typography>
              {filteredNodes.map(renderNodeItem)}
            </>
          )}

          {/* 검색 결과 없음 */}
          {filteredNodes?.length === 0 && filteredTemplates?.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="grey.500">검색 결과가 없습니다</Typography>
            </Box>
          )}
        </Box>
      ) : (
        <>
          {/* 탭 */}
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            sx={{
              minHeight: 36,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              '& .MuiTab-root': { minHeight: 36, py: 0, color: 'grey.500', fontSize: '0.75rem' },
              '& .Mui-selected': { color: '#6366f1' },
              '& .MuiTabs-indicator': { backgroundColor: '#6366f1' },
            }}
          >
            <Tab label="템플릿" />
            <Tab label="노드" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {activeTab === 0 ? (
              // 템플릿 탭
              <>
                <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 2 }}>
                  클릭하면 연결된 노드 묶음이 캔버스에 추가됩니다
                </Typography>
                {TEMPLATE_CATEGORIES.map((category) => {
                  const categoryTemplates = NODE_TEMPLATES.filter((t) => t.category === category)
                  if (categoryTemplates.length === 0) return null

                  return (
                    <Accordion
                      key={category}
                      defaultExpanded={category === 'LLM 기초' || category === 'RAG/지식'}
                      sx={{ background: 'transparent', boxShadow: 'none', '&:before': { display: 'none' }, mb: 1 }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <DashboardIcon sx={{ fontSize: 16, color: '#10b981' }} />
                          <Typography variant="body2" color="grey.300" sx={{ fontSize: '0.8rem' }}>{category}</Typography>
                          <Chip label={categoryTemplates.length} size="small" sx={{ height: 16, fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }} />
                        </Box>
                      </AccordionSummary>

                      <AccordionDetails sx={{ p: 0, pl: 1 }}>
                        {categoryTemplates.map((template) => (
                          <Box
                            key={template.id}
                            onClick={() => handleAddTemplate(template)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              p: 1,
                              mb: 0.5,
                              borderRadius: 1,
                              cursor: 'pointer',
                              border: '1px solid rgba(16, 185, 129, 0.2)',
                              background: 'rgba(16, 185, 129, 0.05)',
                              transition: 'all 0.2s',
                              '&:hover': {
                                background: 'rgba(16, 185, 129, 0.15)',
                                borderColor: '#10b981',
                                transform: 'translateX(4px)',
                              },
                            }}
                          >
                            <Box sx={{ fontSize: '1.2rem', flexShrink: 0 }}>{getTemplateIcon(template.icon)}</Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" color="white" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                                {template.name}
                              </Typography>
                              <Typography variant="caption" color="grey.500" sx={{ fontSize: '0.6rem', display: 'block' }}>
                                {template.description}
                              </Typography>
                            </Box>
                            <Chip
                              label={`${template.nodes.length}개`}
                              size="small"
                              sx={{ height: 16, fontSize: '0.55rem', background: 'rgba(16, 185, 129, 0.3)', color: '#34d399', '& .MuiChip-label': { px: 0.75 } }}
                            />
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  )
                })}
              </>
            ) : (
              // 노드 탭 — Registry 기반 카테고리
              <>
                <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 2 }}>
                  드래그하여 캔버스에 놓으세요 ({allNodesWithRegistry.length}개 노드)
                </Typography>
                {registryCategories.map((category) => (
                  <Accordion
                    key={category.id}
                    defaultExpanded={category.defaultExpanded}
                    sx={{ background: 'transparent', boxShadow: 'none', '&:before': { display: 'none' }, mb: 1 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color: 'grey.400' }}>{category.icon}</Box>
                        <Typography variant="body2" color="grey.300">{category.title}</Typography>
                        <Chip label={category.nodes.length} size="small" sx={{ height: 18, fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }} />
                      </Box>
                    </AccordionSummary>

                    <AccordionDetails sx={{ p: 0, pl: 1 }}>
                      {category.nodes.map(renderNodeItem)}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </>
            )}
          </Box>
        </>
      )}

      {/* 하단 도움말 */}
      <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(99, 102, 241, 0.05)' }}>
        <Typography variant="caption" color="grey.400" sx={{ display: 'block', lineHeight: 1.6 }}>
          <b>Tip:</b> 검색으로 빠르게 노드를 찾으세요. 한글/영어 모두 지원됩니다.
        </Typography>
      </Box>
    </Box>
  )
}
