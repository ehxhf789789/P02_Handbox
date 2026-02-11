// 노드 연결 가이드 - 각 노드의 필수/선택 연결 정보와 사용 가이드

export interface NodeGuide {
  type: string
  name: string
  description: string
  category: string
  // 입력 요구사항
  inputs: {
    required: string[]     // 필수 입력 노드 타입들
    optional: string[]     // 선택 입력 노드 타입들
    description: string    // 입력 설명
  }
  // 출력 연결 가능 노드
  outputs: {
    recommended: string[]  // 권장 출력 연결
    compatible: string[]   // 호환 가능한 모든 노드
    description: string    // 출력 설명
  }
  // 사용 예시
  examples: {
    title: string
    description: string
    nodes: string[]        // 연결되는 노드 체인
  }[]
  // 주의사항
  warnings?: string[]
  // 팁
  tips?: string[]
}

// 노드 타입 그룹 (연결 호환성용)
export const NODE_GROUPS = {
  // 텍스트 입력을 받는 노드들
  TEXT_INPUT: ['prompt-template', 'text-splitter', 'embedder', 'aws-translate', 'aws-comprehend'],
  // 텍스트 출력을 하는 노드들
  TEXT_OUTPUT: ['input', 'local-file', 'local-folder', 'doc-pdf-parser', 'doc-excel-parser', 'doc-csv-parser', 'doc-json-parser', 'doc-xml-parser', 'prompt-template', 'output'],
  // KISTI ScienceON API 노드들
  KISTI: ['kisti-articles', 'kisti-patents', 'kisti-reports', 'kisti-trends'],
  // LLM 모델들
  LLM_MODELS: ['model-claude-3-5-sonnet', 'model-claude-3-opus', 'model-claude-3-sonnet', 'model-claude-3-haiku', 'model-titan-text-premier', 'model-llama-3-1-405b', 'model-llama-3-1-70b', 'model-mistral-large'],
  // 벡터/임베딩 관련
  VECTOR_DB: ['vector-pinecone', 'vector-chroma', 'vector-faiss', 'vector-opensearch', 'kb-query', 'kb-ingest'],
  // 시각화 노드들
  VISUALIZATION: ['viz-result-viewer', 'viz-json-viewer', 'viz-table-viewer', 'viz-chart', 'viz-markdown-viewer', 'viz-diff-viewer', 'viz-flow-diagram'],
  // 내보내기 노드들
  EXPORT: ['export-pdf', 'export-word', 'export-excel', 'export-ppt', 'export-csv', 'export-markdown', 'export-html'],
  // 제어 흐름
  CONTROL_FLOW: ['conditional', 'loop', 'merge'],
  // 자동화
  AUTOMATION: ['timer', 'scheduler', 'alarm', 'webhook', 'interval'],
  // 액션
  ACTIONS: ['email-sender', 'notification', 'shell-command'],
}

// 각 노드별 상세 가이드
export const NODE_GUIDES: Record<string, NodeGuide> = {
  // =========== 입출력 노드 ===========
  'input': {
    type: 'input',
    name: '입력 노드',
    description: '워크플로우의 시작점입니다. 사용자 입력이나 초기 데이터를 정의합니다.',
    category: '입출력',
    inputs: {
      required: [],
      optional: [],
      description: '입력 노드는 시작점이므로 다른 노드와 연결할 필요가 없습니다.'
    },
    outputs: {
      recommended: ['prompt-template', 'text-splitter', 'conditional'],
      compatible: [...NODE_GROUPS.TEXT_INPUT, ...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.CONTROL_FLOW, ...NODE_GROUPS.VISUALIZATION],
      description: '텍스트 데이터를 다음 노드로 전달합니다.'
    },
    examples: [
      {
        title: '기본 LLM 질의',
        description: '사용자 입력을 LLM에 전달',
        nodes: ['input', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    tips: ['워크플로우는 반드시 입력 노드에서 시작해야 합니다.', '여러 입력을 받으려면 여러 입력 노드를 사용하세요.']
  },

  'output': {
    type: 'output',
    name: '출력 노드',
    description: '워크플로우의 종료점입니다. 최종 결과를 표시합니다.',
    category: '입출력',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.TEXT_OUTPUT, ...NODE_GROUPS.VISUALIZATION],
      description: '모든 노드의 출력을 받을 수 있습니다.'
    },
    outputs: {
      recommended: [],
      compatible: [],
      description: '출력 노드는 종료점이므로 다른 노드로 연결하지 않습니다.'
    },
    examples: [],
    tips: ['워크플로우는 반드시 출력 노드로 끝나야 합니다.']
  },

  'prompt-template': {
    type: 'prompt-template',
    name: '프롬프트 템플릿',
    description: 'LLM에 전달할 프롬프트를 구성합니다. 변수를 사용하여 동적 프롬프트를 만들 수 있습니다.',
    category: '입출력',
    inputs: {
      required: ['input'],
      optional: ['local-file', 'kb-query', 'doc-pdf-parser', 'doc-csv-parser'],
      description: '텍스트 데이터와 컨텍스트 정보를 입력받습니다.'
    },
    outputs: {
      recommended: [...NODE_GROUPS.LLM_MODELS],
      compatible: [...NODE_GROUPS.LLM_MODELS, 'custom-agent', 'rag-agent'],
      description: '구성된 프롬프트를 LLM 모델로 전달합니다.'
    },
    examples: [
      {
        title: 'RAG 프롬프트',
        description: '검색된 문서를 포함한 프롬프트',
        nodes: ['input', 'kb-query', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    tips: ['{{변수명}} 형식으로 변수를 사용하세요.', '시스템 프롬프트와 사용자 프롬프트를 분리하면 더 좋은 결과를 얻을 수 있습니다.']
  },

  // =========== LLM 모델 ===========
  'model-claude-3-5-sonnet': {
    type: 'model-claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic의 최신 고성능 LLM. 복잡한 분석, 코딩, 추론에 적합합니다.',
    category: 'AI 모델',
    inputs: {
      required: ['prompt-template', 'input'],
      optional: ['kb-query', 'doc-pdf-parser'],
      description: '프롬프트 또는 텍스트 입력이 필요합니다.'
    },
    outputs: {
      recommended: ['output', 'viz-result-viewer', 'conditional'],
      compatible: [...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, ...NODE_GROUPS.CONTROL_FLOW, 'output', 'prompt-template'],
      description: 'LLM 응답 텍스트를 출력합니다.'
    },
    examples: [
      {
        title: '문서 요약',
        description: '긴 문서를 요약',
        nodes: ['local-file', 'text-splitter', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    warnings: ['API 비용이 발생합니다.', 'AWS Bedrock 리전 설정을 확인하세요.'],
    tips: ['복잡한 추론에는 temperature를 낮게 설정하세요.', 'max_tokens를 충분히 설정하세요.']
  },

  // =========== 문서 파싱 ===========
  'doc-pdf-parser': {
    type: 'doc-pdf-parser',
    name: 'PDF 파서',
    description: 'PDF 파일에서 텍스트를 추출합니다.',
    category: '문서 파싱',
    inputs: {
      required: [],
      optional: ['local-file'],
      description: '파일 경로를 설정하거나 local-file 노드에서 받습니다.'
    },
    outputs: {
      recommended: ['text-splitter', 'prompt-template', 'embedder'],
      compatible: [...NODE_GROUPS.TEXT_INPUT, ...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION],
      description: '추출된 텍스트를 출력합니다.'
    },
    examples: [
      {
        title: 'PDF 분석',
        description: 'PDF를 읽고 LLM으로 분석',
        nodes: ['doc-pdf-parser', 'text-splitter', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    tips: ['스캔된 PDF는 AWS Textract를 사용하세요.', '이미지가 많은 PDF는 텍스트 추출이 제한적입니다.']
  },

  'doc-excel-parser': {
    type: 'doc-excel-parser',
    name: 'Excel 파서',
    description: 'Excel 파일(xlsx, xls, ods)에서 데이터를 추출합니다.',
    category: '문서 파싱',
    inputs: {
      required: [],
      optional: ['local-file'],
      description: '파일 경로를 설정하거나 local-file 노드에서 받습니다.'
    },
    outputs: {
      recommended: ['viz-table-viewer', 'viz-chart', 'export-csv'],
      compatible: [...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, ...NODE_GROUPS.LLM_MODELS],
      description: '시트별 데이터를 JSON 형태로 출력합니다.'
    },
    examples: [
      {
        title: 'Excel 데이터 시각화',
        description: 'Excel 데이터를 차트로 표시',
        nodes: ['doc-excel-parser', 'viz-chart', 'output']
      }
    ],
    tips: ['특정 시트만 읽으려면 sheet_name을 설정하세요.']
  },

  // =========== 문서 내보내기 ===========
  'export-pdf': {
    type: 'export-pdf',
    name: 'PDF 내보내기',
    description: '텍스트를 PDF 파일로 내보냅니다.',
    category: '문서 내보내기',
    inputs: {
      required: ['output', ...NODE_GROUPS.LLM_MODELS],
      optional: ['prompt-template', 'viz-result-viewer'],
      description: '텍스트 데이터를 입력받아 PDF로 변환합니다.'
    },
    outputs: {
      recommended: ['notification', 'output'],
      compatible: ['notification', 'email-sender', 'output'],
      description: 'PDF 파일 경로와 상태를 출력합니다.'
    },
    examples: [
      {
        title: 'LLM 응답을 PDF로',
        description: 'LLM 분석 결과를 PDF로 저장',
        nodes: ['input', 'prompt-template', 'model-claude-3-5-sonnet', 'export-pdf', 'output']
      }
    ],
    warnings: ['내장 폰트 사용으로 한글은 ?로 표시될 수 있습니다.'],
    tips: ['출력 경로를 반드시 설정하세요.', '제목을 설정하면 PDF 메타데이터에 포함됩니다.']
  },

  'export-excel': {
    type: 'export-excel',
    name: 'Excel 내보내기',
    description: '데이터를 Excel(xlsx) 파일로 내보냅니다.',
    category: '문서 내보내기',
    inputs: {
      required: [],
      optional: ['doc-csv-parser', 'doc-excel-parser', 'kb-query', 'viz-table-viewer'],
      description: '배열 또는 객체 형태의 JSON 데이터를 받습니다.'
    },
    outputs: {
      recommended: ['notification', 'output'],
      compatible: ['notification', 'email-sender', 'output'],
      description: 'Excel 파일 경로와 상태를 출력합니다.'
    },
    examples: [
      {
        title: 'CSV를 Excel로 변환',
        description: 'CSV 데이터를 Excel로 내보내기',
        nodes: ['doc-csv-parser', 'export-excel', 'output']
      }
    ],
    tips: ['배열 데이터는 각 요소가 행이 됩니다.', '시트 이름을 설정할 수 있습니다.']
  },

  'export-word': {
    type: 'export-word',
    name: 'Word 내보내기',
    description: '텍스트를 Word(docx) 문서로 내보냅니다.',
    category: '문서 내보내기',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, 'prompt-template', 'viz-markdown-viewer'],
      description: '텍스트 데이터를 입력받습니다.'
    },
    outputs: {
      recommended: ['notification', 'output'],
      compatible: ['notification', 'email-sender', 'output'],
      description: 'Word 파일 경로와 상태를 출력합니다.'
    },
    examples: [
      {
        title: '보고서 생성',
        description: 'LLM으로 생성한 보고서를 Word로 저장',
        nodes: ['input', 'prompt-template', 'model-claude-3-5-sonnet', 'export-word', 'output']
      }
    ],
    tips: ['문단 구분은 빈 줄(\\n\\n)로 합니다.']
  },

  'export-ppt': {
    type: 'export-ppt',
    name: 'PPT 내보내기',
    description: '텍스트를 PowerPoint(pptx) 프레젠테이션으로 내보냅니다.',
    category: '문서 내보내기',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, 'prompt-template'],
      description: '텍스트 데이터를 입력받습니다. 문단별로 슬라이드가 생성됩니다.'
    },
    outputs: {
      recommended: ['notification', 'output'],
      compatible: ['notification', 'email-sender', 'output'],
      description: 'PowerPoint 파일 경로와 상태를 출력합니다.'
    },
    examples: [
      {
        title: '발표자료 자동 생성',
        description: 'LLM으로 발표자료 내용을 생성하고 PPT로 저장',
        nodes: ['input', 'prompt-template', 'model-claude-3-5-sonnet', 'export-ppt', 'output']
      }
    ],
    tips: ['각 문단(\\n\\n 구분)이 별도 슬라이드의 bullet point가 됩니다.', '제목을 설정하면 첫 슬라이드에 표시됩니다.']
  },

  // =========== 데이터 처리 ===========
  'text-splitter': {
    type: 'text-splitter',
    name: '텍스트 분할',
    description: '긴 텍스트를 작은 청크로 분할합니다. RAG 파이프라인에 필수적입니다.',
    category: '데이터 처리',
    inputs: {
      required: ['doc-pdf-parser', 'local-file', 'input'],
      optional: [],
      description: '분할할 텍스트 데이터가 필요합니다.'
    },
    outputs: {
      recommended: ['embedder', 'kb-ingest'],
      compatible: ['embedder', 'kb-ingest', ...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION],
      description: '분할된 텍스트 청크 배열을 출력합니다.'
    },
    examples: [
      {
        title: 'RAG 인덱싱',
        description: '문서를 분할하고 벡터화하여 KB에 저장',
        nodes: ['doc-pdf-parser', 'text-splitter', 'embedder', 'kb-ingest', 'output']
      }
    ],
    tips: ['chunk_size는 모델의 컨텍스트 길이에 맞게 설정하세요.', 'chunk_overlap을 설정하면 문맥이 끊기지 않습니다.']
  },

  'embedder': {
    type: 'embedder',
    name: '임베딩',
    description: '텍스트를 벡터(임베딩)로 변환합니다.',
    category: '데이터 처리',
    inputs: {
      required: ['text-splitter', 'input'],
      optional: ['doc-pdf-parser', 'local-file'],
      description: '텍스트 데이터가 필요합니다.'
    },
    outputs: {
      recommended: ['kb-ingest', 'vector-pinecone', 'vector-opensearch'],
      compatible: [...NODE_GROUPS.VECTOR_DB, ...NODE_GROUPS.VISUALIZATION],
      description: '벡터 배열을 출력합니다.'
    },
    examples: [
      {
        title: '문서 인덱싱',
        description: '문서를 벡터화하여 검색 가능하게 만들기',
        nodes: ['doc-pdf-parser', 'text-splitter', 'embedder', 'vector-pinecone', 'output']
      }
    ],
    tips: ['Titan Embed V2는 다국어를 잘 지원합니다.']
  },

  // =========== 지식베이스 ===========
  'kb-query': {
    type: 'kb-query',
    name: 'KB 질의',
    description: '지식베이스에서 관련 문서를 검색합니다.',
    category: '지식베이스',
    inputs: {
      required: ['input', 'prompt-template'],
      optional: [],
      description: '검색할 쿼리 텍스트가 필요합니다.'
    },
    outputs: {
      recommended: ['prompt-template', ...NODE_GROUPS.LLM_MODELS],
      compatible: ['prompt-template', ...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION],
      description: '검색된 문서와 점수를 출력합니다.'
    },
    examples: [
      {
        title: 'RAG 질의응답',
        description: 'KB 검색 결과를 포함한 LLM 응답',
        nodes: ['input', 'kb-query', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    tips: ['top_k를 조절하여 검색 결과 수를 조정하세요.']
  },

  'kb-ingest': {
    type: 'kb-ingest',
    name: '문서 수집',
    description: '문서를 지식베이스에 추가합니다.',
    category: '지식베이스',
    inputs: {
      required: ['text-splitter', 'embedder'],
      optional: ['doc-pdf-parser', 'local-file'],
      description: '분할되고 벡터화된 문서가 필요합니다.'
    },
    outputs: {
      recommended: ['notification', 'output'],
      compatible: ['notification', 'output', ...NODE_GROUPS.VISUALIZATION],
      description: '인덱싱 결과를 출력합니다.'
    },
    examples: [
      {
        title: '문서 인덱싱 파이프라인',
        description: 'PDF를 KB에 추가',
        nodes: ['doc-pdf-parser', 'text-splitter', 'embedder', 'kb-ingest', 'output']
      }
    ],
    tips: ['대용량 문서는 배치로 처리하세요.']
  },

  // =========== 시각화 ===========
  'viz-result-viewer': {
    type: 'viz-result-viewer',
    name: '결과 뷰어',
    description: '노드 실행 결과를 미리보기합니다.',
    category: '시각화',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.TEXT_OUTPUT, ...NODE_GROUPS.VECTOR_DB],
      description: '모든 노드의 출력을 받아 표시합니다.'
    },
    outputs: {
      recommended: ['output', ...NODE_GROUPS.EXPORT],
      compatible: ['output', ...NODE_GROUPS.EXPORT, ...NODE_GROUPS.ACTIONS],
      description: '입력받은 데이터를 그대로 전달합니다.'
    },
    examples: [],
    tips: ['디버깅 시 중간 결과를 확인하는 데 유용합니다.']
  },

  'viz-chart': {
    type: 'viz-chart',
    name: '차트 생성',
    description: '데이터를 차트로 시각화합니다.',
    category: '시각화',
    inputs: {
      required: ['doc-excel-parser', 'doc-csv-parser'],
      optional: ['kb-query', ...NODE_GROUPS.LLM_MODELS],
      description: '차트로 표시할 데이터가 필요합니다.'
    },
    outputs: {
      recommended: ['output', 'export-pdf'],
      compatible: ['output', ...NODE_GROUPS.EXPORT],
      description: '차트 렌더링 데이터를 출력합니다.'
    },
    examples: [
      {
        title: 'Excel 데이터 시각화',
        description: 'Excel 데이터를 차트로 표시',
        nodes: ['doc-excel-parser', 'viz-chart', 'output']
      }
    ],
    tips: ['chart_type으로 bar, line, pie 등을 설정할 수 있습니다.']
  },

  // =========== 자동화 ===========
  'webhook': {
    type: 'webhook',
    name: 'Webhook',
    description: '외부 URL로 HTTP 요청을 보냅니다.',
    category: '자동화',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION],
      description: '전송할 데이터를 입력받습니다.'
    },
    outputs: {
      recommended: ['output', 'conditional'],
      compatible: ['output', ...NODE_GROUPS.CONTROL_FLOW, ...NODE_GROUPS.VISUALIZATION],
      description: 'HTTP 응답을 출력합니다.'
    },
    examples: [
      {
        title: 'Slack 알림',
        description: 'LLM 결과를 Slack으로 전송',
        nodes: ['input', 'model-claude-3-5-sonnet', 'webhook', 'output']
      }
    ],
    warnings: ['외부 서비스 연결 시 보안에 주의하세요.'],
    tips: ['method는 POST, GET 등을 선택할 수 있습니다.']
  },

  'shell-command': {
    type: 'shell-command',
    name: '쉘 명령',
    description: '시스템 명령을 실행합니다.',
    category: '액션',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, 'input'],
      description: '명령에 전달할 인자를 입력받을 수 있습니다.'
    },
    outputs: {
      recommended: ['output', 'conditional'],
      compatible: ['output', ...NODE_GROUPS.CONTROL_FLOW, ...NODE_GROUPS.VISUALIZATION],
      description: '명령 실행 결과(stdout, stderr, exit_code)를 출력합니다.'
    },
    examples: [],
    warnings: ['rm, del 등 위험한 명령은 차단됩니다.', '시스템 보안에 주의하세요.'],
    tips: ['working_dir로 작업 디렉토리를 설정할 수 있습니다.', 'timeout으로 최대 실행 시간을 제한하세요.']
  },

  // =========== 제어 흐름 ===========
  'conditional': {
    type: 'conditional',
    name: '조건 분기',
    description: '조건에 따라 다른 경로로 분기합니다.',
    category: '제어 흐름',
    inputs: {
      required: ['input', ...NODE_GROUPS.LLM_MODELS],
      optional: [],
      description: '조건 평가를 위한 데이터가 필요합니다.'
    },
    outputs: {
      recommended: [...NODE_GROUPS.LLM_MODELS, 'output'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output'],
      description: 'true/false 분기 결과를 출력합니다.'
    },
    examples: [
      {
        title: '감정 분석 분기',
        description: '긍정/부정에 따라 다른 응답',
        nodes: ['input', 'aws-comprehend', 'conditional', 'output']
      }
    ],
    tips: ['condition에 JavaScript 조건식을 사용할 수 있습니다.']
  },

  'loop': {
    type: 'loop',
    name: '반복',
    description: '지정된 횟수나 조건까지 반복 실행합니다.',
    category: '제어 흐름',
    inputs: {
      required: ['input'],
      optional: [],
      description: '반복할 데이터 배열이나 횟수를 입력받습니다.'
    },
    outputs: {
      recommended: [...NODE_GROUPS.LLM_MODELS, 'merge'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, 'merge', 'output'],
      description: '각 반복의 결과를 출력합니다.'
    },
    examples: [],
    tips: ['max_iterations로 최대 반복 횟수를 제한하세요.']
  },

  'merge': {
    type: 'merge',
    name: '병합',
    description: '여러 노드의 출력을 하나로 합칩니다.',
    category: '제어 흐름',
    inputs: {
      required: [],
      optional: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.TEXT_OUTPUT],
      description: '여러 노드의 출력을 받습니다.'
    },
    outputs: {
      recommended: ['output', 'prompt-template'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output'],
      description: '병합된 데이터를 출력합니다.'
    },
    examples: [],
    tips: ['merge_strategy로 병합 방식을 선택할 수 있습니다.']
  },

  // =========== KISTI ScienceON ===========
  'kisti-articles': {
    type: 'kisti-articles',
    name: 'KISTI 논문',
    description: 'KISTI ScienceON API를 통해 국내외 학술논문을 검색합니다.',
    category: 'API 연동',
    inputs: {
      required: [],
      optional: ['input', 'prompt-template'],
      description: '검색어를 입력받습니다. 입력이 없으면 config의 query를 사용합니다.'
    },
    outputs: {
      recommended: ['prompt-template', ...NODE_GROUPS.LLM_MODELS, 'viz-table-viewer'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output', 'prompt-template'],
      description: '검색된 논문 목록(제목, 저자, 학술지, 초록 등)을 JSON 형태로 출력합니다.'
    },
    examples: [
      {
        title: '건설기술 논문 검색',
        description: '건설신기술 관련 논문 검색 후 LLM 분석',
        nodes: ['input', 'kisti-articles', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      },
      {
        title: '논문 검색 결과 내보내기',
        description: '검색된 논문 목록을 Excel로 저장',
        nodes: ['kisti-articles', 'export-excel', 'output']
      }
    ],
    warnings: ['KISTI API 인증키가 필요합니다.', 'MAC 주소가 KISTI에 등록되어 있어야 합니다.'],
    tips: [
      'search_field를 BI(기본색인), TI(제목), AU(저자) 등으로 설정할 수 있습니다.',
      'row_count로 반환 결과 수를 조절하세요 (기본 10건).',
      'cur_page로 페이지를 지정할 수 있습니다.'
    ]
  },

  'kisti-patents': {
    type: 'kisti-patents',
    name: 'KISTI 특허',
    description: 'KISTI ScienceON API를 통해 국내외 특허 정보를 검색합니다.',
    category: 'API 연동',
    inputs: {
      required: [],
      optional: ['input', 'prompt-template'],
      description: '검색어를 입력받습니다. 입력이 없으면 config의 query를 사용합니다.'
    },
    outputs: {
      recommended: ['prompt-template', ...NODE_GROUPS.LLM_MODELS, 'viz-table-viewer'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output', 'prompt-template'],
      description: '검색된 특허 목록(제목, 출원인, 출원번호, 요약 등)을 JSON 형태로 출력합니다.'
    },
    examples: [
      {
        title: '특허 동향 분석',
        description: '특정 기술 분야 특허 검색 후 분석',
        nodes: ['input', 'kisti-patents', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    warnings: ['KISTI API 인증키가 필요합니다.', 'MAC 주소가 KISTI에 등록되어 있어야 합니다.'],
    tips: [
      'search_field를 TI(명칭), AB(요약), AP(출원인) 등으로 설정할 수 있습니다.',
      '특허 분석에는 출원번호와 등록번호를 활용하세요.'
    ]
  },

  'kisti-reports': {
    type: 'kisti-reports',
    name: 'KISTI 보고서',
    description: 'KISTI ScienceON API를 통해 연구/기술 보고서를 검색합니다.',
    category: 'API 연동',
    inputs: {
      required: [],
      optional: ['input', 'prompt-template'],
      description: '검색어를 입력받습니다. 입력이 없으면 config의 query를 사용합니다.'
    },
    outputs: {
      recommended: ['prompt-template', ...NODE_GROUPS.LLM_MODELS, 'viz-table-viewer'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output', 'prompt-template'],
      description: '검색된 보고서 목록(제목, 저자, 기관, 초록 등)을 JSON 형태로 출력합니다.'
    },
    examples: [
      {
        title: '기술보고서 검색',
        description: '특정 분야 연구보고서 검색',
        nodes: ['input', 'kisti-reports', 'viz-table-viewer', 'output']
      }
    ],
    warnings: ['KISTI API 인증키가 필요합니다.', 'MAC 주소가 KISTI에 등록되어 있어야 합니다.'],
    tips: [
      '국가 R&D 과제 보고서, KISTEP 보고서 등이 검색됩니다.',
      'search_field를 활용하여 제목, 저자, 기관별 검색이 가능합니다.'
    ]
  },

  'kisti-trends': {
    type: 'kisti-trends',
    name: 'KISTI 동향',
    description: 'KISTI ScienceON API를 통해 과학기술 동향 정보를 검색합니다.',
    category: 'API 연동',
    inputs: {
      required: [],
      optional: ['input', 'prompt-template'],
      description: '검색어를 입력받습니다. 입력이 없으면 config의 query를 사용합니다.'
    },
    outputs: {
      recommended: ['prompt-template', ...NODE_GROUPS.LLM_MODELS, 'viz-table-viewer'],
      compatible: [...NODE_GROUPS.LLM_MODELS, ...NODE_GROUPS.VISUALIZATION, ...NODE_GROUPS.EXPORT, 'output', 'prompt-template'],
      description: '검색된 동향 정보(제목, 요약, 분야 등)를 JSON 형태로 출력합니다.'
    },
    examples: [
      {
        title: '기술동향 분석',
        description: '최신 기술 동향 검색 및 분석',
        nodes: ['input', 'kisti-trends', 'prompt-template', 'model-claude-3-5-sonnet', 'output']
      }
    ],
    warnings: ['KISTI API 인증키가 필요합니다.', 'MAC 주소가 KISTI에 등록되어 있어야 합니다.'],
    tips: [
      '기술동향 리포트, 산업동향 등의 정보가 검색됩니다.',
      '건설, 환경, 에너지 등 분야별 동향 파악에 유용합니다.'
    ]
  },
}

// 노드 타입으로 가이드 가져오기
export function getNodeGuide(nodeType: string): NodeGuide | undefined {
  return NODE_GUIDES[nodeType]
}

// 특정 노드에 연결 가능한 노드 목록
export function getCompatibleNodes(nodeType: string, direction: 'input' | 'output'): string[] {
  const guide = NODE_GUIDES[nodeType]
  if (!guide) return []

  if (direction === 'input') {
    return [...guide.inputs.required, ...guide.inputs.optional]
  } else {
    return [...guide.outputs.recommended, ...guide.outputs.compatible]
  }
}

// 필수 연결이 누락되었는지 확인
export function getMissingRequiredConnections(nodeType: string, connectedNodes: string[]): string[] {
  const guide = NODE_GUIDES[nodeType]
  if (!guide) return []

  return guide.inputs.required.filter(req =>
    !connectedNodes.some(connected =>
      req === connected || connected.startsWith(req.replace(/-\d+$/, ''))
    )
  )
}
