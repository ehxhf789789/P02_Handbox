import { memo, useState, useCallback } from 'react'
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  IconButton,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import PowerIcon from '@mui/icons-material/Power'
import PowerOffIcon from '@mui/icons-material/PowerOff'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import SaveIcon from '@mui/icons-material/Save'
import Tooltip from '@mui/material/Tooltip'
import { useWorkflowStore } from '../../stores/workflowStore'
import { invoke } from '@tauri-apps/api/tauri'
import OutputDisplay from '../OutputDisplay'
import { shallow } from 'zustand/shallow'
import { NodeRegistry } from '../../registry/NodeRegistry'
import ConfigSchemaRenderer from '../ConfigSchemaRenderer'

// 노드 타입 → Bedrock 모델 ID 매핑
const MODEL_ID_MAP: Record<string, string> = {
  'model-claude-3-5-sonnet': 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  'model-claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
  'model-claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
  'model-claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
  'model-llama-3-1-405b': 'meta.llama3-1-405b-instruct-v1:0',
  'model-llama-3-1-70b': 'meta.llama3-1-70b-instruct-v1:0',
  'model-llama-3-1-8b': 'meta.llama3-1-8b-instruct-v1:0',
  'model-titan-text-premier': 'amazon.titan-text-premier-v1:0',
  'model-titan-text-express': 'amazon.titan-text-express-v1',
  'model-titan-embed': 'amazon.titan-embed-text-v1',
  'model-titan-multimodal': 'amazon.titan-embed-image-v1',
  'model-mistral-large': 'mistral.mistral-large-2407-v1:0',
  'model-mixtral-8x7b': 'mistral.mixtral-8x7b-instruct-v0:1',
  'model-mistral-small': 'mistral.mistral-small-2402-v1:0',
  'model-cohere-command-r-plus': 'cohere.command-r-plus-v1:0',
  'model-cohere-command-r': 'cohere.command-r-v1:0',
  'model-cohere-embed': 'cohere.embed-multilingual-v3',
  'model-ai21-jamba': 'ai21.jamba-1-5-large-v1:0',
  'model-ai21-jurassic': 'ai21.j2-ultra-v1',
  'model-stable-diffusion': 'stability.stable-diffusion-xl-v1',
}

// AWS Bedrock 모델 목록
const BEDROCK_MODELS = [
  { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-opus-20240229-v1:0', label: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', label: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'meta.llama3-1-405b-instruct-v1:0', label: 'Llama 3.1 405B', provider: 'Meta' },
  { id: 'meta.llama3-1-70b-instruct-v1:0', label: 'Llama 3.1 70B', provider: 'Meta' },
  { id: 'meta.llama3-1-8b-instruct-v1:0', label: 'Llama 3.1 8B', provider: 'Meta' },
  { id: 'amazon.titan-text-premier-v1:0', label: 'Titan Premier', provider: 'Amazon' },
  { id: 'mistral.mistral-large-2407-v1:0', label: 'Mistral Large 2', provider: 'Mistral' },
  { id: 'cohere.command-r-plus-v1:0', label: 'Command R+', provider: 'Cohere' },
]

// AWS 리전 목록
const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
]

// 노드별 사용 설명
const NODE_DESCRIPTIONS: Record<string, { title: string; description: string; usage: string[]; tips?: string[] }> = {
  // 입출력 노드
  'input': {
    title: '입력 노드',
    description: '워크플로우의 시작점입니다. 처리할 텍스트나 데이터를 입력합니다.',
    usage: ['텍스트 입력 필드에 처리할 내용을 입력', '복잡한 데이터는 JSON 형식으로 입력 가능'],
    tips: ['다른 노드로 연결하면 입력 데이터가 전달됩니다']
  },
  'output': {
    title: '출력 노드',
    description: '워크플로우의 최종 결과를 표시합니다.',
    usage: ['이전 노드의 결과가 자동으로 표시됨', '출력 형식(텍스트/JSON/마크다운) 선택 가능'],
    tips: ['실행 버튼을 누르면 결과가 여기에 표시됩니다']
  },
  // 제어 노드
  'merge': {
    title: '병합 노드',
    description: '여러 분기의 결과를 하나로 합칩니다.',
    usage: ['여러 노드의 출력을 이 노드에 연결', '모든 입력이 하나의 결과로 통합됨'],
    tips: ['번역 등 병렬 처리 후 결과를 모을 때 사용']
  },
  'conditional': {
    title: '조건 분기',
    description: '조건에 따라 다른 경로로 분기합니다.',
    usage: ['조건식을 JavaScript 형식으로 입력', '예: result.score > 80'],
    tips: ['true/false에 따라 다른 노드로 연결']
  },
  'loop': {
    title: '반복 노드',
    description: '지정된 횟수만큼 작업을 반복합니다.',
    usage: ['반복 횟수 설정', '연결된 노드의 작업이 반복 실행됨'],
  },
  'prompt-template': {
    title: '프롬프트 템플릿',
    description: '변수를 포함한 프롬프트를 정의합니다.',
    usage: ['{{변수명}} 형식으로 변수 정의', '입력 데이터가 변수에 자동 대입'],
    tips: ['LLM 모델 노드 앞에 연결하여 사용']
  },
  // Bedrock 모델
  'model-claude-3-5-sonnet': {
    title: 'Claude 3.5 Sonnet',
    description: 'Anthropic의 최신 모델. 고성능 텍스트 생성 및 분석에 적합합니다.',
    usage: ['시스템 프롬프트로 역할 정의', 'Temperature로 창의성 조절 (0=정확, 1=창의적)'],
    tips: ['복잡한 분석, 코드 생성, 문서 작성에 탁월']
  },
  'model-claude-3-opus': {
    title: 'Claude 3 Opus',
    description: 'Anthropic의 최고 성능 모델. 복잡한 추론과 긴 문서 처리에 적합합니다.',
    usage: ['긴 문서 분석, 복잡한 추론 작업에 사용', 'Max Tokens를 높게 설정하여 긴 응답 받기'],
    tips: ['비용이 높으므로 중요한 작업에만 사용 권장']
  },
  'model-claude-3-haiku': {
    title: 'Claude 3 Haiku',
    description: '빠르고 경제적인 모델. 간단한 작업에 적합합니다.',
    usage: ['빠른 응답이 필요한 작업에 사용', '간단한 분류, 요약, 번역에 적합'],
    tips: ['대량 처리 시 비용 효율적']
  },
  // Bedrock 플랫폼
  'bedrock-guardrails': {
    title: 'Guardrails',
    description: 'AI 응답의 안전성을 보장하는 필터입니다.',
    usage: ['Guardrail ID 입력', '민감한 정보 필터링, 유해 콘텐츠 차단'],
    tips: ['프로덕션 환경에서 필수 사용 권장']
  },
  'bedrock-agents': {
    title: 'Bedrock Agents',
    description: '자율적으로 작업을 수행하는 AI 에이전트입니다.',
    usage: ['Agent ID 입력', 'Action Groups 설정으로 에이전트 기능 정의'],
    tips: ['복잡한 다단계 작업 자동화에 적합']
  },
  'bedrock-knowledge-base': {
    title: 'Knowledge Base',
    description: 'RAG(검색 증강 생성)를 위한 지식 베이스입니다.',
    usage: ['Knowledge Base ID 입력', '문서를 업로드하고 질문에 기반한 답변 생성'],
    tips: ['S3에 문서를 저장하고 연결']
  },
  'bedrock-fine-tuning': {
    title: 'Fine Tuning',
    description: '커스텀 데이터로 모델을 미세 조정합니다.',
    usage: ['학습 데이터 S3 경로 입력', '베이스 모델 선택'],
    tips: ['특정 도메인에 최적화된 모델 생성']
  },
  'bedrock-evaluation': {
    title: 'Model Evaluation',
    description: '모델 성능을 평가합니다.',
    usage: ['평가 데이터셋 선택', '자동 평가 또는 수동 평가 선택'],
  },
  'bedrock-provisioned': {
    title: 'Provisioned Throughput',
    description: '예약된 처리량으로 안정적인 성능을 보장합니다.',
    usage: ['프로비저닝 ARN 입력', '대량 요청 처리 시 사용'],
    tips: ['프로덕션 환경에서 안정적인 응답 시간 보장']
  },
  'bedrock-batch': {
    title: 'Batch Inference',
    description: '대량의 요청을 일괄 처리합니다.',
    usage: ['입력 데이터 S3 경로 지정', '출력 S3 경로 지정'],
    tips: ['비용 효율적인 대량 처리']
  },
  // AWS AI/ML 서비스
  'aws-translate': {
    title: 'Amazon Translate',
    description: '실시간 텍스트 번역 서비스입니다.',
    usage: ['원본 언어와 대상 언어 선택', '자동 감지 사용 가능'],
    tips: ['75개 이상의 언어 지원']
  },
  'aws-comprehend': {
    title: 'Amazon Comprehend',
    description: 'NLP 서비스로 텍스트를 분석합니다.',
    usage: ['분석 유형 선택: 감정/개체/키워드/언어', '텍스트를 입력으로 연결'],
    tips: ['감정 분석, 개체 인식, 키워드 추출 지원']
  },
  'aws-textract': {
    title: 'Amazon Textract',
    description: '문서와 이미지에서 텍스트를 추출합니다.',
    usage: ['분석 유형 선택: 텍스트/양식/테이블', '이미지 또는 PDF 파일 경로 입력'],
    tips: ['OCR 기술로 스캔된 문서도 처리 가능']
  },
  'aws-polly': {
    title: 'Amazon Polly',
    description: '텍스트를 자연스러운 음성으로 변환합니다.',
    usage: ['음성 ID 선택', '출력 형식 선택 (MP3, OGG 등)'],
    tips: ['다양한 언어와 음성 스타일 지원']
  },
  'aws-transcribe': {
    title: 'Amazon Transcribe',
    description: '음성을 텍스트로 변환합니다.',
    usage: ['오디오 파일 S3 경로 입력', '언어 코드 선택'],
    tips: ['실시간 스트리밍 전사도 지원']
  },
  'aws-rekognition': {
    title: 'Amazon Rekognition',
    description: '이미지와 비디오를 분석합니다.',
    usage: ['분석 유형: 라벨/얼굴/텍스트 감지', '이미지 S3 경로 입력'],
    tips: ['얼굴 인식, 객체 탐지, 콘텐츠 검수 지원']
  },
  // 스토리지/DB
  'aws-s3': {
    title: 'Amazon S3',
    description: '객체 스토리지에서 파일을 읽고 씁니다.',
    usage: ['버킷 이름과 프리픽스 입력', '작업 유형: 읽기/쓰기/목록'],
    tips: ['대용량 파일 저장 및 관리']
  },
  'aws-dynamodb': {
    title: 'Amazon DynamoDB',
    description: 'NoSQL 데이터베이스에서 데이터를 처리합니다.',
    usage: ['테이블 이름 입력', '작업: 읽기/쓰기/쿼리'],
    tips: ['빠른 키-값 저장소']
  },
  'aws-opensearch': {
    title: 'OpenSearch',
    description: '벡터 검색 및 전문 검색을 수행합니다.',
    usage: ['인덱스 이름 입력', 'Top K로 검색 결과 수 설정'],
    tips: ['RAG 구현 시 벡터 저장소로 사용']
  },
  // 컴퓨팅
  'aws-lambda': {
    title: 'AWS Lambda',
    description: '서버리스 함수를 실행합니다.',
    usage: ['함수 이름 입력', '페이로드를 JSON 형식으로 입력'],
    tips: ['커스텀 로직 실행에 활용']
  },
  'aws-step-functions': {
    title: 'Step Functions',
    description: '복잡한 워크플로우를 오케스트레이션합니다.',
    usage: ['State Machine ARN 입력', '입력 데이터 JSON 설정'],
    tips: ['장기 실행 워크플로우 관리']
  },
  // 데이터 처리
  'text-splitter': {
    title: '텍스트 분할',
    description: '긴 텍스트를 작은 청크로 분할합니다.',
    usage: ['청크 크기 설정 (문자 수)', '오버랩 설정으로 문맥 유지'],
    tips: ['RAG 파이프라인에서 필수']
  },
  'embedder': {
    title: '임베딩',
    description: '텍스트를 벡터로 변환합니다.',
    usage: ['임베딩 모델 선택', '텍스트 입력 연결'],
    tips: ['의미 검색을 위한 벡터 생성']
  },
  'vector-search': {
    title: '벡터 검색',
    description: '유사한 문서를 검색합니다.',
    usage: ['Top K로 결과 수 설정', '쿼리 벡터 입력'],
    tips: ['OpenSearch와 연결하여 사용']
  },
  'document-loader': {
    title: '문서 로더',
    description: '다양한 형식의 문서를 로드합니다.',
    usage: ['파일 경로 또는 S3 경로 입력', '지원: PDF, DOCX, TXT 등'],
  },
  'knowledge-base': {
    title: '지식 베이스',
    description: 'Bedrock Knowledge Base에서 검색합니다.',
    usage: ['Knowledge Base ID 입력', '질의 텍스트 연결'],
    tips: ['사전 구성된 KB 필요']
  },
  // 에이전트
  'custom-agent': {
    title: '커스텀 에이전트',
    description: '시스템 프롬프트로 역할을 정의한 AI 에이전트입니다.',
    usage: ['모델 선택', '시스템 프롬프트로 역할 정의'],
    tips: ['평가 기준이나 전문 분야 정의']
  },
  'rag-agent': {
    title: 'RAG 에이전트',
    description: '지식 베이스를 활용하는 AI 에이전트입니다.',
    usage: ['모델과 Knowledge Base 연결', 'RAG 활성화 옵션 설정'],
    tips: ['문서 기반 질의응답에 적합']
  },
  // 외부 API 노드
  'api-generic': {
    title: '외부 API',
    description: '범용 REST API를 호출합니다. 어떤 외부 서비스든 연결할 수 있습니다.',
    usage: ['API 엔드포인트 URL 입력', 'HTTP 메서드 선택 (GET/POST/PUT/DELETE)', 'Headers와 Body 설정'],
    tips: ['API 키는 Headers에 Authorization으로 추가', '응답은 JSON으로 파싱되어 다음 노드로 전달']
  },
  'api-analyzer': {
    title: 'API 분석기',
    description: 'AI가 API 문서를 분석하여 호출 가능한 엔드포인트를 자동으로 파악합니다.',
    usage: ['API 문서 URL 또는 설명 입력', 'AI 분석 버튼 클릭 (토큰 소모)', '분석된 엔드포인트 중 선택하여 호출'],
    tips: ['분석 결과는 캐시되어 재사용 가능', 'OpenAPI/Swagger 문서가 있으면 더 정확한 분석']
  },
  // 한국 공공데이터 API
  'api-kipris': {
    title: 'KIPRIS (특허정보검색)',
    description: '특허청 특허정보검색서비스입니다. 특허, 실용신안, 디자인, 상표 정보를 검색합니다.',
    usage: [
      '1단계: plus.kipris.or.kr 접속 → 회원가입',
      '2단계: OpenAPI → API 키 발급 신청',
      '3단계: 발급된 API 키를 아래 입력란에 붙여넣기',
      '4단계: 검색 유형 선택 후 검색어 입력',
    ],
    tips: ['무료로 하루 1000건까지 호출 가능', '건설신기술은 "특허" 유형으로 검색']
  },
  'api-scienceon': {
    title: 'ScienceON (KISTI)',
    description: 'KISTI 과학기술정보서비스입니다. 논문, 특허, 보고서, 동향 정보를 검색합니다.',
    usage: [
      '1단계: scienceon.kisti.re.kr 접속 → 회원가입',
      '2단계: 마이페이지 → OpenAPI → API 키 발급',
      '3단계: 발급된 API 키를 아래 입력란에 붙여넣기',
      '4단계: 검색 범위(논문/특허/보고서) 선택 후 검색어 입력',
    ],
    tips: ['국내외 학술정보 통합 검색 가능', '건설/토목 관련 논문 검색에 유용']
  },
  'api-data-go-kr': {
    title: '공공데이터포털',
    description: '정부 공공데이터를 조회합니다. 건축허가, 입찰정보, 기업정보 등 다양한 API 제공.',
    usage: [
      '1단계: data.go.kr 접속 → 회원가입',
      '2단계: 원하는 API 검색 → "활용신청" 클릭',
      '3단계: 마이페이지 → 활용신청 현황 → 인증키 복사',
      '4단계: API 키 입력 + 서비스 URL에 해당 API 요청 URL 입력',
    ],
    tips: ['각 API마다 요청 URL이 다름 - API 상세페이지에서 확인', '건설/건축 허가정보, 입찰정보 등 유용']
  },
  'api-ntis': {
    title: 'NTIS (국가R&D정보)',
    description: '국가연구개발사업 정보를 검색합니다. R&D 과제, 성과, 인력 정보를 제공합니다.',
    usage: [
      '1단계: ntis.go.kr 접속 → 회원가입',
      '2단계: OpenAPI → API 키 발급 신청',
      '3단계: 발급된 API 키를 아래 입력란에 붙여넣기',
      '4단계: 검색 유형(과제/성과/인력) 선택 후 검색어 입력',
    ],
    tips: ['국가 R&D 과제 및 연구비 정보 조회 가능', '건설기술연구 과제 검색에 활용']
  },
  'api-riss': {
    title: 'RISS (학술연구정보)',
    description: 'KERIS 학술연구정보서비스입니다. 학위논문, 학술지, 단행본을 검색합니다.',
    usage: [
      '1단계: riss.kr 접속 → 회원가입 (대학 인증 권장)',
      '2단계: RISS OpenAPI → API 키 발급 신청',
      '3단계: 발급된 API 키를 아래 입력란에 붙여넣기',
      '4단계: 자료 유형 선택 후 검색어 입력',
    ],
    tips: ['국내 학위논문 최대 DB', '건설/토목 분야 논문 검색에 필수']
  },
  'api-kostat': {
    title: 'KOSIS (국가통계포털)',
    description: '통계청 국가통계포털입니다. 건설투자, 주택가격, 인구통계 등 조회.',
    usage: [
      '1단계: kosis.kr 접속 → 회원가입',
      '2단계: 통계API → 인증키 발급',
      '3단계: 발급된 API 키를 아래 입력란에 붙여넣기',
      '4단계: 원하는 통계표 ID를 kosis.kr에서 찾아 입력',
    ],
    tips: ['통계표 ID는 KOSIS 사이트에서 "통계표 보기" 시 URL에서 확인', '건설투자지수, 주택가격동향 등']
  },
  // 로컬 파일/폴더
  'local-folder': {
    title: '폴더 로더',
    description: '로컬 폴더 내의 파일들을 워크플로우 데이터로 불러옵니다.',
    usage: ['폴더 경로 입력 또는 찾아보기 버튼 클릭', '파일 필터 설정 (예: *.txt, *.pdf)', '하위 폴더 포함 여부 선택'],
    tips: ['문서 분석, RAG 파이프라인의 입력 데이터로 활용', '지원 형식: txt, pdf, docx, json, csv 등']
  },
  'local-file': {
    title: '파일 로더',
    description: '로컬 파일 하나를 워크플로우 데이터로 불러옵니다.',
    usage: ['파일 경로 입력 또는 찾아보기 버튼 클릭', '파일 내용이 자동으로 읽혀져 다음 노드로 전달'],
    tips: ['텍스트 파일은 내용이 직접 전달됨', 'PDF/DOCX는 텍스트 추출 후 전달']
  },
  // 시각화 노드
  'viz-diff-viewer': {
    title: '비교 뷰어',
    description: '두 텍스트를 비교하여 차이점을 하이라이트합니다.',
    usage: ['원본 텍스트(A)와 비교 텍스트(B) 입력', '비교 방식 선택 (라인/단어/문자)', '이전 노드에서 두 텍스트를 받아 자동 비교 가능'],
    tips: ['버전 비교, 번역 품질 확인, 문서 수정 추적에 유용']
  },
  'viz-flow-diagram': {
    title: '플로우 다이어그램',
    description: '프로세스나 데이터 흐름을 다이어그램으로 시각화합니다.',
    usage: ['Mermaid 문법으로 다이어그램 정의', 'JSON 형식 (nodes/edges)도 지원', '방향 설정 (위→아래, 왼쪽→오른쪽 등)'],
    tips: ['복잡한 프로세스 문서화에 유용', 'AI 응답에서 단계를 추출하여 시각화 가능']
  },
  'viz-chart': {
    title: '차트 생성',
    description: '데이터를 막대, 꺾은선, 파이 등 차트로 시각화합니다.',
    usage: ['차트 유형 선택', 'X/Y축 레이블 설정', '데이터 경로 지정하여 JSON에서 데이터 추출'],
    tips: ['통계 데이터 시각화, 분석 결과 보고서 생성에 활용']
  },
  'viz-table-viewer': {
    title: '테이블 뷰어',
    description: '배열 데이터를 테이블 형태로 표시합니다.',
    usage: ['데이터 경로 설정', '페이지당 행 수 조절', '정렬/검색 기능 활성화 가능'],
    tips: ['API 응답의 목록 데이터 확인, CSV 파싱 결과 표시에 유용']
  },
  'viz-json-viewer': {
    title: 'JSON 뷰어',
    description: 'JSON 데이터를 트리 구조로 탐색합니다.',
    usage: ['기본 펼침 깊이 설정', '복사 버튼으로 특정 값 복사 가능'],
    tips: ['API 응답 구조 파악, 복잡한 JSON 디버깅에 필수']
  },
  'viz-markdown-viewer': {
    title: 'Markdown 뷰어',
    description: 'Markdown 텍스트를 렌더링하여 표시합니다.',
    usage: ['코드 구문 강조 활성화', '목차 자동 생성 옵션'],
    tips: ['AI 생성 문서 미리보기, 보고서 최종 확인에 활용']
  },
  'viz-result-viewer': {
    title: '결과 뷰어',
    description: '워크플로우 실행 결과를 적절한 형식으로 표시합니다.',
    usage: ['표시 형식 선택 (자동/텍스트/JSON/Markdown)'],
    tips: ['output 노드 대신 사용하여 더 풍부한 결과 표시 가능']
  },
  'viz-evaluator-result': {
    title: '평가위원 결과 뷰어',
    description: '평가위원의 승인/미승인 결과를 시각적으로 표시합니다.',
    usage: ['평가 점수와 판정 결과 표시', '근거 요약 표시 옵션', '통과/불통과 색상 표시'],
    tips: ['CNT 평가 워크플로우에서 각 위원의 판정 결과를 한눈에 확인']
  },
  // 문서 파싱 노드
  'doc-csv-parser': {
    title: 'CSV 파서',
    description: 'CSV 파일을 읽어 구조화된 배열 데이터로 변환합니다.',
    usage: ['파일 경로 입력 또는 이전 노드에서 CSV 텍스트 수신', '구분자 설정 (쉼표, 탭 등)', '첫 행 헤더 여부 설정'],
    tips: ['파싱 결과는 테이블 뷰어나 차트에 연결하여 시각화']
  },
  'doc-json-parser': {
    title: 'JSON 파서',
    description: 'JSON 파일을 파싱하고 특정 경로의 데이터를 추출합니다.',
    usage: ['파일 경로 입력', 'JSON 경로 설정으로 필요한 데이터만 추출 (예: data.items)'],
    tips: ['API 응답 처리, 설정 파일 읽기에 활용']
  },
  'doc-xml-parser': {
    title: 'XML 파서',
    description: 'XML 파일을 파싱합니다.',
    usage: ['파일 경로 입력', 'XPath로 특정 요소 추출 가능'],
    tips: ['공공데이터 API 응답 처리, 설정 파일 읽기에 활용']
  },
  // 내보내기 노드
  'export-csv': {
    title: 'CSV 내보내기',
    description: '데이터를 CSV 파일로 저장합니다.',
    usage: ['저장 경로 설정 (비워두면 결과만 반환)', '구분자 설정'],
    tips: ['배열 형태의 데이터를 CSV로 변환하여 Excel에서 열기 가능']
  },
  'export-json': {
    title: 'JSON 내보내기',
    description: '데이터를 JSON 파일로 저장합니다.',
    usage: ['저장 경로 설정', '들여쓰기 옵션'],
    tips: ['워크플로우 결과를 파일로 저장하여 재사용']
  },
  'export-markdown': {
    title: 'Markdown 내보내기',
    description: '텍스트를 Markdown 파일로 저장합니다.',
    usage: ['저장 경로 설정'],
    tips: ['AI 생성 문서를 바로 .md 파일로 저장']
  },
  // 액션 노드
  'shell-command': {
    title: '셸 명령어',
    description: '시스템 셸 명령어를 실행합니다. 스크립트, 프로그램 실행에 활용.',
    usage: ['실행할 명령어 입력', '작업 디렉토리 설정 (선택)', '타임아웃 설정'],
    tips: ['주의: 시스템 명령어가 직접 실행됩니다', '자동화 파이프라인에서 빌드, 배포 등에 활용']
  },
  'notification': {
    title: '알림',
    description: '메시지를 표시합니다.',
    usage: ['제목과 메시지 설정', '이전 노드 출력을 메시지로 사용 가능'],
    tips: ['워크플로우 완료 알림, 에러 알림에 활용']
  },
  'webhook': {
    title: 'Webhook',
    description: '외부 URL로 데이터를 전송합니다. Slack, Teams 연동에 활용.',
    usage: ['Webhook URL 입력', 'HTTP 메서드 선택 (POST/PUT/PATCH)', '이전 노드 데이터가 자동으로 전송됨'],
    tips: ['Slack Incoming Webhook, MS Teams Connector 등과 연동']
  },
  'timer': {
    title: '타이머',
    description: '일정 간격으로 워크플로우를 실행합니다.',
    usage: ['실행 간격 설정 (밀리초 단위)'],
    tips: ['모니터링, 주기적 데이터 수집에 활용']
  },
  'scheduler': {
    title: '스케줄러',
    description: 'Cron 표현식으로 정해진 시간에 워크플로우를 실행합니다.',
    usage: ['Cron 표현식 입력 (분 시 일 월 요일)', '예: 0 9 * * 1-5 = 평일 오전 9시'],
    tips: ['일일 보고서 생성, 정기 데이터 수집에 활용']
  },
  // KB/벡터DB 노드
  'kb-query': {
    title: 'KB 쿼리',
    description: 'Knowledge Base에서 관련 문서를 검색합니다.',
    usage: ['Knowledge Base ID 입력', '검색 결과 수 설정', '이전 노드에서 쿼리 수신'],
    tips: ['RAG 파이프라인의 검색 단계에 활용']
  },
  'kb-ingest': {
    title: 'KB 문서 추가',
    description: 'Knowledge Base에 새 문서를 추가합니다.',
    usage: ['Knowledge Base ID 입력', 'S3 데이터 소스 URI 설정'],
    tips: ['문서 업데이트 시 사용']
  },
  // KISTI ScienceON 노드
  'kisti-articles': {
    title: 'KISTI 논문 검색',
    description: 'ScienceON API를 통해 국내외 학술논문을 검색합니다.',
    usage: ['Client ID, Auth Key, Hardware Key 입력', '검색어 및 검색 필드 설정', '검색 결과 수 조절'],
    tips: ['API 키는 scienceon.kisti.re.kr/openApi에서 신청', 'Hardware Key는 비워두면 자동 감지']
  },
  'kisti-patents': {
    title: 'KISTI 특허 검색',
    description: 'ScienceON API를 통해 국내외 특허정보를 검색합니다.',
    usage: ['Client ID, Auth Key, Hardware Key 입력', '검색어 및 특허 유형 설정', '검색 결과 수 조절'],
    tips: ['국내특허(KR), 미국특허(US), 일본특허(JP), 유럽특허(EP) 지원']
  },
  'kisti-reports': {
    title: 'KISTI 보고서 검색',
    description: 'ScienceON API를 통해 연구보고서를 검색합니다.',
    usage: ['Client ID, Auth Key, Hardware Key 입력', '검색어 및 보고서 유형 설정'],
    tips: ['연구보고서, 기술보고서, 정책보고서 검색 가능']
  },
  'kisti-trends': {
    title: 'KISTI 동향 분석',
    description: 'ScienceON API를 통해 과학기술 동향정보를 검색합니다.',
    usage: ['Client ID, Auth Key, Hardware Key 입력', '검색어 및 동향 분야 설정'],
    tips: ['IT/SW, 바이오/의료, 나노/소재, 에너지/환경, 건설/교통 분야 지원']
  },
}

// 노드 타입별 기본 설명 가져오기
const getNodeDescription = (type: string) => {
  if (NODE_DESCRIPTIONS[type]) return NODE_DESCRIPTIONS[type]

  // 모델 노드 기본 설명
  if (type.startsWith('model-')) {
    return {
      title: type.replace('model-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: 'AI 언어 모델로 텍스트를 생성하고 분석합니다.',
      usage: ['시스템 프롬프트로 역할 정의', 'Temperature와 Max Tokens 조절'],
    }
  }

  // AWS 서비스 기본 설명
  if (type.startsWith('aws-')) {
    return {
      title: type.replace('aws-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: 'AWS 서비스와 연동합니다.',
      usage: ['필요한 설정을 입력하세요'],
    }
  }

  // Bedrock 플랫폼 기본 설명
  if (type.startsWith('bedrock-')) {
    return {
      title: type.replace('bedrock-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: 'Amazon Bedrock 플랫폼 기능입니다.',
      usage: ['필요한 ARN 또는 ID를 입력하세요'],
    }
  }

  return {
    title: type,
    description: '노드 설정을 구성하세요.',
    usage: ['연결된 노드로부터 데이터를 받아 처리합니다'],
  }
}

function PropertyPanelContent() {
  // Shallow 선택자로 필요한 상태만 구독
  const { selectedNode, updateNode, deleteNode, setSelectedNode, addNode, toggleNodeEnabled, toggleBreakpoint, breakpointNodeId, saveKnowledgeBaseLocal } = useWorkflowStore(
    (state) => ({
      selectedNode: state.selectedNode,
      updateNode: state.updateNode,
      deleteNode: state.deleteNode,
      setSelectedNode: state.setSelectedNode,
      addNode: state.addNode,
      toggleNodeEnabled: state.toggleNodeEnabled,
      toggleBreakpoint: state.toggleBreakpoint,
      breakpointNodeId: state.breakpointNodeId,
      saveKnowledgeBaseLocal: state.saveKnowledgeBaseLocal,
    }),
    shallow
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // 메모이제이션된 핸들러들
  const handleChange = useCallback((key: string, value: any) => {
    if (!selectedNode) return
    updateNode(selectedNode.id, {
      config: { ...selectedNode.data.config, [key]: value },
    })
  }, [selectedNode, updateNode])

  const handleDelete = useCallback(() => {
    if (!selectedNode) return
    deleteNode(selectedNode.id)
    setSelectedNode(null)
  }, [selectedNode, deleteNode, setSelectedNode])

  const handleToggleEnabled = useCallback(() => {
    if (!selectedNode) return
    toggleNodeEnabled(selectedNode.id)
  }, [selectedNode, toggleNodeEnabled])

  const handleToggleBreakpoint = useCallback(() => {
    if (!selectedNode) return
    toggleBreakpoint(selectedNode.id)
  }, [selectedNode, toggleBreakpoint])

  const isBreakpoint = selectedNode?.id === breakpointNodeId

  const handleDuplicate = useCallback(() => {
    if (!selectedNode) return
    const newNode = {
      id: `node_${Date.now()}`,
      type: selectedNode.type,
      position: {
        x: selectedNode.position.x + 50,
        y: selectedNode.position.y + 50,
      },
      data: { ...selectedNode.data },
    }
    addNode(newNode)
  }, [selectedNode, addNode])

  if (!selectedNode) return null

  const { data, type } = selectedNode
  const nodeInfo = getNodeDescription(type || '')

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      if (type?.startsWith('model-')) {
        const modelId = MODEL_ID_MAP[type] || BEDROCK_MODELS[0].id
        const result = await invoke<{ response: string }>('invoke_bedrock', {
          request: {
            model_id: modelId,
            prompt: '테스트입니다. "테스트 성공"이라고 답하세요.',
            system_prompt: data.config?.system_prompt || '',
            max_tokens: 100,
            temperature: 0.1,
          },
        })
        setTestResult(`✅ 성공: ${result.response}`)
      }
      else if (type?.includes('agent')) {
        const result = await invoke<{ response: string }>('invoke_bedrock', {
          request: {
            model_id: data.config?.model_id || BEDROCK_MODELS[0].id,
            prompt: '테스트입니다. "테스트 성공"이라고 답하세요.',
            system_prompt: data.config?.system_prompt || '',
            max_tokens: 100,
            temperature: 0.1,
          },
        })
        setTestResult(`✅ 성공: ${result.response}`)
      }
      else if (type?.startsWith('aws-') || type?.startsWith('bedrock-')) {
        const result = await invoke<{ connected: boolean }>('test_aws_connection')
        if (result.connected) {
          setTestResult(`✅ AWS 연결 성공`)
        } else {
          setTestResult(`❌ AWS 연결 실패`)
        }
      }
      else if (type?.startsWith('api-')) {
        // API 노드 테스트
        if (type === 'api-generic') {
          if (!data.config?.api_url) {
            setTestResult(`❌ API URL을 입력하세요`)
          } else {
            setTestResult(`✅ API URL 설정 완료: ${data.config.api_url}`)
          }
        } else if (type === 'api-analyzer') {
          setTestResult(`✅ API 분석기 준비됨 - 문서 URL 또는 설명을 입력 후 분석 버튼을 클릭하세요`)
        } else {
          // 한국 공공 API
          if (!data.config?.api_key) {
            setTestResult(`❌ API 키를 입력하세요`)
          } else {
            setTestResult(`✅ API 키 설정 완료 - 실행 시 실제 API가 호출됩니다`)
          }
        }
      }
      else {
        setTestResult('✅ 노드 설정 완료')
      }
    } catch (error) {
      setTestResult(`❌ 오류: ${error}`)
    } finally {
      setTesting(false)
    }
  }

  // 사용 설명 컴포넌트
  const renderUsageGuide = () => (
    <Accordion
      defaultExpanded={false}
      sx={{
        mb: 2,
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        '&:before': { display: 'none' }
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HelpOutlineIcon sx={{ fontSize: 18, color: '#a5b4fc' }} />
          <Typography variant="body2" color="#a5b4fc">사용 방법</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="grey.300" sx={{ mb: 1 }}>
          {nodeInfo.description}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, color: 'grey.400' }}>
          {nodeInfo.usage.map((item, i) => (
            <Typography component="li" variant="caption" key={i} sx={{ mb: 0.5 }}>
              {item}
            </Typography>
          ))}
        </Box>
        {nodeInfo.tips && (
          <Alert severity="info" sx={{ mt: 1, fontSize: '0.7rem', py: 0 }}>
            Tip: {nodeInfo.tips.join(' ')}
          </Alert>
        )}
      </AccordionDetails>
    </Accordion>
  )

  // ========================================
  // 모델 노드 설정
  // ========================================
  const renderModelConfig = () => {
    const modelId = MODEL_ID_MAP[type || ''] || ''
    const isEmbedding = type?.includes('embed')
    const isImage = type?.includes('stable') || type?.includes('multimodal')

    return (
      <>
        <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
          모델 ID: {modelId}
        </Alert>

        {!isEmbedding && !isImage && (
          <>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="시스템 프롬프트"
              value={data.config?.system_prompt || ''}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              placeholder="이 모델의 역할을 정의하세요..."
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="grey.400" gutterBottom>
                Temperature: {data.config?.temperature ?? 0.7}
              </Typography>
              <Slider
                value={data.config?.temperature ?? 0.7}
                onChange={(_, value) => handleChange('temperature', value)}
                min={0}
                max={1}
                step={0.1}
                marks
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="grey.400" gutterBottom>
                Max Tokens: {data.config?.max_tokens ?? 4096}
              </Typography>
              <Slider
                value={data.config?.max_tokens ?? 4096}
                onChange={(_, value) => handleChange('max_tokens', value)}
                min={256}
                max={8192}
                step={256}
              />
            </Box>
          </>
        )}

        {isEmbedding && (
          <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
            임베딩 모델: 텍스트를 벡터로 변환합니다. 입력 텍스트를 연결하세요.
          </Alert>
        )}

        {isImage && (
          <>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="이미지 프롬프트"
              value={data.config?.image_prompt || ''}
              onChange={(e) => handleChange('image_prompt', e.target.value)}
              placeholder="생성할 이미지를 설명하세요..."
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>이미지 크기</InputLabel>
              <Select
                value={data.config?.image_size || '1024x1024'}
                label="이미지 크기"
                onChange={(e) => handleChange('image_size', e.target.value)}
              >
                <MenuItem value="512x512">512x512</MenuItem>
                <MenuItem value="1024x1024">1024x1024</MenuItem>
              </Select>
            </FormControl>
          </>
        )}
      </>
    )
  }

  // ========================================
  // 에이전트 노드 설정
  // ========================================
  const renderAgentConfig = () => (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>모델 선택</InputLabel>
        <Select
          value={data.config?.model_id || BEDROCK_MODELS[0].id}
          label="모델 선택"
          onChange={(e) => handleChange('model_id', e.target.value)}
        >
          {BEDROCK_MODELS.map((model) => (
            <MenuItem key={model.id} value={model.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={model.provider} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />
                {model.label}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        multiline
        rows={6}
        label="시스템 프롬프트 (역할/평가기준)"
        value={data.config?.system_prompt || ''}
        onChange={(e) => handleChange('system_prompt', e.target.value)}
        placeholder={`예시:\n당신은 전문 평가자입니다.\n다음 기준으로 평가하세요:\n1. 정확성\n2. 완전성\n3. 논리성`}
        sx={{ mb: 2 }}
      />

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="grey.400" gutterBottom>
          Temperature: {data.config?.temperature ?? 0.1}
        </Typography>
        <Slider
          value={data.config?.temperature ?? 0.1}
          onChange={(_, value) => handleChange('temperature', value)}
          min={0}
          max={1}
          step={0.1}
          marks
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="grey.400" gutterBottom>
          Max Tokens: {data.config?.max_tokens ?? 4096}
        </Typography>
        <Slider
          value={data.config?.max_tokens ?? 4096}
          onChange={(_, value) => handleChange('max_tokens', value)}
          min={256}
          max={8192}
          step={256}
        />
      </Box>

      {type === 'rag-agent' && (
        <>
          <FormControlLabel
            control={
              <Switch
                checked={data.config?.use_rag ?? true}
                onChange={(e) => handleChange('use_rag', e.target.checked)}
              />
            }
            label="RAG 활성화"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Knowledge Base ID"
            value={data.config?.kb_id || ''}
            onChange={(e) => handleChange('kb_id', e.target.value)}
            placeholder="arn:aws:bedrock:..."
            sx={{ mb: 2 }}
          />
        </>
      )}
    </>
  )

  // ========================================
  // Bedrock 플랫폼 노드 설정
  // ========================================
  const renderBedrockPlatformConfig = () => {
    const configs: Record<string, React.ReactNode> = {
      'bedrock-guardrails': (
        <>
          <TextField
            fullWidth
            label="Guardrail ID"
            value={data.config?.guardrail_id || ''}
            onChange={(e) => handleChange('guardrail_id', e.target.value)}
            placeholder="arn:aws:bedrock:..."
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Guardrail Version"
            value={data.config?.guardrail_version || 'DRAFT'}
            onChange={(e) => handleChange('guardrail_version', e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={data.config?.enable_trace ?? false}
                onChange={(e) => handleChange('enable_trace', e.target.checked)}
              />
            }
            label="필터링 추적 활성화"
            sx={{ mb: 2 }}
          />
        </>
      ),
      'bedrock-agents': (
        <>
          <TextField
            fullWidth
            label="Agent ID"
            value={data.config?.agent_id || ''}
            onChange={(e) => handleChange('agent_id', e.target.value)}
            placeholder="에이전트 ID"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Agent Alias ID"
            value={data.config?.agent_alias_id || ''}
            onChange={(e) => handleChange('agent_alias_id', e.target.value)}
            placeholder="TSTALIASID"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Session ID (선택)"
            value={data.config?.session_id || ''}
            onChange={(e) => handleChange('session_id', e.target.value)}
            placeholder="대화 세션 ID"
            sx={{ mb: 2 }}
          />
        </>
      ),
      'bedrock-knowledge-base': (
        <>
          <TextField
            fullWidth
            label="Knowledge Base ID"
            value={data.config?.kb_id || ''}
            onChange={(e) => handleChange('kb_id', e.target.value)}
            placeholder="Knowledge Base ID"
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>검색 유형</InputLabel>
            <Select
              value={data.config?.retrieval_type || 'SEMANTIC'}
              label="검색 유형"
              onChange={(e) => handleChange('retrieval_type', e.target.value)}
            >
              <MenuItem value="SEMANTIC">의미 검색</MenuItem>
              <MenuItem value="HYBRID">하이브리드 검색</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>
              검색 결과 수: {data.config?.number_of_results ?? 5}
            </Typography>
            <Slider
              value={data.config?.number_of_results ?? 5}
              onChange={(_, value) => handleChange('number_of_results', value)}
              min={1}
              max={20}
              step={1}
            />
          </Box>
        </>
      ),
      'bedrock-fine-tuning': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>베이스 모델</InputLabel>
            <Select
              value={data.config?.base_model || 'anthropic.claude-3-haiku-20240307-v1:0'}
              label="베이스 모델"
              onChange={(e) => handleChange('base_model', e.target.value)}
            >
              {BEDROCK_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="학습 데이터 S3 경로"
            value={data.config?.training_data_s3 || ''}
            onChange={(e) => handleChange('training_data_s3', e.target.value)}
            placeholder="s3://bucket/training-data.jsonl"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="검증 데이터 S3 경로 (선택)"
            value={data.config?.validation_data_s3 || ''}
            onChange={(e) => handleChange('validation_data_s3', e.target.value)}
            placeholder="s3://bucket/validation-data.jsonl"
            sx={{ mb: 2 }}
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>
              Epochs: {data.config?.epochs ?? 3}
            </Typography>
            <Slider
              value={data.config?.epochs ?? 3}
              onChange={(_, value) => handleChange('epochs', value)}
              min={1}
              max={10}
              step={1}
            />
          </Box>
        </>
      ),
      'bedrock-evaluation': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>평가 유형</InputLabel>
            <Select
              value={data.config?.evaluation_type || 'automatic'}
              label="평가 유형"
              onChange={(e) => handleChange('evaluation_type', e.target.value)}
            >
              <MenuItem value="automatic">자동 평가</MenuItem>
              <MenuItem value="human">수동 평가</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="평가 데이터 S3 경로"
            value={data.config?.eval_data_s3 || ''}
            onChange={(e) => handleChange('eval_data_s3', e.target.value)}
            placeholder="s3://bucket/eval-data.jsonl"
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>평가 지표</InputLabel>
            <Select
              value={data.config?.metrics || 'accuracy'}
              label="평가 지표"
              onChange={(e) => handleChange('metrics', e.target.value)}
            >
              <MenuItem value="accuracy">정확도</MenuItem>
              <MenuItem value="relevance">관련성</MenuItem>
              <MenuItem value="coherence">일관성</MenuItem>
              <MenuItem value="fluency">유창성</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'bedrock-provisioned': (
        <>
          <TextField
            fullWidth
            label="Provisioned Model ARN"
            value={data.config?.provisioned_arn || ''}
            onChange={(e) => handleChange('provisioned_arn', e.target.value)}
            placeholder="arn:aws:bedrock:..."
            sx={{ mb: 2 }}
          />
          <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
            프로비저닝된 처리량을 사용하여 안정적인 응답 시간을 보장합니다.
          </Alert>
        </>
      ),
      'bedrock-batch': (
        <>
          <TextField
            fullWidth
            label="입력 S3 경로"
            value={data.config?.input_s3 || ''}
            onChange={(e) => handleChange('input_s3', e.target.value)}
            placeholder="s3://bucket/input/"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="출력 S3 경로"
            value={data.config?.output_s3 || ''}
            onChange={(e) => handleChange('output_s3', e.target.value)}
            placeholder="s3://bucket/output/"
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>모델</InputLabel>
            <Select
              value={data.config?.model_id || BEDROCK_MODELS[0].id}
              label="모델"
              onChange={(e) => handleChange('model_id', e.target.value)}
            >
              {BEDROCK_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </>
      ),
    }

    return configs[type || ''] || (
      <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
        이 Bedrock 기능의 설정을 구성하세요.
      </Alert>
    )
  }

  // ========================================
  // AWS 서비스 노드 설정
  // ========================================
  const renderAWSServiceConfig = () => {
    const serviceConfigs: Record<string, React.ReactNode> = {
      'aws-s3': (
        <>
          <TextField fullWidth label="버킷 이름" value={data.config?.bucket || ''} onChange={(e) => handleChange('bucket', e.target.value)} placeholder="my-bucket" sx={{ mb: 2 }} />
          <TextField fullWidth label="프리픽스 (폴더)" value={data.config?.prefix || ''} onChange={(e) => handleChange('prefix', e.target.value)} placeholder="documents/" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>작업</InputLabel>
            <Select value={data.config?.operation || 'list'} label="작업" onChange={(e) => handleChange('operation', e.target.value)}>
              <MenuItem value="list">목록 조회</MenuItem>
              <MenuItem value="get">파일 읽기</MenuItem>
              <MenuItem value="put">파일 쓰기</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-textract': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>분석 유형</InputLabel>
            <Select value={data.config?.analysis_type || 'text'} label="분석 유형" onChange={(e) => handleChange('analysis_type', e.target.value)}>
              <MenuItem value="text">텍스트 추출</MenuItem>
              <MenuItem value="forms">양식 분석</MenuItem>
              <MenuItem value="tables">테이블 분석</MenuItem>
              <MenuItem value="expense">영수증/청구서 분석</MenuItem>
              <MenuItem value="identity">신분증 분석</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="문서 S3 경로" value={data.config?.document_s3 || ''} onChange={(e) => handleChange('document_s3', e.target.value)} placeholder="s3://bucket/document.pdf" sx={{ mb: 2 }} />
        </>
      ),
      'aws-comprehend': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>분석 유형</InputLabel>
            <Select value={data.config?.comprehend_type || 'sentiment'} label="분석 유형" onChange={(e) => handleChange('comprehend_type', e.target.value)}>
              <MenuItem value="sentiment">감정 분석</MenuItem>
              <MenuItem value="entities">개체 인식 (NER)</MenuItem>
              <MenuItem value="key_phrases">키워드 추출</MenuItem>
              <MenuItem value="language">언어 감지</MenuItem>
              <MenuItem value="pii">개인정보 감지</MenuItem>
              <MenuItem value="syntax">구문 분석</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>언어</InputLabel>
            <Select value={data.config?.language_code || 'ko'} label="언어" onChange={(e) => handleChange('language_code', e.target.value)}>
              <MenuItem value="ko">한국어</MenuItem>
              <MenuItem value="en">영어</MenuItem>
              <MenuItem value="ja">일본어</MenuItem>
              <MenuItem value="zh">중국어</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-translate': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>원본 언어</InputLabel>
            <Select value={data.config?.source_lang || 'auto'} label="원본 언어" onChange={(e) => handleChange('source_lang', e.target.value)}>
              <MenuItem value="auto">자동 감지</MenuItem>
              <MenuItem value="ko">한국어</MenuItem>
              <MenuItem value="en">영어</MenuItem>
              <MenuItem value="ja">일본어</MenuItem>
              <MenuItem value="zh">중국어</MenuItem>
              <MenuItem value="de">독일어</MenuItem>
              <MenuItem value="fr">프랑스어</MenuItem>
              <MenuItem value="es">스페인어</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>대상 언어</InputLabel>
            <Select value={data.config?.target_lang || 'en'} label="대상 언어" onChange={(e) => handleChange('target_lang', e.target.value)}>
              <MenuItem value="ko">한국어</MenuItem>
              <MenuItem value="en">영어</MenuItem>
              <MenuItem value="ja">일본어</MenuItem>
              <MenuItem value="zh">중국어</MenuItem>
              <MenuItem value="de">독일어</MenuItem>
              <MenuItem value="fr">프랑스어</MenuItem>
              <MenuItem value="es">스페인어</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-polly': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>음성</InputLabel>
            <Select value={data.config?.voice_id || 'Seoyeon'} label="음성" onChange={(e) => handleChange('voice_id', e.target.value)}>
              <MenuItem value="Seoyeon">Seoyeon (한국어 여성)</MenuItem>
              <MenuItem value="Joanna">Joanna (영어 여성)</MenuItem>
              <MenuItem value="Matthew">Matthew (영어 남성)</MenuItem>
              <MenuItem value="Mizuki">Mizuki (일본어 여성)</MenuItem>
              <MenuItem value="Zhiyu">Zhiyu (중국어 여성)</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>출력 형식</InputLabel>
            <Select value={data.config?.output_format || 'mp3'} label="출력 형식" onChange={(e) => handleChange('output_format', e.target.value)}>
              <MenuItem value="mp3">MP3</MenuItem>
              <MenuItem value="ogg_vorbis">OGG</MenuItem>
              <MenuItem value="pcm">PCM</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-transcribe': (
        <>
          <TextField fullWidth label="오디오 S3 경로" value={data.config?.audio_s3 || ''} onChange={(e) => handleChange('audio_s3', e.target.value)} placeholder="s3://bucket/audio.mp3" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>언어</InputLabel>
            <Select value={data.config?.language_code || 'ko-KR'} label="언어" onChange={(e) => handleChange('language_code', e.target.value)}>
              <MenuItem value="ko-KR">한국어</MenuItem>
              <MenuItem value="en-US">영어 (미국)</MenuItem>
              <MenuItem value="ja-JP">일본어</MenuItem>
              <MenuItem value="zh-CN">중국어</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-rekognition': (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>분석 유형</InputLabel>
            <Select value={data.config?.analysis_type || 'labels'} label="분석 유형" onChange={(e) => handleChange('analysis_type', e.target.value)}>
              <MenuItem value="labels">라벨 감지</MenuItem>
              <MenuItem value="faces">얼굴 감지</MenuItem>
              <MenuItem value="text">텍스트 감지</MenuItem>
              <MenuItem value="celebrities">유명인 인식</MenuItem>
              <MenuItem value="moderation">콘텐츠 검수</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="이미지 S3 경로" value={data.config?.image_s3 || ''} onChange={(e) => handleChange('image_s3', e.target.value)} placeholder="s3://bucket/image.jpg" sx={{ mb: 2 }} />
        </>
      ),
      'aws-opensearch': (
        <>
          <TextField fullWidth label="도메인 엔드포인트" value={data.config?.endpoint || ''} onChange={(e) => handleChange('endpoint', e.target.value)} placeholder="https://search-domain.region.es.amazonaws.com" sx={{ mb: 2 }} />
          <TextField fullWidth label="인덱스 이름" value={data.config?.index_name || ''} onChange={(e) => handleChange('index_name', e.target.value)} placeholder="my-vectors" sx={{ mb: 2 }} />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>Top K: {data.config?.top_k ?? 10}</Typography>
            <Slider value={data.config?.top_k ?? 10} onChange={(_, value) => handleChange('top_k', value)} min={1} max={50} step={1} />
          </Box>
        </>
      ),
      'aws-lambda': (
        <>
          <TextField fullWidth label="함수 이름" value={data.config?.function_name || ''} onChange={(e) => handleChange('function_name', e.target.value)} placeholder="my-function" sx={{ mb: 2 }} />
          <TextField fullWidth multiline rows={3} label="페이로드 (JSON)" value={data.config?.payload || '{}'} onChange={(e) => handleChange('payload', e.target.value)} sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={data.config?.async_invoke ?? false} onChange={(e) => handleChange('async_invoke', e.target.checked)} />}
            label="비동기 호출"
            sx={{ mb: 2 }}
          />
        </>
      ),
      'aws-dynamodb': (
        <>
          <TextField fullWidth label="테이블 이름" value={data.config?.table_name || ''} onChange={(e) => handleChange('table_name', e.target.value)} placeholder="my-table" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>작업</InputLabel>
            <Select value={data.config?.operation || 'query'} label="작업" onChange={(e) => handleChange('operation', e.target.value)}>
              <MenuItem value="get">항목 조회</MenuItem>
              <MenuItem value="put">항목 추가</MenuItem>
              <MenuItem value="query">쿼리</MenuItem>
              <MenuItem value="scan">스캔</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="파티션 키" value={data.config?.partition_key || ''} onChange={(e) => handleChange('partition_key', e.target.value)} placeholder="id" sx={{ mb: 2 }} />
        </>
      ),
      'aws-step-functions': (
        <>
          <TextField fullWidth label="State Machine ARN" value={data.config?.state_machine_arn || ''} onChange={(e) => handleChange('state_machine_arn', e.target.value)} placeholder="arn:aws:states:..." sx={{ mb: 2 }} />
          <TextField fullWidth multiline rows={3} label="입력 (JSON)" value={data.config?.input_json || '{}'} onChange={(e) => handleChange('input_json', e.target.value)} sx={{ mb: 2 }} />
        </>
      ),
      'aws-sqs': (
        <>
          <TextField fullWidth label="Queue URL" value={data.config?.queue_url || ''} onChange={(e) => handleChange('queue_url', e.target.value)} placeholder="https://sqs.region.amazonaws.com/account/queue" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>작업</InputLabel>
            <Select value={data.config?.operation || 'send'} label="작업" onChange={(e) => handleChange('operation', e.target.value)}>
              <MenuItem value="send">메시지 전송</MenuItem>
              <MenuItem value="receive">메시지 수신</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'aws-sns': (
        <>
          <TextField fullWidth label="Topic ARN" value={data.config?.topic_arn || ''} onChange={(e) => handleChange('topic_arn', e.target.value)} placeholder="arn:aws:sns:..." sx={{ mb: 2 }} />
          <TextField fullWidth label="Subject (선택)" value={data.config?.subject || ''} onChange={(e) => handleChange('subject', e.target.value)} placeholder="알림 제목" sx={{ mb: 2 }} />
        </>
      ),
    }

    return (
      <>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>리전</InputLabel>
          <Select value={data.config?.region || 'ap-northeast-2'} label="리전" onChange={(e) => handleChange('region', e.target.value)}>
            {AWS_REGIONS.map((r) => (<MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>))}
          </Select>
        </FormControl>
        {serviceConfigs[type || ''] || (
          <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
            이 AWS 서비스의 설정을 구성하세요.
          </Alert>
        )}
      </>
    )
  }

  // ========================================
  // 데이터 처리 노드 설정
  // ========================================
  const renderDataConfig = () => (
    <>
      {type === 'text-splitter' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>청크 크기: {data.config?.chunk_size ?? 1000}</Typography>
            <Slider value={data.config?.chunk_size ?? 1000} onChange={(_, value) => handleChange('chunk_size', value)} min={200} max={4000} step={100} />
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>오버랩: {data.config?.chunk_overlap ?? 200}</Typography>
            <Slider value={data.config?.chunk_overlap ?? 200} onChange={(_, value) => handleChange('chunk_overlap', value)} min={0} max={500} step={50} />
          </Box>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>분할 기준</InputLabel>
            <Select value={data.config?.split_by || 'characters'} label="분할 기준" onChange={(e) => handleChange('split_by', e.target.value)}>
              <MenuItem value="characters">문자 수</MenuItem>
              <MenuItem value="sentences">문장</MenuItem>
              <MenuItem value="paragraphs">문단</MenuItem>
            </Select>
          </FormControl>
        </>
      )}
      {type === 'embedder' && (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>임베딩 모델</InputLabel>
            <Select value={data.config?.embedding_model || 'amazon.titan-embed-text-v1'} label="임베딩 모델" onChange={(e) => handleChange('embedding_model', e.target.value)}>
              <MenuItem value="amazon.titan-embed-text-v1">Titan Embeddings v1 (1536 dim)</MenuItem>
              <MenuItem value="amazon.titan-embed-text-v2:0">Titan Embeddings v2 (1024 dim)</MenuItem>
              <MenuItem value="cohere.embed-multilingual-v3">Cohere Multilingual (1024 dim)</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={data.config?.normalize ?? true} onChange={(e) => handleChange('normalize', e.target.checked)} />}
            label="벡터 정규화"
            sx={{ mb: 2 }}
          />
        </>
      )}
      {type === 'vector-search' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수 (Top K): {data.config?.top_k ?? 10}</Typography>
            <Slider value={data.config?.top_k ?? 10} onChange={(_, value) => handleChange('top_k', value)} min={1} max={50} step={1} />
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>최소 유사도: {data.config?.min_score ?? 0.7}</Typography>
            <Slider value={data.config?.min_score ?? 0.7} onChange={(_, value) => handleChange('min_score', value)} min={0} max={1} step={0.05} />
          </Box>
        </>
      )}
      {type === 'document-loader' && (
        <>
          <TextField fullWidth label="파일 경로 또는 S3 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="s3://bucket/document.pdf" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>파일 형식</InputLabel>
            <Select value={data.config?.file_type || 'auto'} label="파일 형식" onChange={(e) => handleChange('file_type', e.target.value)}>
              <MenuItem value="auto">자동 감지</MenuItem>
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="docx">DOCX</MenuItem>
              <MenuItem value="txt">텍스트</MenuItem>
              <MenuItem value="csv">CSV</MenuItem>
            </Select>
          </FormControl>
        </>
      )}
      {type === 'knowledge-base' && (
        <>
          <TextField fullWidth label="Knowledge Base ID" value={data.config?.kb_id || ''} onChange={(e) => handleChange('kb_id', e.target.value)} placeholder="Knowledge Base ID" sx={{ mb: 2 }} />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.number_of_results ?? 5}</Typography>
            <Slider value={data.config?.number_of_results ?? 5} onChange={(_, value) => handleChange('number_of_results', value)} min={1} max={20} step={1} />
          </Box>
        </>
      )}
    </>
  )

  // ========================================
  // 입출력 노드 설정
  // ========================================
  const renderIOConfig = () => (
    <>
      {type === 'input' && (
        <>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="텍스트 입력"
            value={data.config?.text_input || ''}
            onChange={(e) => handleChange('text_input', e.target.value)}
            placeholder="질문이나 처리할 텍스트를 입력하세요..."
            sx={{ mb: 2 }}
            InputProps={{ sx: { color: 'white' } }}
          />
          <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 1 }}>
            또는 JSON 형식으로 입력:
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="JSON 입력 (선택사항)"
            value={data.config?.json_input || ''}
            onChange={(e) => handleChange('json_input', e.target.value)}
            placeholder='{"query": "질문", "context": "추가 컨텍스트"}'
            sx={{ mb: 2 }}
            InputProps={{ sx: { color: 'white', fontFamily: 'monospace', fontSize: '0.8rem' } }}
          />
        </>
      )}
      {type === 'output' && (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>출력 형식</InputLabel>
            <Select value={data.config?.output_format || 'text'} label="출력 형식" onChange={(e) => handleChange('output_format', e.target.value)}>
              <MenuItem value="text">텍스트</MenuItem>
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="markdown">마크다운</MenuItem>
            </Select>
          </FormControl>
          <OutputDisplay
            result={data.config?.result}
            format={data.config?.output_format || 'text'}
          />
        </>
      )}
      {type === 'local-folder' && (
        <>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              label="폴더 경로"
              value={data.config?.folder_path || ''}
              onChange={(e) => handleChange('folder_path', e.target.value)}
              placeholder="C:\Documents\data"
              helperText="로컬 폴더의 전체 경로"
            />
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  const result = await invoke<string | null>('select_folder', {
                    title: '폴더 선택',
                  })
                  if (result) {
                    handleChange('folder_path', result)
                  }
                } catch (error) {
                  console.error('폴더 선택 실패:', error)
                }
              }}
              sx={{
                minWidth: 80,
                height: 56,
                borderColor: 'rgba(255,255,255,0.2)',
                color: 'grey.400',
              }}
            >
              찾아보기
            </Button>
          </Box>
          <TextField fullWidth label="파일 필터 (선택)" value={data.config?.file_filter || ''} onChange={(e) => handleChange('file_filter', e.target.value)} placeholder="*.txt;*.pdf;*.json" sx={{ mb: 2 }} helperText="세미콜론(;)으로 구분된 확장자 필터" />
          <FormControlLabel
            control={<Switch checked={data.config?.include_subfolders ?? false} onChange={(e) => handleChange('include_subfolders', e.target.checked)} />}
            label="하위 폴더 포함"
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={<Switch checked={data.config?.read_content ?? true} onChange={(e) => handleChange('read_content', e.target.checked)} />}
            label="파일 내용 읽기 (텍스트 파일)"
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

          <Typography variant="subtitle2" color="grey.300" sx={{ mb: 1 }}>폴더 구조 설정</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>폴더 구조</InputLabel>
            <Select
              value={data.config?.folder_structure || 'flat'}
              label="폴더 구조"
              onChange={(e) => handleChange('folder_structure', e.target.value)}
            >
              <MenuItem value="flat">단일 폴더 (Flat)</MenuItem>
              <MenuItem value="nested">중첩 폴더 (Nested)</MenuItem>
              <MenuItem value="cnt_application">CNT 신청서 (1건당 10개 유형)</MenuItem>
              <MenuItem value="custom">사용자 정의</MenuItem>
            </Select>
          </FormControl>

          {data.config?.folder_structure === 'cnt_application' && (
            <Alert severity="success" sx={{ mb: 2, fontSize: '0.7rem' }}>
              📁 CNT 신청서 구조: 루트폴더/신청건폴더/문서유형<br/>
              10개 문서 유형: 기술개요서, 기술설명서, 시험성적서, 인증서류, 도면, 사진자료, 시공사례, 비교분석표, 원가분석, 기타첨부
            </Alert>
          )}

          {data.config?.folder_structure === 'custom' && (
            <TextField
              fullWidth
              multiline
              rows={4}
              label="사용자 정의 구조"
              value={data.config?.custom_structure || ''}
              onChange={(e) => handleChange('custom_structure', e.target.value)}
              placeholder={'{\n  "level1": "프로젝트명",\n  "level2": "문서유형",\n  "patterns": ["*.pdf", "*.docx"]\n}'}
              sx={{ mb: 2 }}
              helperText="JSON 형식으로 폴더 구조 정의"
            />
          )}

          <FormControlLabel
            control={<Switch checked={data.config?.group_by_subfolder ?? false} onChange={(e) => handleChange('group_by_subfolder', e.target.checked)} />}
            label="하위 폴더별 그룹화"
            sx={{ mb: 2 }}
          />

          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: 폴더 내 파일 목록과 내용이 다음 노드로 전달됩니다. 대용량 폴더는 처리 시간이 길어질 수 있습니다.
          </Alert>
        </>
      )}
      {type === 'local-file' && (
        <>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              label="파일 경로"
              value={data.config?.file_path || ''}
              onChange={(e) => handleChange('file_path', e.target.value)}
              placeholder="C:\Documents\example.pdf"
              helperText="로컬 파일의 전체 경로"
            />
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  const result = await invoke<string | null>('select_file', {
                    title: '파일 선택',
                    filters: ['pdf', 'hwp', 'docx', 'txt', 'json', 'xlsx'],
                  })
                  if (result) {
                    handleChange('file_path', result)
                  }
                } catch (error) {
                  console.error('파일 선택 실패:', error)
                }
              }}
              sx={{
                minWidth: 80,
                height: 56,
                borderColor: 'rgba(255,255,255,0.2)',
                color: 'grey.400',
              }}
            >
              찾아보기
            </Button>
          </Box>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>파일 형식</InputLabel>
            <Select value={data.config?.file_type || 'auto'} label="파일 형식" onChange={(e) => handleChange('file_type', e.target.value)}>
              <MenuItem value="auto">자동 감지</MenuItem>
              <MenuItem value="text">텍스트 (txt, md, log)</MenuItem>
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="csv">CSV</MenuItem>
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="docx">DOCX</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>인코딩</InputLabel>
            <Select value={data.config?.encoding || 'utf-8'} label="인코딩" onChange={(e) => handleChange('encoding', e.target.value)}>
              <MenuItem value="utf-8">UTF-8</MenuItem>
              <MenuItem value="euc-kr">EUC-KR (한글)</MenuItem>
              <MenuItem value="cp949">CP949 (한글 Windows)</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: 파일 내용이 텍스트로 추출되어 다음 노드로 전달됩니다.
          </Alert>
        </>
      )}
    </>
  )

  // ========================================
  // 제어 노드 설정
  // ========================================
  const renderControlConfig = () => (
    <>
      {type === 'prompt-template' && (
        <>
          <TextField fullWidth multiline rows={6} label="프롬프트 템플릿" value={data.config?.template || ''} onChange={(e) => handleChange('template', e.target.value)}
            placeholder="{{input}}을(를) 바탕으로 다음 작업을 수행하세요:\n\n1. 핵심 내용 요약\n2. 주요 키워드 추출\n3. 결론 도출" sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: {'{{변수명}}'} 형식으로 변수를 정의하면 입력 데이터로 자동 대체됩니다.
          </Alert>
        </>
      )}
      {type === 'conditional' && (
        <>
          <TextField fullWidth label="조건식" value={data.config?.condition || ''} onChange={(e) => handleChange('condition', e.target.value)} placeholder="result.score > 80" sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: JavaScript 조건식을 사용하세요. true면 첫 번째 출력, false면 두 번째 출력으로 분기됩니다.
          </Alert>
        </>
      )}
      {type === 'loop' && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>반복 횟수: {data.config?.iterations ?? 1}</Typography>
            <Slider value={data.config?.iterations ?? 1} onChange={(_, value) => handleChange('iterations', value)} min={1} max={100} step={1} />
          </Box>
          <FormControlLabel
            control={<Switch checked={data.config?.stop_on_error ?? true} onChange={(e) => handleChange('stop_on_error', e.target.checked)} />}
            label="오류 시 중단"
            sx={{ mb: 2 }}
          />
        </>
      )}
      {type === 'merge' && (
        <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
          여러 노드의 출력을 이 노드에 연결하면 모든 결과가 하나로 병합됩니다.
        </Alert>
      )}
    </>
  )

  // ========================================
  // 외부 API 노드 설정
  // ========================================
  const renderAPIConfig = () => {
    const apiConfigs: Record<string, React.ReactNode> = {
      'api-generic': (
        <>
          <TextField fullWidth label="API URL" value={data.config?.api_url || ''} onChange={(e) => handleChange('api_url', e.target.value)} placeholder="https://api.example.com/endpoint" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>HTTP 메서드</InputLabel>
            <Select value={data.config?.method || 'GET'} label="HTTP 메서드" onChange={(e) => handleChange('method', e.target.value)}>
              <MenuItem value="GET">GET</MenuItem>
              <MenuItem value="POST">POST</MenuItem>
              <MenuItem value="PUT">PUT</MenuItem>
              <MenuItem value="DELETE">DELETE</MenuItem>
              <MenuItem value="PATCH">PATCH</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth multiline rows={3} label="Headers (JSON)" value={data.config?.headers || '{\n  "Content-Type": "application/json"\n}'} onChange={(e) => handleChange('headers', e.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} />
          <TextField fullWidth multiline rows={4} label="Request Body (JSON)" value={data.config?.body || ''} onChange={(e) => handleChange('body', e.target.value)} placeholder='{"key": "value"}' sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} />
          <TextField fullWidth label="응답 경로 (선택)" value={data.config?.response_path || ''} onChange={(e) => handleChange('response_path', e.target.value)} placeholder="data.items" sx={{ mb: 2 }} helperText="JSON 응답에서 특정 경로만 추출 (예: data.items)" />
        </>
      ),
      'api-analyzer': (
        <>
          <TextField fullWidth label="API 문서 URL" value={data.config?.docs_url || ''} onChange={(e) => handleChange('docs_url', e.target.value)} placeholder="https://api.example.com/docs (OpenAPI/Swagger)" sx={{ mb: 2 }} />
          <TextField fullWidth multiline rows={4} label="API 설명 (문서가 없을 경우)" value={data.config?.api_description || ''} onChange={(e) => handleChange('api_description', e.target.value)} placeholder="이 API는 특허 검색을 제공합니다. GET /search?q={검색어}&page={페이지} 형태로 호출합니다..." sx={{ mb: 2 }} />
          <Button fullWidth variant="contained" sx={{ mb: 2, background: '#6366f1' }} onClick={() => alert('AI 분석 기능은 추후 구현됩니다.')}>
            🤖 AI로 API 구조 분석 (토큰 소모)
          </Button>
          <Alert severity="warning" sx={{ fontSize: '0.75rem', mb: 2 }}>
            AI 분석은 토큰을 소모합니다. 분석 결과는 캐시되어 재사용됩니다.
          </Alert>
          {data.config?.analyzed_endpoints && (
            <Box sx={{ mb: 2, p: 1, background: 'rgba(99, 102, 241, 0.1)', borderRadius: 1 }}>
              <Typography variant="caption" color="grey.400">분석된 엔드포인트:</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{data.config.analyzed_endpoints}</Typography>
            </Box>
          )}
        </>
      ),
      // 한국 공공 데이터 API들
      'api-kipris': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="특허청에서 발급받은 API 키" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>검색 유형</InputLabel>
            <Select value={data.config?.search_type || 'patent'} label="검색 유형" onChange={(e) => handleChange('search_type', e.target.value)}>
              <MenuItem value="patent">특허</MenuItem>
              <MenuItem value="utility">실용신안</MenuItem>
              <MenuItem value="design">디자인</MenuItem>
              <MenuItem value="trademark">상표</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.num_of_rows ?? 10}</Typography>
            <Slider value={data.config?.num_of_rows ?? 10} onChange={(_, value) => handleChange('num_of_rows', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="http://plus.kipris.or.kr" target="_blank" style={{ color: '#a5b4fc' }}>plus.kipris.or.kr</a>에서 발급
          </Alert>
        </>
      ),
      'api-scienceon': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="KISTI에서 발급받은 API 키" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>검색 범위</InputLabel>
            <Select value={data.config?.search_scope || 'all'} label="검색 범위" onChange={(e) => handleChange('search_scope', e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="article">논문</MenuItem>
              <MenuItem value="patent">특허</MenuItem>
              <MenuItem value="report">보고서</MenuItem>
              <MenuItem value="trend">동향</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.display_count ?? 10}</Typography>
            <Slider value={data.config?.display_count ?? 10} onChange={(_, value) => handleChange('display_count', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="https://scienceon.kisti.re.kr" target="_blank" style={{ color: '#a5b4fc' }}>scienceon.kisti.re.kr</a>에서 발급
          </Alert>
        </>
      ),
      'api-data-go-kr': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="공공데이터포털에서 발급받은 인증키" sx={{ mb: 2 }} />
          <TextField fullWidth label="서비스 URL" value={data.config?.service_url || ''} onChange={(e) => handleChange('service_url', e.target.value)} placeholder="http://apis.data.go.kr/서비스명/..." sx={{ mb: 2 }} helperText="활용신청한 API의 요청 URL" />
          <TextField fullWidth multiline rows={3} label="추가 파라미터 (JSON)" value={data.config?.params || '{\n  "numOfRows": "10",\n  "pageNo": "1"\n}'} onChange={(e) => handleChange('params', e.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="https://www.data.go.kr" target="_blank" style={{ color: '#a5b4fc' }}>data.go.kr</a>에서 원하는 API 활용신청 후 발급
          </Alert>
        </>
      ),
      'api-ntis': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="NTIS에서 발급받은 API 키" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>검색 유형</InputLabel>
            <Select value={data.config?.search_type || 'project'} label="검색 유형" onChange={(e) => handleChange('search_type', e.target.value)}>
              <MenuItem value="project">R&D 과제</MenuItem>
              <MenuItem value="result">연구 성과</MenuItem>
              <MenuItem value="researcher">연구 인력</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="https://www.ntis.go.kr" target="_blank" style={{ color: '#a5b4fc' }}>ntis.go.kr</a>에서 발급
          </Alert>
        </>
      ),
      'api-riss': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="RISS에서 발급받은 API 키" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>자료 유형</InputLabel>
            <Select value={data.config?.doc_type || 'thesis'} label="자료 유형" onChange={(e) => handleChange('doc_type', e.target.value)}>
              <MenuItem value="thesis">학위논문</MenuItem>
              <MenuItem value="article">학술지논문</MenuItem>
              <MenuItem value="book">단행본</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="https://www.riss.kr" target="_blank" style={{ color: '#a5b4fc' }}>riss.kr</a>에서 발급
          </Alert>
        </>
      ),
      'api-kostat': (
        <>
          <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} placeholder="KOSIS에서 발급받은 API 키" sx={{ mb: 2 }} />
          <TextField fullWidth label="통계표 ID" value={data.config?.stat_id || ''} onChange={(e) => handleChange('stat_id', e.target.value)} placeholder="통계표 ID (예: DT_1B040A3)" sx={{ mb: 2 }} />
          <TextField fullWidth label="기간" value={data.config?.period || ''} onChange={(e) => handleChange('period', e.target.value)} placeholder="예: 2020,2021,2022" sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: API 키: <a href="https://kosis.kr" target="_blank" style={{ color: '#a5b4fc' }}>kosis.kr</a>에서 발급
          </Alert>
        </>
      ),
      // ========================================
      // KISTI ScienceON 노드들
      // ========================================
      'kisti-articles': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>KISTI 논문 검색</b>: ScienceON API를 통해 국내외 학술논문을 검색합니다.
          </Alert>
          <TextField fullWidth label="Client ID" value={data.config?.client_id || ''} onChange={(e) => handleChange('client_id', e.target.value)} placeholder="ScienceON에서 발급받은 Client ID" sx={{ mb: 2 }} />
          <TextField fullWidth label="Auth Key (API Key)" type="password" value={data.config?.auth_key || ''} onChange={(e) => handleChange('auth_key', e.target.value)} placeholder="ScienceON에서 발급받은 인증키" sx={{ mb: 2 }} />
          <TextField fullWidth label="Hardware Key" value={data.config?.hardware_key || ''} onChange={(e) => handleChange('hardware_key', e.target.value)} placeholder="MAC 주소 (자동 감지됨)" sx={{ mb: 2 }} helperText="비워두면 자동으로 감지합니다" />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>검색 필드</InputLabel>
            <Select value={data.config?.search_field || 'BI'} label="검색 필드" onChange={(e) => handleChange('search_field', e.target.value)}>
              <MenuItem value="BI">전체 (BI)</MenuItem>
              <MenuItem value="TI">제목 (TI)</MenuItem>
              <MenuItem value="AU">저자 (AU)</MenuItem>
              <MenuItem value="AB">초록 (AB)</MenuItem>
              <MenuItem value="KW">키워드 (KW)</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.display_count ?? 10}</Typography>
            <Slider value={data.config?.display_count ?? 10} onChange={(_, value) => handleChange('display_count', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            Tip: API 신청: <a href="https://scienceon.kisti.re.kr/openApi/openApiInfo.do" target="_blank" style={{ color: '#a5b4fc' }}>scienceon.kisti.re.kr/openApi</a>
          </Alert>
        </>
      ),
      'kisti-patents': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>KISTI 특허 검색</b>: ScienceON API를 통해 국내외 특허정보를 검색합니다.
          </Alert>
          <TextField fullWidth label="Client ID" value={data.config?.client_id || ''} onChange={(e) => handleChange('client_id', e.target.value)} placeholder="ScienceON에서 발급받은 Client ID" sx={{ mb: 2 }} />
          <TextField fullWidth label="Auth Key (API Key)" type="password" value={data.config?.auth_key || ''} onChange={(e) => handleChange('auth_key', e.target.value)} placeholder="ScienceON에서 발급받은 인증키" sx={{ mb: 2 }} />
          <TextField fullWidth label="Hardware Key" value={data.config?.hardware_key || ''} onChange={(e) => handleChange('hardware_key', e.target.value)} placeholder="MAC 주소 (자동 감지됨)" sx={{ mb: 2 }} helperText="비워두면 자동으로 감지합니다" />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>특허 유형</InputLabel>
            <Select value={data.config?.patent_type || 'all'} label="특허 유형" onChange={(e) => handleChange('patent_type', e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="KR">국내 특허</MenuItem>
              <MenuItem value="US">미국 특허</MenuItem>
              <MenuItem value="JP">일본 특허</MenuItem>
              <MenuItem value="EP">유럽 특허</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.display_count ?? 10}</Typography>
            <Slider value={data.config?.display_count ?? 10} onChange={(_, value) => handleChange('display_count', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            Tip: API 신청: <a href="https://scienceon.kisti.re.kr/openApi/openApiInfo.do" target="_blank" style={{ color: '#a5b4fc' }}>scienceon.kisti.re.kr/openApi</a>
          </Alert>
        </>
      ),
      'kisti-reports': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📋 <b>KISTI 보고서 검색</b>: ScienceON API를 통해 연구보고서를 검색합니다.
          </Alert>
          <TextField fullWidth label="Client ID" value={data.config?.client_id || ''} onChange={(e) => handleChange('client_id', e.target.value)} placeholder="ScienceON에서 발급받은 Client ID" sx={{ mb: 2 }} />
          <TextField fullWidth label="Auth Key (API Key)" type="password" value={data.config?.auth_key || ''} onChange={(e) => handleChange('auth_key', e.target.value)} placeholder="ScienceON에서 발급받은 인증키" sx={{ mb: 2 }} />
          <TextField fullWidth label="Hardware Key" value={data.config?.hardware_key || ''} onChange={(e) => handleChange('hardware_key', e.target.value)} placeholder="MAC 주소 (자동 감지됨)" sx={{ mb: 2 }} helperText="비워두면 자동으로 감지합니다" />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>보고서 유형</InputLabel>
            <Select value={data.config?.report_type || 'all'} label="보고서 유형" onChange={(e) => handleChange('report_type', e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="research">연구보고서</MenuItem>
              <MenuItem value="tech">기술보고서</MenuItem>
              <MenuItem value="policy">정책보고서</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.display_count ?? 10}</Typography>
            <Slider value={data.config?.display_count ?? 10} onChange={(_, value) => handleChange('display_count', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            Tip: API 신청: <a href="https://scienceon.kisti.re.kr/openApi/openApiInfo.do" target="_blank" style={{ color: '#a5b4fc' }}>scienceon.kisti.re.kr/openApi</a>
          </Alert>
        </>
      ),
      'kisti-trends': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📈 <b>KISTI 동향 분석</b>: ScienceON API를 통해 과학기술 동향정보를 검색합니다.
          </Alert>
          <TextField fullWidth label="Client ID" value={data.config?.client_id || ''} onChange={(e) => handleChange('client_id', e.target.value)} placeholder="ScienceON에서 발급받은 Client ID" sx={{ mb: 2 }} />
          <TextField fullWidth label="Auth Key (API Key)" type="password" value={data.config?.auth_key || ''} onChange={(e) => handleChange('auth_key', e.target.value)} placeholder="ScienceON에서 발급받은 인증키" sx={{ mb: 2 }} />
          <TextField fullWidth label="Hardware Key" value={data.config?.hardware_key || ''} onChange={(e) => handleChange('hardware_key', e.target.value)} placeholder="MAC 주소 (자동 감지됨)" sx={{ mb: 2 }} helperText="비워두면 자동으로 감지합니다" />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <TextField fullWidth label="검색어" value={data.config?.query || ''} onChange={(e) => handleChange('query', e.target.value)} placeholder="검색할 키워드 (예: 인공지능, 건설기술)" sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>동향 분야</InputLabel>
            <Select value={data.config?.trend_field || 'all'} label="동향 분야" onChange={(e) => handleChange('trend_field', e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="IT">IT/SW</MenuItem>
              <MenuItem value="BT">바이오/의료</MenuItem>
              <MenuItem value="NT">나노/소재</MenuItem>
              <MenuItem value="ET">에너지/환경</MenuItem>
              <MenuItem value="CT">건설/교통</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.display_count ?? 10}</Typography>
            <Slider value={data.config?.display_count ?? 10} onChange={(_, value) => handleChange('display_count', value)} min={1} max={100} step={1} />
          </Box>
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            Tip: API 신청: <a href="https://scienceon.kisti.re.kr/openApi/openApiInfo.do" target="_blank" style={{ color: '#a5b4fc' }}>scienceon.kisti.re.kr/openApi</a>
          </Alert>
        </>
      ),
    }

    return apiConfigs[type || ''] || (
      <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
        외부 API 설정을 구성하세요.
      </Alert>
    )
  }

  // ========================================
  // 시각화 노드 설정
  // ========================================
  const renderVisualizationConfig = () => {
    const vizConfigs: Record<string, React.ReactNode> = {
      'viz-diff-viewer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📊 <b>비교 뷰어 사용법</b>: 두 텍스트를 비교하여 차이점을 표시합니다.
          </Alert>
          <TextField fullWidth multiline rows={4} label="원본 텍스트 (A)" value={data.config?.text_a || ''} onChange={(e) => handleChange('text_a', e.target.value)} placeholder="비교할 첫 번째 텍스트..." sx={{ mb: 2 }} />
          <TextField fullWidth multiline rows={4} label="비교 텍스트 (B)" value={data.config?.text_b || ''} onChange={(e) => handleChange('text_b', e.target.value)} placeholder="비교할 두 번째 텍스트..." sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>비교 방식</InputLabel>
            <Select value={data.config?.diff_mode || 'line'} label="비교 방식" onChange={(e) => handleChange('diff_mode', e.target.value)}>
              <MenuItem value="line">라인 단위</MenuItem>
              <MenuItem value="word">단어 단위</MenuItem>
              <MenuItem value="char">문자 단위</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel control={<Switch checked={data.config?.ignore_whitespace ?? false} onChange={(e) => handleChange('ignore_whitespace', e.target.checked)} />} label="공백 무시" sx={{ mb: 2 }} />
          <Alert severity="warning" sx={{ fontSize: '0.7rem' }}>
            Tip: 이전 노드에서 두 텍스트를 받으면 자동 비교됩니다. 직접 입력도 가능합니다.
          </Alert>
        </>
      ),
      'viz-flow-diagram': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            🔄 <b>플로우 다이어그램 사용법</b>: 프로세스나 데이터 흐름을 시각화합니다.
          </Alert>
          <TextField fullWidth multiline rows={6} label="노드 정의 (JSON 또는 Mermaid)" value={data.config?.diagram_source || ''} onChange={(e) => handleChange('diagram_source', e.target.value)}
            placeholder={`Mermaid 형식 예시:\ngraph TD\n  A[시작] --> B{조건}\n  B -->|Yes| C[처리1]\n  B -->|No| D[처리2]\n  C --> E[종료]\n  D --> E`}
            sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>다이어그램 형식</InputLabel>
            <Select value={data.config?.diagram_format || 'mermaid'} label="다이어그램 형식" onChange={(e) => handleChange('diagram_format', e.target.value)}>
              <MenuItem value="mermaid">Mermaid</MenuItem>
              <MenuItem value="json">JSON (nodes/edges)</MenuItem>
              <MenuItem value="auto">자동 감지</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>방향</InputLabel>
            <Select value={data.config?.direction || 'TD'} label="방향" onChange={(e) => handleChange('direction', e.target.value)}>
              <MenuItem value="TD">위→아래</MenuItem>
              <MenuItem value="LR">왼쪽→오른쪽</MenuItem>
              <MenuItem value="BT">아래→위</MenuItem>
              <MenuItem value="RL">오른쪽→왼쪽</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'viz-chart': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📈 <b>차트 생성 사용법</b>: 데이터를 차트로 시각화합니다.
          </Alert>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>차트 유형</InputLabel>
            <Select value={data.config?.chart_type || 'bar'} label="차트 유형" onChange={(e) => handleChange('chart_type', e.target.value)}>
              <MenuItem value="bar">막대 차트</MenuItem>
              <MenuItem value="line">꺾은선 차트</MenuItem>
              <MenuItem value="pie">파이 차트</MenuItem>
              <MenuItem value="doughnut">도넛 차트</MenuItem>
              <MenuItem value="radar">레이더 차트</MenuItem>
              <MenuItem value="scatter">산점도</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="X축 레이블" value={data.config?.x_label || ''} onChange={(e) => handleChange('x_label', e.target.value)} placeholder="예: 월" sx={{ mb: 2 }} />
          <TextField fullWidth label="Y축 레이블" value={data.config?.y_label || ''} onChange={(e) => handleChange('y_label', e.target.value)} placeholder="예: 매출(만원)" sx={{ mb: 2 }} />
          <TextField fullWidth label="데이터 경로" value={data.config?.data_path || ''} onChange={(e) => handleChange('data_path', e.target.value)} placeholder="예: results.data" sx={{ mb: 2 }} helperText="입력 JSON에서 차트 데이터 경로" />
        </>
      ),
      'viz-table-viewer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📋 <b>테이블 뷰어 사용법</b>: 배열/객체 데이터를 테이블로 표시합니다.
          </Alert>
          <TextField fullWidth label="데이터 경로" value={data.config?.data_path || ''} onChange={(e) => handleChange('data_path', e.target.value)} placeholder="예: data.items" sx={{ mb: 2 }} helperText="입력 JSON에서 테이블 데이터 경로" />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>페이지당 행 수: {data.config?.page_size ?? 10}</Typography>
            <Slider value={data.config?.page_size ?? 10} onChange={(_, value) => handleChange('page_size', value)} min={5} max={100} step={5} />
          </Box>
          <FormControlLabel control={<Switch checked={data.config?.sortable ?? true} onChange={(e) => handleChange('sortable', e.target.checked)} />} label="정렬 가능" sx={{ mb: 1 }} />
          <FormControlLabel control={<Switch checked={data.config?.searchable ?? false} onChange={(e) => handleChange('searchable', e.target.checked)} />} label="검색 가능" sx={{ mb: 2 }} />
        </>
      ),
      'viz-json-viewer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>JSON 뷰어 사용법</b>: JSON 데이터를 트리 구조로 탐색합니다.
          </Alert>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>기본 펼침 깊이: {data.config?.expand_depth ?? 2}</Typography>
            <Slider value={data.config?.expand_depth ?? 2} onChange={(_, value) => handleChange('expand_depth', value)} min={1} max={10} step={1} />
          </Box>
          <FormControlLabel control={<Switch checked={data.config?.copy_enabled ?? true} onChange={(e) => handleChange('copy_enabled', e.target.checked)} />} label="복사 버튼 표시" sx={{ mb: 2 }} />
        </>
      ),
      'viz-markdown-viewer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📝 <b>Markdown 뷰어 사용법</b>: Markdown 텍스트를 렌더링합니다.
          </Alert>
          <FormControlLabel control={<Switch checked={data.config?.syntax_highlight ?? true} onChange={(e) => handleChange('syntax_highlight', e.target.checked)} />} label="코드 구문 강조" sx={{ mb: 1 }} />
          <FormControlLabel control={<Switch checked={data.config?.table_of_contents ?? false} onChange={(e) => handleChange('table_of_contents', e.target.checked)} />} label="목차 표시" sx={{ mb: 2 }} />
        </>
      ),
      'viz-result-viewer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            👁 <b>결과 뷰어 사용법</b>: 워크플로우 실행 결과를 표시합니다.
          </Alert>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>표시 형식</InputLabel>
            <Select value={data.config?.display_format || 'auto'} label="표시 형식" onChange={(e) => handleChange('display_format', e.target.value)}>
              <MenuItem value="auto">자동 감지</MenuItem>
              <MenuItem value="text">텍스트</MenuItem>
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="markdown">Markdown</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
    }
    return vizConfigs[type || ''] || (
      <Alert severity="info" sx={{ fontSize: '0.75rem' }}>시각화 설정을 구성하세요.</Alert>
    )
  }

  // ========================================
  // 문서 파싱 노드 설정
  // ========================================
  const renderDocParserConfig = () => {
    const parserConfigs: Record<string, React.ReactNode> = {
      'doc-csv-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>CSV 파서 사용법</b>: CSV 파일을 읽어 구조화된 데이터로 변환합니다.
          </Alert>
          <TextField fullWidth label="파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\data\example.csv" sx={{ mb: 2 }} helperText="또는 이전 노드에서 CSV 텍스트를 받을 수 있습니다" />
          <TextField fullWidth label="구분자" value={data.config?.delimiter || ','} onChange={(e) => handleChange('delimiter', e.target.value)} placeholder="," sx={{ mb: 2 }} helperText="기본: 쉼표(,), TSV는 탭(\t)" />
          <FormControlLabel control={<Switch checked={data.config?.has_header ?? true} onChange={(e) => handleChange('has_header', e.target.checked)} />} label="첫 행이 헤더" sx={{ mb: 2 }} />
        </>
      ),
      'doc-json-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>JSON 파서 사용법</b>: JSON 파일을 파싱하고 특정 경로의 데이터를 추출합니다.
          </Alert>
          <TextField fullWidth label="파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\data\example.json" sx={{ mb: 2 }} />
          <TextField fullWidth label="JSON 경로 (선택)" value={data.config?.json_path || ''} onChange={(e) => handleChange('json_path', e.target.value)} placeholder="data.items[0].name" sx={{ mb: 2 }} helperText="특정 경로만 추출 (예: data.results)" />
        </>
      ),
      'doc-xml-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>XML 파서 사용법</b>: XML 파일을 파싱합니다.
          </Alert>
          <TextField fullWidth label="파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\data\example.xml" sx={{ mb: 2 }} />
          <TextField fullWidth label="XPath (선택)" value={data.config?.xpath || ''} onChange={(e) => handleChange('xpath', e.target.value)} placeholder="//item/name" sx={{ mb: 2 }} helperText="특정 요소만 추출" />
        </>
      ),
      'doc-pdf-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>PDF 파서</b>: PDF에서 텍스트를 추출합니다. (pdf-extract 라이브러리)
          </Alert>
          <TextField fullWidth label="PDF 파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\docs\document.pdf" sx={{ mb: 2 }} />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ pdf-extract 라이브러리로 텍스트 추출이 지원됩니다. OCR이 필요한 경우 aws-textract를 사용하세요.
          </Alert>
        </>
      ),
      'doc-hwp-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>HWP 파서</b>: 한글(HWP/HWPX) 문서에서 텍스트를 추출합니다.
          </Alert>
          <TextField fullWidth label="HWP 파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\docs\document.hwp" sx={{ mb: 2 }} />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ hwpers 라이브러리를 통해 HWP 5.0 형식 파싱이 지원됩니다.
          </Alert>
        </>
      ),
      'doc-word-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>Word 파서</b>: DOCX 문서에서 텍스트를 추출합니다.
          </Alert>
          <TextField fullWidth label="Word 파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\docs\document.docx" sx={{ mb: 2 }} />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ docx-rs 라이브러리로 DOCX 파싱이 지원됩니다.
          </Alert>
        </>
      ),
      'doc-excel-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>Excel 파서</b>: XLSX/XLS 스프레드시트에서 데이터를 추출합니다.
          </Alert>
          <TextField fullWidth label="Excel 파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\docs\data.xlsx" sx={{ mb: 2 }} />
          <TextField fullWidth label="시트 이름 (선택)" value={data.config?.sheet_name || ''} onChange={(e) => handleChange('sheet_name', e.target.value)} placeholder="Sheet1" sx={{ mb: 2 }} helperText="비워두면 첫 번째 시트" />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ calamine 라이브러리로 XLSX, XLS, ODS 파싱이 지원됩니다.
          </Alert>
        </>
      ),
      'doc-ppt-parser': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>PPT 파서</b>: PowerPoint에서 슬라이드 텍스트를 추출합니다.
          </Alert>
          <TextField fullWidth label="PPT 파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder="C:\docs\presentation.pptx" sx={{ mb: 2 }} />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ ppt-rs 라이브러리로 PPTX 파싱이 지원됩니다.
          </Alert>
        </>
      ),
    }
    // 기타 문서 파서들
    if (type?.startsWith('doc-') && !parserConfigs[type]) {
      const format = type.replace('doc-', '').replace('-parser', '').toUpperCase()
      return (
        <>
          <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
            {format} 파싱은 추가 라이브러리가 필요합니다.
          </Alert>
          <TextField fullWidth label="파일 경로" value={data.config?.file_path || ''} onChange={(e) => handleChange('file_path', e.target.value)} placeholder={`C:\\docs\\document.${format.toLowerCase()}`} sx={{ mb: 2 }} />
          <Alert severity="info" sx={{ fontSize: '0.7rem' }}>
            Tip: {format} 파일은 텍스트로 변환 후 local-file 노드를 사용하거나, AWS Textract를 활용하세요.
          </Alert>
        </>
      )
    }
    return parserConfigs[type || ''] || null
  }

  // ========================================
  // 내보내기 노드 설정 (템플릿 지원)
  // ========================================
  const renderExportConfig = () => {
    const format = type?.replace('export-', '').toUpperCase()

    // 공통 파일 경로 설정 UI
    const renderFilePath = (ext: string, required: boolean = true) => (
      <Box sx={{ mb: 2, p: 2, border: '2px solid', borderColor: required && !data.config?.output_path ? 'error.main' : 'primary.main', borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.05)' }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: required && !data.config?.output_path ? 'error.main' : 'primary.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {required ? '* ' : ''}저장 경로 (필수)
        </Typography>
        <TextField
          fullWidth
          value={data.config?.output_path || ''}
          onChange={(e) => handleChange('output_path', e.target.value)}
          placeholder={`C:\\output\\result.${ext}`}
          size="small"
          error={required && !data.config?.output_path}
          helperText={!data.config?.output_path ? `${ext.toUpperCase()} 파일이 저장될 전체 경로를 입력하세요` : ''}
          InputProps={{ sx: { fontFamily: 'monospace', bgcolor: 'background.paper' } }}
        />
      </Box>
    )

    const exportConfigs: Record<string, React.ReactNode> = {
      'export-csv': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>CSV 내보내기</b>: 데이터를 CSV 파일로 저장합니다.
          </Alert>
          {renderFilePath('csv', true)}
          <TextField fullWidth label="구분자" value={data.config?.delimiter || ','} onChange={(e) => handleChange('delimiter', e.target.value)} size="small" sx={{ mb: 2 }} />
        </>
      ),
      'export-json': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>JSON 내보내기</b>: 데이터를 JSON 파일로 저장합니다.
          </Alert>
          {renderFilePath('json', true)}
          <FormControlLabel control={<Switch checked={data.config?.pretty ?? true} onChange={(e) => handleChange('pretty', e.target.checked)} />} label="들여쓰기 적용" sx={{ mb: 2 }} />
        </>
      ),
      'export-markdown': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>Markdown 내보내기</b>: 템플릿 기반 Markdown 문서를 생성합니다.
          </Alert>
          {renderFilePath('md', true)}
          <TextField fullWidth label="문서 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="Document Title" />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel size="small">템플릿</InputLabel>
            <Select size="small" value={data.config?.template || 'default'} label="템플릿" onChange={(e) => handleChange('template', e.target.value)}>
              <MenuItem value="default">기본 (제목 + 내용)</MenuItem>
              <MenuItem value="report">보고서 (헤더/푸터 포함)</MenuItem>
              <MenuItem value="technical">기술 문서</MenuItem>
              <MenuItem value="meeting">회의록</MenuItem>
              <MenuItem value="api_doc">API 문서</MenuItem>
              <MenuItem value="custom">사용자 정의 템플릿</MenuItem>
            </Select>
          </FormControl>
          {data.config?.template === 'custom' && (
            <TextField fullWidth multiline rows={6} label="사용자 정의 템플릿" value={data.config?.custom_template || ''} onChange={(e) => handleChange('custom_template', e.target.value)} placeholder={'# {{title}}\n\n{{content}}\n\n---\n생성일: {{date}}'} sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} helperText="변수: {{title}}, {{content}}, {{date}}, {{datetime}}" />
          )}
        </>
      ),
      'export-html': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>HTML 내보내기</b>: 템플릿 기반 HTML 페이지를 생성합니다.
          </Alert>
          {renderFilePath('html', true)}
          <TextField fullWidth label="페이지 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="Page Title" />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel size="small">템플릿</InputLabel>
            <Select size="small" value={data.config?.template || 'default'} label="템플릿" onChange={(e) => handleChange('template', e.target.value)}>
              <MenuItem value="default">기본 (심플)</MenuItem>
              <MenuItem value="dashboard">대시보드 (다크 테마)</MenuItem>
              <MenuItem value="report">보고서 (인쇄용)</MenuItem>
              <MenuItem value="flowchart">플로우차트 (Mermaid)</MenuItem>
              <MenuItem value="table">데이터 테이블</MenuItem>
              <MenuItem value="custom">사용자 정의 템플릿</MenuItem>
            </Select>
          </FormControl>
          {data.config?.template === 'custom' && (
            <TextField fullWidth multiline rows={8} label="사용자 정의 HTML 템플릿" value={data.config?.custom_template || ''} onChange={(e) => handleChange('custom_template', e.target.value)} placeholder={'<!DOCTYPE html>\n<html>\n<head><title>{{title}}</title></head>\n<body>\n{{content}}\n</body>\n</html>'} sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }} helperText="변수: {{title}}, {{content}}, {{date}}, {{data}}" />
          )}
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            템플릿 종류:<br/>
            - <b>대시보드</b>: 어두운 테마, 카드 레이아웃<br/>
            - <b>플로우차트</b>: Mermaid.js 다이어그램 지원<br/>
            - <b>데이터 테이블</b>: JSON 배열을 테이블로 변환
          </Alert>
        </>
      ),
      'export-pdf': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>PDF 내보내기</b>: 텍스트를 PDF 파일로 저장합니다.
          </Alert>
          {renderFilePath('pdf', true)}
          <TextField fullWidth label="문서 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="Document Title" helperText="PDF 메타데이터에 포함됩니다" />
          <Alert severity="warning" sx={{ fontSize: '0.7rem' }}>
            내장 폰트 사용으로 한글은 제한적으로 지원됩니다.
          </Alert>
        </>
      ),
      'export-word': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>Word 내보내기</b>: 텍스트를 DOCX 파일로 저장합니다.
          </Alert>
          {renderFilePath('docx', true)}
          <TextField fullWidth label="문서 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="Document Title" />
        </>
      ),
      'export-excel': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>Excel 내보내기</b>: 데이터를 XLSX 파일로 저장합니다.
          </Alert>
          {renderFilePath('xlsx', true)}
          <TextField fullWidth label="시트 이름" value={data.config?.sheet_name || 'Sheet1'} onChange={(e) => handleChange('sheet_name', e.target.value)} size="small" sx={{ mb: 2 }} />
        </>
      ),
      'export-ppt': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>PPT 내보내기</b>: 텍스트를 PowerPoint 파일로 저장합니다.
          </Alert>
          {renderFilePath('pptx', true)}
          <TextField fullWidth label="프레젠테이션 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="Presentation Title" helperText="각 문단(빈 줄로 구분)이 슬라이드가 됩니다" />
        </>
      ),
      'export-hwp': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>HWP 내보내기</b>: 텍스트를 한글(HWP) 문서로 저장합니다.
          </Alert>
          {renderFilePath('hwp', true)}
          <TextField fullWidth label="문서 제목" value={data.config?.title || ''} onChange={(e) => handleChange('title', e.target.value)} size="small" sx={{ mb: 2 }} placeholder="문서 제목" helperText="문서 상단에 표시될 제목" />
          <Alert severity="success" sx={{ fontSize: '0.7rem' }}>
            ✓ hwpers 라이브러리를 통해 HWP 5.0 형식으로 저장됩니다.
          </Alert>
        </>
      ),
    }
    return exportConfigs[type || ''] || (
      <>
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
          {format} 내보내기는 현재 지원되지 않습니다.
        </Alert>
        {renderFilePath(format?.toLowerCase() || 'txt', false)}
      </>
    )
  }

  // ========================================
  // 액션 노드 설정
  // ========================================
  const renderActionConfig = () => {
    const actionConfigs: Record<string, React.ReactNode> = {
      'shell-command': (
        <>
          <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>주의</b>: 셸 명령어는 시스템에 직접 실행됩니다. 신뢰할 수 있는 명령어만 사용하세요.
          </Alert>
          <TextField fullWidth multiline rows={3} label="실행할 명령어" value={data.config?.command || ''} onChange={(e) => handleChange('command', e.target.value)} placeholder="예: dir, ls -la, python script.py" sx={{ mb: 2 }} InputProps={{ sx: { fontFamily: 'monospace' } }} />
          <TextField fullWidth label="작업 디렉토리" value={data.config?.working_dir || ''} onChange={(e) => handleChange('working_dir', e.target.value)} placeholder="C:\workspace" sx={{ mb: 2 }} helperText="비워두면 현재 디렉토리" />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>타임아웃 (초): {data.config?.timeout_secs ?? 30}</Typography>
            <Slider value={data.config?.timeout_secs ?? 30} onChange={(_, value) => handleChange('timeout_secs', value)} min={5} max={300} step={5} />
          </Box>
        </>
      ),
      'notification': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            🔔 <b>알림</b>: 메시지를 표시합니다.
          </Alert>
          <TextField fullWidth label="제목" value={data.config?.title || '알림'} onChange={(e) => handleChange('title', e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth multiline rows={3} label="메시지" value={data.config?.message || ''} onChange={(e) => handleChange('message', e.target.value)} placeholder="알림 내용..." sx={{ mb: 2 }} helperText="비워두면 이전 노드의 출력이 메시지로 사용됩니다" />
        </>
      ),
      'webhook': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            🌐 <b>Webhook</b>: 외부 URL로 데이터를 전송합니다.
          </Alert>
          <TextField fullWidth label="Webhook URL" value={data.config?.webhook_url || ''} onChange={(e) => handleChange('webhook_url', e.target.value)} placeholder="https://hooks.slack.com/..." sx={{ mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>HTTP 메서드</InputLabel>
            <Select value={data.config?.method || 'POST'} label="HTTP 메서드" onChange={(e) => handleChange('method', e.target.value)}>
              <MenuItem value="POST">POST</MenuItem>
              <MenuItem value="PUT">PUT</MenuItem>
              <MenuItem value="PATCH">PATCH</MenuItem>
            </Select>
          </FormControl>
        </>
      ),
      'timer': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            <b>타이머</b>: 일정 시간 후 또는 주기적으로 실행합니다.
          </Alert>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="grey.400" gutterBottom>간격 (밀리초): {data.config?.interval_ms ?? 60000}</Typography>
            <Slider value={data.config?.interval_ms ?? 60000} onChange={(_, value) => handleChange('interval_ms', value)} min={1000} max={3600000} step={1000} />
          </Box>
          <Typography variant="caption" color="grey.500">= {Math.round((data.config?.interval_ms ?? 60000) / 1000)}초</Typography>
        </>
      ),
      'scheduler': (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📅 <b>스케줄러</b>: 정해진 시간에 실행합니다.
          </Alert>
          <TextField fullWidth label="Cron 표현식" value={data.config?.schedule || ''} onChange={(e) => handleChange('schedule', e.target.value)} placeholder="0 9 * * 1-5 (평일 오전 9시)" sx={{ mb: 2 }} helperText="분 시 일 월 요일" />
        </>
      ),
    }
    return actionConfigs[type || ''] || null
  }

  // ========================================
  // KB/벡터DB 노드 설정
  // ========================================
  const renderKBVectorConfig = () => {
    if (type?.startsWith('kb-')) {
      const operation = type.replace('kb-', '')
      return (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            📚 <b>Knowledge Base {operation}</b>: AWS Bedrock Knowledge Base와 연동합니다.
          </Alert>
          <TextField fullWidth label="Knowledge Base ID" value={data.config?.knowledge_base_id || ''} onChange={(e) => handleChange('knowledge_base_id', e.target.value)} placeholder="XXXXXXXXXX" sx={{ mb: 2 }} />
          {operation === 'query' && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="grey.400" gutterBottom>검색 결과 수: {data.config?.top_k ?? 5}</Typography>
              <Slider value={data.config?.top_k ?? 5} onChange={(_, value) => handleChange('top_k', value)} min={1} max={20} step={1} />
            </Box>
          )}
          {operation === 'ingest' && (
            <TextField fullWidth label="S3 데이터 소스 URI" value={data.config?.s3_uri || ''} onChange={(e) => handleChange('s3_uri', e.target.value)} placeholder="s3://bucket/documents/" sx={{ mb: 2 }} />
          )}
        </>
      )
    }
    if (type?.startsWith('vector-') && type !== 'vector-search') {
      const dbType = type.replace('vector-', '').toUpperCase()
      return (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            🔢 <b>{dbType} 벡터 DB</b>: 벡터 데이터베이스와 연동합니다.
          </Alert>
          <TextField fullWidth label="인덱스 이름" value={data.config?.index_name || ''} onChange={(e) => handleChange('index_name', e.target.value)} placeholder="my-index" sx={{ mb: 2 }} />
          {dbType === 'PINECONE' && (
            <>
              <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} sx={{ mb: 2 }} />
              <TextField fullWidth label="Environment" value={data.config?.environment || ''} onChange={(e) => handleChange('environment', e.target.value)} placeholder="us-west1-gcp" sx={{ mb: 2 }} />
            </>
          )}
          {dbType === 'OPENSEARCH' && (
            <TextField fullWidth label="엔드포인트 URL" value={data.config?.endpoint || ''} onChange={(e) => handleChange('endpoint', e.target.value)} placeholder="https://xxx.aos.region.on.aws" sx={{ mb: 2 }} />
          )}
        </>
      )
    }
    return null
  }

  // ========================================
  // 이미지 생성 노드 설정
  // ========================================
  const renderImageGenConfig = () => {
    if (type === 'img-titan-gen') {
      return (
        <>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            🎨 <b>Titan Image Generator</b>: AWS Bedrock으로 이미지를 생성합니다.
          </Alert>
          <TextField fullWidth multiline rows={3} label="이미지 프롬프트" value={data.config?.prompt || ''} onChange={(e) => handleChange('prompt', e.target.value)} placeholder="A beautiful sunset over mountains..." sx={{ mb: 2 }} helperText="또는 이전 노드에서 프롬프트를 받습니다" />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel>너비</InputLabel>
              <Select value={data.config?.width || 1024} label="너비" onChange={(e) => handleChange('width', e.target.value)}>
                <MenuItem value={512}>512</MenuItem>
                <MenuItem value={768}>768</MenuItem>
                <MenuItem value={1024}>1024</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>높이</InputLabel>
              <Select value={data.config?.height || 1024} label="높이" onChange={(e) => handleChange('height', e.target.value)}>
                <MenuItem value={512}>512</MenuItem>
                <MenuItem value={768}>768</MenuItem>
                <MenuItem value={1024}>1024</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </>
      )
    }
    const model = type?.replace('img-', '').toUpperCase()
    return (
      <>
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.75rem' }}>
          {model} 모델은 해당 API 키 설정이 필요합니다.
        </Alert>
        <TextField fullWidth label="API 키" type="password" value={data.config?.api_key || ''} onChange={(e) => handleChange('api_key', e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth multiline rows={3} label="프롬프트" value={data.config?.prompt || ''} onChange={(e) => handleChange('prompt', e.target.value)} sx={{ mb: 2 }} />
      </>
    )
  }

  // 노드 타입별 설정 렌더링
  const renderConfig = () => {
    // 레거시 하드코딩 매칭 (기존 노드)
    if (type?.startsWith('model-')) return renderModelConfig()
    if (type?.includes('agent')) return renderAgentConfig()
    if (type?.startsWith('bedrock-')) return renderBedrockPlatformConfig()
    if (type?.startsWith('aws-')) return renderAWSServiceConfig()
    if (type?.startsWith('api-') || type?.startsWith('kisti-')) return renderAPIConfig()
    if (type?.startsWith('viz-')) return renderVisualizationConfig()
    if (type?.startsWith('doc-')) return renderDocParserConfig()
    if (type?.startsWith('export-')) return renderExportConfig()
    if (type?.startsWith('kb-') || (type?.startsWith('vector-') && type !== 'vector-search')) return renderKBVectorConfig()
    if (type?.startsWith('img-')) return renderImageGenConfig()
    if (['shell-command', 'notification', 'webhook', 'timer', 'scheduler', 'interval', 'alarm'].includes(type || '')) return renderActionConfig()
    if (['knowledge-base', 'document-loader', 'text-splitter', 'embedder', 'vector-search', 'vector-store', 'rag-retriever'].includes(type || '')) return renderDataConfig()
    if (['input', 'output', 'local-folder', 'local-file'].includes(type || '')) return renderIOConfig()
    if (['prompt-template', 'conditional', 'loop', 'merge'].includes(type || '')) return renderControlConfig()

    // Registry 기반 자동 렌더링 (새 노드: CLI, Script, HTTP, SubWorkflow 등)
    const definition = NodeRegistry.get(type || '')
    if (definition && definition.configSchema.length > 0) {
      return (
        <ConfigSchemaRenderer
          fields={definition.configSchema}
          values={data.config || {}}
          onChange={handleChange}
        />
      )
    }

    return null
  }

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1, background: `${data.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 2 }}>
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', background: data.color }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" color="white">{data.label}</Typography>
          <Typography variant="caption" color="grey.500">{type}</Typography>
        </Box>
        <Tooltip title={data.enabled === false ? '노드 활성화' : '노드 비활성화'}>
          <IconButton
            size="small"
            onClick={handleToggleEnabled}
            sx={{
              color: data.enabled === false ? 'grey.600' : 'success.main',
              mr: 0.5
            }}
          >
            {data.enabled === false ? <PowerOffIcon /> : <PowerIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={isBreakpoint ? '중단점 해제' : '중단점 설정 (이 노드에서 실행 멈춤)'}>
          <IconButton
            size="small"
            onClick={handleToggleBreakpoint}
            sx={{
              color: isBreakpoint ? 'warning.main' : 'grey.600',
              mr: 0.5,
              ...(isBreakpoint && {
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }),
            }}
          >
            <StopCircleIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="노드 삭제">
          <IconButton size="small" onClick={handleDelete} sx={{ color: 'error.main' }}><DeleteIcon /></IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Usage Guide */}
      {renderUsageGuide()}

      {/* Node Label */}
      <TextField fullWidth label="노드 이름" value={data.label || ''} onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })} sx={{ mb: 2 }} />

      <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Type-specific config */}
      <Typography variant="subtitle2" color="grey.400" sx={{ mb: 2 }}>설정</Typography>
      {renderConfig()}

      <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {/* 테스트 버튼 - 실제 테스트 가능한 노드에서만 표시 */}
        {(type?.startsWith('model-') || type?.includes('agent') || type?.startsWith('aws-') || type?.startsWith('bedrock-')) && (
          <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={handleTest} disabled={testing} sx={{ flex: 1 }}>{testing ? '테스트 중...' : 'API 테스트'}</Button>
        )}
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleDuplicate}>복제</Button>
        {/* 지식베이스 저장 버튼 - 관련 노드에서만 표시 */}
        {(type?.includes('vector') || type?.includes('rag') || type?.includes('embed') || type?.includes('knowledge') || type?.includes('kisti') || type?.includes('dynamic_kb')) && (
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={() => saveKnowledgeBaseLocal(selectedNode.id)}
            sx={{
              borderColor: 'rgba(245, 158, 11, 0.5)',
              color: '#f59e0b',
              '&:hover': {
                borderColor: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.1)',
              },
            }}
          >
            KB 저장
          </Button>
        )}
      </Box>

      {/* Test Result */}
      {testResult && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 1, background: testResult.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{testResult}</Typography>
        </Box>
      )}

      {/* Node Info */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="caption" color="grey.600">ID: {selectedNode.id}</Typography>
        <Typography variant="caption" color="grey.600" sx={{ display: 'block' }}>Tip: DEL 키로 노드 삭제</Typography>
      </Box>
    </Box>
  )
}

// 메모이제이션으로 불필요한 리렌더링 방지
const PropertyPanel = memo(PropertyPanelContent)
export default PropertyPanel
