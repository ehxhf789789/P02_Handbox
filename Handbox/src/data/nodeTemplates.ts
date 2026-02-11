import { NodeTemplate } from '../stores/workflowStore'

export const NODE_TEMPLATES: NodeTemplate[] = [
  // ========================================
  // LLM 기초 템플릿
  // ========================================
  {
    id: 'basic-llm-chain',
    name: 'LLM 기본 체인',
    description: '입력 → 프롬프트 → LLM → 출력',
    icon: 'Link',
    category: 'LLM 기초',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '입력', color: '#22c55e', description: '텍스트 입력', config: { inputType: 'text' } },
      },
      {
        type: 'prompt-template',
        position: { x: 200, y: 0 },
        data: { label: '프롬프트', color: '#06b6d4', description: '입력 프롬프트', config: { template: '{{input}}' } },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 400, y: 0 },
        data: { label: 'LLM', color: '#6366f1', description: 'AI 모델', config: { temperature: 0.7, max_tokens: 2048 } },
      },
      {
        type: 'output',
        position: { x: 600, y: 0 },
        data: { label: '출력', color: '#ef4444', description: '결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'few-shot-template',
    name: 'Few-shot 프롬프트',
    description: '예시 기반 프롬프트',
    icon: 'Edit',
    category: 'LLM 기초',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '입력', color: '#22c55e', description: '분류할 텍스트', config: { inputType: 'text' } },
      },
      {
        type: 'prompt-template',
        position: { x: 200, y: 0 },
        data: {
          label: 'Few-shot 프롬프트',
          color: '#06b6d4',
          description: '예시 포함 프롬프트',
          config: {
            template: `다음 예시를 참고하여 답변하세요:

예시 1:
입력: "오늘 날씨가 좋다"
출력: 긍정

예시 2:
입력: "비가 와서 우울하다"
출력: 부정

이제 다음 입력에 대해 답변하세요:
입력: "{{input}}"
출력:`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 450, y: 0 },
        data: { label: 'LLM', color: '#6366f1', description: 'AI 분석', config: { temperature: 0.3 } },
      },
      {
        type: 'output',
        position: { x: 650, y: 0 },
        data: { label: '결과', color: '#ef4444', description: '분류 결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'chain-of-thought',
    name: 'Chain-of-Thought',
    description: '단계별 추론 체인',
    icon: 'Psychology',
    category: 'LLM 기초',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '문제', color: '#22c55e', description: '추론할 문제', config: { inputType: 'text' } },
      },
      {
        type: 'prompt-template',
        position: { x: 200, y: 0 },
        data: {
          label: 'CoT 프롬프트',
          color: '#06b6d4',
          description: '단계별 사고',
          config: {
            template: `문제: {{input}}

단계별로 생각해봅시다:
1단계: 문제를 이해합니다
2단계: 필요한 정보를 파악합니다
3단계: 논리적으로 추론합니다
4단계: 결론을 도출합니다

각 단계를 상세히 설명하고 최종 답을 제시하세요.`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 450, y: 0 },
        data: { label: 'LLM 추론', color: '#6366f1', description: 'AI 추론', config: { temperature: 0.2, max_tokens: 4096 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 650, y: 0 },
        data: { label: '추론 결과', color: '#6366f1', description: '단계별 결과 표시', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },

  // ========================================
  // 문서 분석 템플릿
  // ========================================
  {
    id: 'pdf-analysis',
    name: 'PDF 문서 분석',
    description: 'PDF 업로드 → 텍스트 추출 → AI 분석',
    icon: 'Article',
    category: '문서 분석',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: 'PDF 파일', color: '#f59e0b', description: 'PDF 선택', config: { file_filter: '*.pdf' } },
      },
      {
        type: 'doc-pdf-parser',
        position: { x: 200, y: 0 },
        data: { label: 'PDF 파서', color: '#ef4444', description: '텍스트/표 추출', config: {} },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: '분석 프롬프트',
          color: '#06b6d4',
          description: '문서 분석 지시',
          config: {
            template: `다음 PDF 문서 내용을 분석하세요:

{{input}}

1. 문서의 핵심 내용을 요약하세요
2. 주요 키워드를 추출하세요
3. 문서의 구조를 설명하세요`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'AI 분석', color: '#6366f1', description: '문서 분석', config: { max_tokens: 4096 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 800, y: 0 },
        data: { label: '분석 결과', color: '#6366f1', description: '결과 표시', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },
  {
    id: 'hwp-analysis',
    name: '한글(HWP) 문서 분석',
    description: 'HWP/HWPX → 텍스트 추출 → AI 분석',
    icon: 'Description',
    category: '문서 분석',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: 'HWP 파일', color: '#f59e0b', description: '한글 문서 선택', config: { file_filter: '*.hwp;*.hwpx' } },
      },
      {
        type: 'doc-hwp-parser',
        position: { x: 200, y: 0 },
        data: { label: 'HWP 파서', color: '#3b82f6', description: '한글 텍스트 추출', config: {} },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 400, y: 0 },
        data: { label: 'AI 분석', color: '#6366f1', description: '문서 분석', config: { system_prompt: '한국어 문서를 분석하는 전문가입니다.' } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 600, y: 0 },
        data: { label: '분석 결과', color: '#6366f1', description: '결과 표시', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'excel-data-analysis',
    name: 'Excel 데이터 분석',
    description: 'Excel → 데이터 추출 → AI 분석 → 차트',
    icon: 'TableChart',
    category: '문서 분석',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: 'Excel 파일', color: '#f59e0b', description: '엑셀 선택', config: { file_filter: '*.xlsx;*.xls' } },
      },
      {
        type: 'doc-excel-parser',
        position: { x: 200, y: 0 },
        data: { label: 'Excel 파서', color: '#22c55e', description: '데이터 추출', config: {} },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: '분석 프롬프트',
          color: '#06b6d4',
          description: '데이터 분석 지시',
          config: {
            template: `다음 Excel 데이터를 분석하세요:

{{input}}

1. 데이터 요약 통계를 계산하세요
2. 주요 인사이트를 도출하세요
3. 개선 제안을 제시하세요`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'AI 분석', color: '#6366f1', description: '데이터 분석', config: {} },
      },
      {
        type: 'viz-chart',
        position: { x: 800, y: 0 },
        data: { label: '차트', color: '#f59e0b', description: '시각화', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },
  {
    id: 'multi-doc-analysis',
    name: '다중 문서 분석',
    description: '폴더 → 여러 문서 → AI 종합 분석',
    icon: 'FolderOpen',
    category: '문서 분석',
    nodes: [
      {
        type: 'local-folder',
        position: { x: 0, y: 0 },
        data: { label: '문서 폴더', color: '#f59e0b', description: '폴더 선택', config: { file_filter: '*.pdf;*.docx;*.hwp', read_content: true } },
      },
      {
        type: 'text-splitter',
        position: { x: 200, y: 0 },
        data: { label: '청킹', color: '#c084fc', description: '문서 분할', config: { chunk_size: 2000, overlap: 200 } },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: '종합 분석',
          color: '#06b6d4',
          description: '다중 문서 분석',
          config: {
            template: `다음 여러 문서의 내용을 종합 분석하세요:

{{input}}

1. 각 문서의 핵심 내용
2. 문서들 간의 공통점과 차이점
3. 종합 결론`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'AI 종합', color: '#6366f1', description: '종합 분석', config: { max_tokens: 8192 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 800, y: 0 },
        data: { label: '결과', color: '#6366f1', description: '종합 결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },

  // ========================================
  // RAG / 지식 기반 템플릿
  // ========================================
  {
    id: 'document-to-kb',
    name: '문서 → 지식베이스 변환',
    description: '문서 업로드 → 청킹 → 임베딩 → 벡터DB 저장',
    icon: 'Storage',
    category: 'RAG/지식',
    nodes: [
      {
        type: 'local-folder',
        position: { x: 0, y: 0 },
        data: { label: '문서 폴더', color: '#f59e0b', description: '소스 문서', config: { file_filter: '*.pdf;*.docx;*.txt', read_content: true } },
      },
      {
        type: 'text-splitter',
        position: { x: 200, y: 0 },
        data: { label: '텍스트 분할', color: '#c084fc', description: '청킹', config: { chunk_size: 1000, overlap: 200 } },
      },
      {
        type: 'embedder',
        position: { x: 400, y: 0 },
        data: { label: '임베딩', color: '#d8b4fe', description: '벡터화', config: { model: 'titan-embed-v2' } },
      },
      {
        type: 'vector-opensearch',
        position: { x: 600, y: 0 },
        data: { label: 'OpenSearch', color: '#ff9900', description: '벡터 저장', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'basic-rag',
    name: 'RAG 기본',
    description: '질문 → 검색 → 컨텍스트 → LLM 응답',
    icon: 'Search',
    category: 'RAG/지식',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '질문', color: '#22c55e', description: '사용자 질문', config: { inputType: 'text' } },
      },
      {
        type: 'kb-query',
        position: { x: 200, y: 0 },
        data: { label: 'KB 검색', color: '#a855f7', description: '관련 문서 검색', config: { top_k: 5 } },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: 'RAG 프롬프트',
          color: '#06b6d4',
          description: '컨텍스트 주입',
          config: { template: '참고 자료:\n{{context}}\n\n질문: {{query}}\n\n위 자료를 바탕으로 정확하게 답변하세요. 자료에 없는 내용은 "확인되지 않음"이라고 답하세요.' },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'LLM', color: '#6366f1', description: 'AI 응답', config: { temperature: 0.3 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 800, y: 0 },
        data: { label: '응답', color: '#6366f1', description: '답변 표시', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },
  {
    id: 'hybrid-search-rag',
    name: '하이브리드 검색 RAG',
    description: '키워드 + 시맨틱 검색 결합',
    icon: 'JoinInner',
    category: 'RAG/지식',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 50 },
        data: { label: '질문', color: '#22c55e', description: '검색 쿼리', config: { inputType: 'text' } },
      },
      {
        type: 'vector-opensearch',
        position: { x: 200, y: 0 },
        data: { label: '키워드 검색', color: '#3b82f6', description: 'BM25 검색', config: {} },
      },
      {
        type: 'vector-search',
        position: { x: 200, y: 100 },
        data: { label: '벡터 검색', color: '#e9d5ff', description: 'k-NN 검색', config: { top_k: 5 } },
      },
      {
        type: 'merge',
        position: { x: 400, y: 50 },
        data: { label: '결과 병합', color: '#c084fc', description: '하이브리드 결합', config: {} },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 50 },
        data: { label: 'LLM', color: '#6366f1', description: 'AI 응답', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 0, targetIndex: 2 }, { sourceIndex: 1, targetIndex: 3 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },

  // ========================================
  // 전문가 에이전트 템플릿
  // ========================================
  {
    id: 'research-expert',
    name: '연구 분석 전문가',
    description: '논문/특허 검색 → 분석 → 리포트 생성',
    icon: 'School',
    category: '전문가 에이전트',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '연구 주제', color: '#22c55e', description: '검색할 주제', config: { inputType: 'text' } },
      },
      {
        type: 'kisti-articles',
        position: { x: 200, y: -50 },
        data: { label: 'KISTI 논문', color: '#7c3aed', description: '논문 검색', config: {} },
      },
      {
        type: 'kisti-patents',
        position: { x: 200, y: 50 },
        data: { label: 'KISTI 특허', color: '#2563eb', description: '특허 검색', config: {} },
      },
      {
        type: 'merge',
        position: { x: 400, y: 0 },
        data: { label: '자료 병합', color: '#c084fc', description: '검색 결과 통합', config: {} },
      },
      {
        type: 'custom-agent',
        position: { x: 600, y: 0 },
        data: {
          label: '연구 분석 에이전트',
          color: '#6366f1',
          description: '연구 전문가 AI',
          config: {
            system_prompt: '당신은 연구 분석 전문가입니다. 논문과 특허를 분석하여 연구 동향, 핵심 기술, 연구 공백을 파악합니다.',
          },
        },
      },
      {
        type: 'export-word',
        position: { x: 800, y: 0 },
        data: { label: 'Word 리포트', color: '#2563eb', description: '연구 리포트 생성', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 0, targetIndex: 2 }, { sourceIndex: 1, targetIndex: 3 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }, { sourceIndex: 4, targetIndex: 5 }],
  },
  {
    id: 'legal-expert',
    name: '법률 문서 전문가',
    description: '계약서/법률문서 분석 → 위험 식별',
    icon: 'Gavel',
    category: '전문가 에이전트',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: '법률 문서', color: '#f59e0b', description: '계약서/법률문서', config: { file_filter: '*.pdf;*.docx;*.hwp' } },
      },
      {
        type: 'doc-pdf-parser',
        position: { x: 200, y: 0 },
        data: { label: '문서 파싱', color: '#ef4444', description: '텍스트 추출', config: {} },
      },
      {
        type: 'custom-agent',
        position: { x: 400, y: 0 },
        data: {
          label: '법률 분석 에이전트',
          color: '#6366f1',
          description: '법률 전문가 AI',
          config: {
            system_prompt: `당신은 법률 문서 분석 전문가입니다. 다음을 수행하세요:
1. 문서 유형 식별 (계약서, 약관, 동의서 등)
2. 핵심 조항 요약
3. 불리한 조항/위험 요소 식별
4. 누락된 중요 조항 확인
5. 개선 제안`,
          },
        },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 600, y: 0 },
        data: { label: '분석 결과', color: '#6366f1', description: '위험 분석 결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'financial-expert',
    name: '재무 분석 전문가',
    description: '재무제표 분석 → 투자 인사이트',
    icon: 'TrendingUp',
    category: '전문가 에이전트',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: '재무 데이터', color: '#f59e0b', description: 'Excel/PDF', config: { file_filter: '*.xlsx;*.pdf' } },
      },
      {
        type: 'doc-excel-parser',
        position: { x: 200, y: 0 },
        data: { label: '데이터 추출', color: '#22c55e', description: '재무 데이터 파싱', config: {} },
      },
      {
        type: 'custom-agent',
        position: { x: 400, y: 0 },
        data: {
          label: '재무 분석 에이전트',
          color: '#6366f1',
          description: '재무 전문가 AI',
          config: {
            system_prompt: `당신은 재무 분석 전문가입니다. 다음을 수행하세요:
1. 재무 비율 분석 (ROE, ROA, 부채비율 등)
2. 손익계산서 트렌드 분석
3. 현금흐름 분석
4. 경쟁사 대비 포지셔닝
5. 투자 의견 및 목표가 제시`,
          },
        },
      },
      {
        type: 'viz-chart',
        position: { x: 600, y: 0 },
        data: { label: '재무 차트', color: '#f59e0b', description: '시각화', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }],
  },

  // ========================================
  // 리포트 생성 템플릿
  // ========================================
  {
    id: 'auto-report-word',
    name: 'Word 리포트 자동 생성',
    description: '데이터 분석 → Word 보고서',
    icon: 'TextSnippet',
    category: '리포트 생성',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '보고서 주제', color: '#22c55e', description: '보고서 내용', config: { inputType: 'text' } },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 200, y: 0 },
        data: {
          label: 'AI 작성',
          color: '#6366f1',
          description: '보고서 생성',
          config: {
            system_prompt: '당신은 전문 보고서 작성자입니다. 구조화된 형식으로 상세한 보고서를 작성합니다. 목차, 서론, 본론, 결론을 포함하세요.',
          },
        },
      },
      {
        type: 'export-word',
        position: { x: 400, y: 0 },
        data: { label: 'Word 저장', color: '#2563eb', description: 'DOCX 생성', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }],
  },
  {
    id: 'auto-report-ppt',
    name: 'PPT 발표자료 자동 생성',
    description: '내용 분석 → 슬라이드 생성',
    icon: 'Slideshow',
    category: '리포트 생성',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '발표 주제', color: '#22c55e', description: '발표 내용', config: { inputType: 'text' } },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 200, y: 0 },
        data: {
          label: 'AI 구성',
          color: '#6366f1',
          description: '슬라이드 구성',
          config: {
            system_prompt: '당신은 프레젠테이션 전문가입니다. 각 슬라이드의 제목, 핵심 포인트(3-5개), 발표 노트를 구조화하여 작성합니다.',
          },
        },
      },
      {
        type: 'export-ppt',
        position: { x: 400, y: 0 },
        data: { label: 'PPT 저장', color: '#f97316', description: 'PPTX 생성', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }],
  },
  {
    id: 'data-to-excel',
    name: '데이터 → Excel 리포트',
    description: 'JSON/CSV → 가공 → Excel',
    icon: 'BarChart',
    category: '리포트 생성',
    nodes: [
      {
        type: 'local-file',
        position: { x: 0, y: 0 },
        data: { label: '데이터 파일', color: '#f59e0b', description: 'JSON/CSV', config: { file_filter: '*.json;*.csv' } },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 200, y: 0 },
        data: {
          label: 'AI 분석',
          color: '#6366f1',
          description: '데이터 분석',
          config: {
            system_prompt: '데이터를 분석하여 요약 통계, 주요 인사이트, 시각화에 적합한 형태로 변환하세요.',
          },
        },
      },
      {
        type: 'export-excel',
        position: { x: 400, y: 0 },
        data: { label: 'Excel 저장', color: '#22c55e', description: 'XLSX 생성', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }],
  },

  // ========================================
  // 에이전트 템플릿
  // ========================================
  {
    id: 'react-agent',
    name: 'ReAct 에이전트',
    description: '추론-행동 루프',
    icon: 'SmartToy',
    category: '에이전트',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '작업', color: '#22c55e', description: '수행할 작업', config: { inputType: 'text' } },
      },
      {
        type: 'custom-agent',
        position: { x: 200, y: 0 },
        data: {
          label: 'ReAct Agent',
          color: '#6366f1',
          description: '추론-행동 에이전트',
          config: {
            agent_type: 'react',
            system_prompt: '당신은 ReAct 에이전트입니다. 질문에 대해 생각(Thought)하고, 행동(Action)을 취하고, 관찰(Observation)하여 최종 답변을 도출하세요.',
          },
        },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 400, y: 0 },
        data: { label: '결과', color: '#6366f1', description: '에이전트 결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }],
  },

  // ========================================
  // 흐름 제어 템플릿
  // ========================================
  {
    id: 'parallel-processing',
    name: '병렬 처리',
    description: '동시 실행 → 병합',
    icon: 'AltRoute',
    category: '흐름 제어',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 50 },
        data: { label: '입력', color: '#22c55e', description: '데이터', config: {} },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 200, y: 0 },
        data: { label: '분석 A', color: '#6366f1', description: '첫 번째 분석', config: {} },
      },
      {
        type: 'model-claude-3-haiku',
        position: { x: 200, y: 100 },
        data: { label: '분석 B', color: '#c084fc', description: '두 번째 분석', config: {} },
      },
      {
        type: 'merge',
        position: { x: 400, y: 50 },
        data: { label: '병합', color: '#f97316', description: '결과 통합', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 0, targetIndex: 2 }, { sourceIndex: 1, targetIndex: 3 }, { sourceIndex: 2, targetIndex: 3 }],
  },
  {
    id: 'conditional-branch',
    name: '조건 분기',
    description: 'IF-ELSE 분기',
    icon: 'CallSplit',
    category: '흐름 제어',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 50 },
        data: { label: '입력', color: '#22c55e', description: '분기 데이터', config: {} },
      },
      {
        type: 'conditional',
        position: { x: 200, y: 50 },
        data: { label: '조건', color: '#8b5cf6', description: 'IF 조건', config: { condition: 'result.score > 0.5' } },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 400, y: 0 },
        data: { label: 'True 경로', color: '#22c55e', description: '조건 참', config: {} },
      },
      {
        type: 'model-claude-3-haiku',
        position: { x: 400, y: 100 },
        data: { label: 'False 경로', color: '#ef4444', description: '조건 거짓', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 1, targetIndex: 3 }],
  },

  // ========================================
  // KISTI ScienceON 학술검색 템플릿
  // ========================================
  {
    id: 'kisti-paper-search',
    name: 'KISTI 논문 검색',
    description: '검색어 → 논문 검색 → AI 분석',
    icon: 'Science',
    category: 'KISTI 학술검색',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '검색어', color: '#22c55e', description: '논문 검색 키워드', config: { inputType: 'text' } },
      },
      {
        type: 'kisti-articles',
        position: { x: 200, y: 0 },
        data: { label: 'KISTI 논문', color: '#8b5cf6', description: '학술논문 검색', config: { row_count: 20 } },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: '분석 프롬프트',
          color: '#06b6d4',
          description: '논문 분석 지시',
          config: {
            template: `다음 검색된 논문 목록을 분석하세요:

{{input}}

1. 주요 연구 동향을 요약하세요
2. 핵심 연구 주제와 키워드를 추출하세요
3. 연구 공백(research gap)을 식별하세요
4. 향후 연구 방향을 제안하세요`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'AI 분석', color: '#6366f1', description: '논문 동향 분석', config: { temperature: 0.3, max_tokens: 4096 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 800, y: 0 },
        data: { label: '분석 결과', color: '#6366f1', description: '연구 동향 분석', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },
  {
    id: 'kisti-patent-analysis',
    name: 'KISTI 특허 분석',
    description: '특허 검색 → 기술 동향 분석',
    icon: 'Gavel',
    category: 'KISTI 학술검색',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 0 },
        data: { label: '기술 분야', color: '#22c55e', description: '특허 검색 키워드', config: { inputType: 'text' } },
      },
      {
        type: 'kisti-patents',
        position: { x: 200, y: 0 },
        data: { label: 'KISTI 특허', color: '#a855f7', description: '특허정보 검색', config: { row_count: 30 } },
      },
      {
        type: 'prompt-template',
        position: { x: 400, y: 0 },
        data: {
          label: '특허 분석',
          color: '#06b6d4',
          description: '특허 분석 지시',
          config: {
            template: `다음 검색된 특허 목록을 분석하세요:

{{input}}

1. 주요 특허 기술 분류
2. 핵심 출원인/기업 분석
3. 기술 발전 트렌드
4. 잠재적 특허 회피 전략
5. 기술 융합 기회`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 600, y: 0 },
        data: { label: 'AI 분석', color: '#6366f1', description: '특허 동향 분석', config: { temperature: 0.3, max_tokens: 4096 } },
      },
      {
        type: 'export-excel',
        position: { x: 800, y: 0 },
        data: { label: 'Excel 저장', color: '#22c55e', description: '특허 분석 결과', config: {} },
      },
    ],
    edges: [{ sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 1, targetIndex: 2 }, { sourceIndex: 2, targetIndex: 3 }, { sourceIndex: 3, targetIndex: 4 }],
  },
  {
    id: 'kisti-comprehensive-search',
    name: 'KISTI 종합 검색',
    description: '논문 + 특허 + 보고서 + 동향 병렬 검색',
    icon: 'Biotech',
    category: 'KISTI 학술검색',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 100 },
        data: { label: '검색어', color: '#22c55e', description: '통합 검색 키워드', config: { inputType: 'text' } },
      },
      {
        type: 'kisti-articles',
        position: { x: 200, y: 0 },
        data: { label: '논문', color: '#8b5cf6', description: '학술논문', config: { row_count: 10 } },
      },
      {
        type: 'kisti-patents',
        position: { x: 200, y: 70 },
        data: { label: '특허', color: '#a855f7', description: '특허정보', config: { row_count: 10 } },
      },
      {
        type: 'kisti-reports',
        position: { x: 200, y: 140 },
        data: { label: '보고서', color: '#c084fc', description: '연구보고서', config: { row_count: 10 } },
      },
      {
        type: 'kisti-trends',
        position: { x: 200, y: 210 },
        data: { label: '동향', color: '#d946ef', description: '기술동향', config: { row_count: 10 } },
      },
      {
        type: 'merge',
        position: { x: 400, y: 100 },
        data: { label: '결과 병합', color: '#c084fc', description: '검색 결과 통합', config: {} },
      },
      {
        type: 'prompt-template',
        position: { x: 600, y: 100 },
        data: {
          label: '종합 분석',
          color: '#06b6d4',
          description: '통합 분석 지시',
          config: {
            template: `다음 검색 결과를 종합 분석하세요:

{{input}}

[분석 항목]
1. 논문 기반 연구 동향
2. 특허 기반 기술 개발 현황
3. 보고서 기반 정책/산업 동향
4. 동향 정보 기반 최신 이슈
5. 종합 인사이트 및 시사점`,
          },
        },
      },
      {
        type: 'model-claude-3-5-sonnet',
        position: { x: 800, y: 100 },
        data: { label: 'AI 종합분석', color: '#6366f1', description: '통합 분석', config: { temperature: 0.3, max_tokens: 8192 } },
      },
      {
        type: 'viz-result-viewer',
        position: { x: 1000, y: 100 },
        data: { label: '종합 결과', color: '#6366f1', description: '종합 분석 결과', config: {} },
      },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 0, targetIndex: 2 }, { sourceIndex: 0, targetIndex: 3 }, { sourceIndex: 0, targetIndex: 4 },
      { sourceIndex: 1, targetIndex: 5 }, { sourceIndex: 2, targetIndex: 5 }, { sourceIndex: 3, targetIndex: 5 }, { sourceIndex: 4, targetIndex: 5 },
      { sourceIndex: 5, targetIndex: 6 }, { sourceIndex: 6, targetIndex: 7 }, { sourceIndex: 7, targetIndex: 8 }
    ],
  },
  {
    id: 'kisti-cnt-research',
    name: '건설신기술 연구 분석',
    description: '건설신기술 관련 논문/특허/보고서 분석',
    icon: 'Construction',
    category: 'KISTI 학술검색',
    nodes: [
      {
        type: 'input',
        position: { x: 0, y: 50 },
        data: { label: '건설기술 주제', color: '#22c55e', description: '건설신기술 키워드', config: { inputType: 'text', default_value: '건설신기술' } },
      },
      {
        type: 'kisti-articles',
        position: { x: 200, y: 0 },
        data: { label: '학술논문', color: '#8b5cf6', description: '건설 관련 논문', config: { row_count: 15, query: '건설신기술' } },
      },
      {
        type: 'kisti-patents',
        position: { x: 200, y: 100 },
        data: { label: '특허검색', color: '#a855f7', description: '건설 관련 특허', config: { row_count: 15, query: '건설 기술' } },
      },
      {
        type: 'merge',
        position: { x: 400, y: 50 },
        data: { label: '병합', color: '#c084fc', description: '검색 결과 통합', config: {} },
      },
      {
        type: 'custom-agent',
        position: { x: 600, y: 50 },
        data: {
          label: '건설기술 분석가',
          color: '#6366f1',
          description: '건설신기술 전문가 AI',
          config: {
            system_prompt: `당신은 건설신기술 분야 전문가입니다.
검색된 논문과 특허를 분석하여 다음을 도출하세요:

1. **기술 분류**: 구조, 시공, 재료, 환경, 안전 등
2. **혁신성 평가**: 기존 기술 대비 개선점
3. **적용 가능성**: 현장 적용 가능성 및 제약사항
4. **경제성 분석**: 비용 절감 효과 예측
5. **지속가능성**: 환경적 영향 평가
6. **상용화 전략**: 기술 이전 및 사업화 방안`,
          },
        },
      },
      {
        type: 'export-word',
        position: { x: 800, y: 50 },
        data: { label: '분석 리포트', color: '#2563eb', description: '건설신기술 분석 보고서', config: {} },
      },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1 }, { sourceIndex: 0, targetIndex: 2 },
      { sourceIndex: 1, targetIndex: 3 }, { sourceIndex: 2, targetIndex: 3 },
      { sourceIndex: 3, targetIndex: 4 }, { sourceIndex: 4, targetIndex: 5 }
    ],
  },
]

export const TEMPLATE_CATEGORIES = [
  'LLM 기초',
  '문서 분석',
  'RAG/지식',
  '전문가 에이전트',
  'KISTI 학술검색',
  '리포트 생성',
  '에이전트',
  '흐름 제어',
]
