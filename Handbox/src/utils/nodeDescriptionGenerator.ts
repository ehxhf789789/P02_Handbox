/**
 * Node Description Generator (Claude Code 수준)
 *
 * NodeRegistry에서 모든 노드 정의를 읽어 고품질 LLM 시스템 프롬프트를 생성.
 * Claude Code, KIMO 수준의 정확한 도구 설명을 제공.
 *
 * ## 핵심 원칙
 * 1. 각 도구에 대한 명확한 JSON Schema 제공
 * 2. 구체적인 사용 예시 포함
 * 3. 타입 호환성 매트릭스 명시
 * 4. 일반적인 워크플로우 패턴 제공
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'
import type { PortDefinition, ConfigField } from '../engine/types'

// ============================================================
// 타입 호환성 매트릭스 (72개 노드 확장, Claude Code 수준 정밀도)
// ============================================================

const TYPE_COMPATIBILITY: Record<string, string[]> = {
  // 기본 타입 (넓은 호환성)
  'text': ['text', 'any', 'llm-response', 'analysis', 'report', 'json'],
  'json': ['json', 'any', 'table-data', 'chart-data', 'search-result[]', 'structured-data', 'evaluation', 'ml-result', 'agent-output', 'file-ref', 'text', 'evaluation-result[]', 'decision'],
  'any': ['text', 'json', 'file-ref', 'vector', 'vector[]', 'text[]', 'chunk[]', 'table-data', 'chart-data', 'search-result[]', 'llm-response', 'image', 'image[]', 'analysis', 'evaluation', 'ml-result', 'agent-output', 'document', 'structured-data', 'evaluation-result[]', 'decision', 'voting-result'],

  // 파일 관련 (json도 file-ref로 변환 가능 - 경로 추출)
  'file-ref': ['file-ref', 'text', 'any', 'image', 'document'],
  'file-ref[]': ['file-ref[]', 'any', 'json'],
  'document': ['document', 'file-ref', 'any', 'text'],

  // 배열 타입
  'text[]': ['text[]', 'chunk[]', 'any', 'json'],
  'chunk[]': ['chunk[]', 'text[]', 'any', 'json'],
  'vector[]': ['vector[]', 'any'],
  'search-result[]': ['search-result[]', 'json', 'any', 'text'],
  'image[]': ['image[]', 'any', 'file-ref[]'],

  // 벡터 타입
  'vector': ['vector', 'vector[]', 'any'],

  // LLM 관련
  'llm-response': ['llm-response', 'text', 'any', 'analysis', 'json'],

  // 시각화 타입
  'table-data': ['table-data', 'json', 'any'],
  'chart-data': ['chart-data', 'json', 'any'],

  // Vision/VLM 타입
  'image': ['image', 'file-ref', 'any', 'image[]'],
  'analysis': ['analysis', 'text', 'json', 'any'],
  'evaluation': ['evaluation', 'json', 'any', 'evaluation-result[]'],
  'benchmark-result': ['benchmark-result', 'json', 'evaluation', 'any'],
  'ocr-result': ['ocr-result', 'text', 'json', 'any'],

  // Agent 타입
  'agent-output': ['agent-output', 'json', 'text', 'any', 'evaluation-result[]'],
  'plan': ['plan', 'json', 'any'],
  'tool-call': ['tool-call', 'json', 'any'],

  // 평가/투표 타입 (신규)
  'evaluation-result': ['evaluation-result', 'json', 'any'],
  'evaluation-result[]': ['evaluation-result[]', 'json', 'any', 'agent-output'],
  'voting-result': ['voting-result', 'json', 'any', 'decision'],
  'decision': ['decision', 'text', 'json', 'any'],

  // ML 타입
  'ml-result': ['ml-result', 'json', 'any', 'table-data'],
  'model': ['model', 'any'],
  'features': ['features', 'json', 'any'],
  'prediction': ['prediction', 'json', 'ml-result', 'any'],

  // Export 타입
  'docx': ['docx', 'document', 'file-ref', 'any'],
  'pptx': ['pptx', 'document', 'file-ref', 'any'],
  'pdf': ['pdf', 'document', 'file-ref', 'any'],
  'xlsx': ['xlsx', 'document', 'file-ref', 'table-data', 'any'],
  'structured-data': ['structured-data', 'json', 'any'],
  'report': ['report', 'text', 'json', 'any'],
}

/**
 * 두 타입이 호환되는지 확인
 */
export function areTypesCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === targetType) return true
  if (targetType === 'any') return true
  return TYPE_COMPATIBILITY[sourceType]?.includes(targetType) ?? false
}

// ============================================================
// 노드 스펙 생성 (Claude Code 수준)
// ============================================================

/**
 * ConfigField를 JSON Schema 형식으로 변환
 */
function formatConfigSchema(fields: ConfigField[]): string {
  if (fields.length === 0) return '    없음'

  return fields.map(f => {
    let typeInfo: string = f.type as string
    if (f.type === 'select' && f.options) {
      const opts = f.options.map(o => `"${o.value}"`).join(' | ')
      typeInfo = `enum(${opts})`
    }

    const required = f.required ? '**[필수]**' : '[선택]'
    const defaultVal = f.default !== undefined ? ` (기본값: ${JSON.stringify(f.default)})` : ''

    return `    - \`${f.key}\`: ${typeInfo} ${required}${defaultVal}
      ${f.description || f.label}`
  }).join('\n')
}

/**
 * 포트를 상세 형식으로 변환
 */
function formatPortDetailed(port: PortDefinition): string {
  const required = port.required ? '**[필수]**' : '[선택]'
  return `    - \`${port.name}\` (타입: \`${port.type}\`) ${required}
      ${port.description || ''}`
}

/**
 * 노드에 대한 예시 JSON 생성
 */
function generateNodeExample(def: NodeDefinition): string {
  const config: Record<string, any> = {}

  // 주요 설정 필드에 예시 값 채우기
  for (const field of def.configSchema.slice(0, 3)) {
    if (field.default !== undefined) {
      config[field.key] = field.default
    } else if (field.type === 'text') {
      config[field.key] = field.placeholder || `예시_${field.key}`
    } else if (field.type === 'number') {
      config[field.key] = 100
    } else if (field.type === 'toggle') {
      config[field.key] = true
    } else if (field.type === 'select' && field.options?.length) {
      config[field.key] = field.options[0].value
    }
  }

  return JSON.stringify({
    id: `${def.type.replace('.', '_')}_1`,
    type: def.type,
    position: { x: 0, y: 0 },
    data: {
      label: def.meta.label,
      config
    }
  }, null, 2)
}

/**
 * 단일 노드의 완전한 스펙 생성
 */
function generateNodeSpec(def: NodeDefinition): string {
  const inputs = def.ports.inputs.length > 0
    ? def.ports.inputs.map(formatPortDetailed).join('\n')
    : '    없음'

  const outputs = def.ports.outputs.length > 0
    ? def.ports.outputs.map(formatPortDetailed).join('\n')
    : '    없음 (터미널 노드)'

  const configSchema = formatConfigSchema(def.configSchema)
  const example = generateNodeExample(def)

  // 이 노드와 연결 가능한 출력 타입
  const acceptableInputTypes = def.ports.inputs
    .flatMap(p => TYPE_COMPATIBILITY[p.type] || [p.type])
    .filter((v, i, a) => a.indexOf(v) === i)

  // 이 노드의 출력과 연결 가능한 입력 타입
  const providesOutputTypes = def.ports.outputs.map(p => p.type)

  return `
#### ${def.meta.label} (\`${def.type}\`)

**설명**: ${def.meta.description}

**입력 포트**:
${inputs}

**출력 포트**:
${outputs}

**설정 (config)**:
${configSchema}

**연결 가능**:
- 입력으로 받을 수 있는 타입: ${acceptableInputTypes.length > 0 ? acceptableInputTypes.map(t => `\`${t}\``).join(', ') : '없음'}
- 출력으로 내보내는 타입: ${providesOutputTypes.length > 0 ? providesOutputTypes.map(t => `\`${t}\``).join(', ') : '없음'}

**예시**:
\`\`\`json
${example}
\`\`\`
`
}

// ============================================================
// 워크플로우 패턴 라이브러리
// ============================================================

const WORKFLOW_PATTERNS = `
## 일반적인 워크플로우 패턴 (72개 노드 지원)

---

### [기본] 패턴 1: 파일 읽기 → 처리 → 저장
\`\`\`
io.file-read → transform.* → io.file-write
\`\`\`
**사용 사례**: 텍스트 파일 변환, 데이터 전처리

### [기본] 패턴 2: 파일 → 분할 → LLM 처리
\`\`\`
io.file-read → transform.text-split → llm.chat → viz.text
\`\`\`
**사용 사례**: 긴 문서 요약, 청크별 분석

### [기본] 패턴 3: RAG 파이프라인
\`\`\`
io.file-read → transform.text-split → llm.embed → storage.vector-store
                                                          ↓
                                  storage.vector-search ← (query)
                                          ↓
                                      llm.chat → viz.text
\`\`\`
**사용 사례**: 문서 검색 기반 질의응답

### [기본] 패턴 4: 데이터 분석
\`\`\`
io.file-read → transform.csv-parse → transform.json-query → viz.table
                                              ↓
                                          viz.chart
                                              ↓
                                          viz.stats
\`\`\`
**사용 사례**: CSV/JSON 데이터 분석 및 시각화

### [기본] 패턴 5: 병렬 처리
\`\`\`
io.file-list → control.forEach → [처리 노드] → control.merge → viz.json
\`\`\`
**사용 사례**: 여러 파일 일괄 처리

### [기본] 패턴 6: 조건부 분기
\`\`\`
[입력] → control.if → (true) → [처리 A]
                  ↓
              (false) → [처리 B]
\`\`\`
**사용 사례**: 조건에 따른 다른 처리 로직

---

### [Vision] 패턴 7: 이미지 분석 파이프라인
\`\`\`
io.file-read → vision.analyze → llm.chat → viz.text
                    ↓
              vision.extract → transform.json-query → viz.table
\`\`\`
**사용 사례**: 이미지에서 정보 추출 및 분석

### [Vision] 패턴 8: 다중 이미지 비교
\`\`\`
io.file-list → control.forEach → vision.analyze → control.merge → vision.compare → viz.json
\`\`\`
**사용 사례**: 제품 이미지 비교, 변화 감지

### [Vision] 패턴 9: OCR + 문서 처리
\`\`\`
io.file-read → vision.ocr-advanced → transform.text-template → llm.chat → viz.text
                       ↓
                transform.json-parse → storage.sqlite-query
\`\`\`
**사용 사례**: 스캔 문서 디지털화, 영수증 처리

---

### [VLM] 패턴 10: VLM 모델 벤치마킹
\`\`\`
vlm.dataset-builder → vlm.benchmark → viz.table
                            ↓
                       viz.chart → export.pdf
\`\`\`
**사용 사례**: VLM 모델 성능 비교 평가

### [VLM] 패턴 11: 프롬프트 최적화
\`\`\`
io.file-read → vlm.experiment → vlm.prompt-optimizer → llm.chat → viz.text
                    ↓
              viz.stats (성능 지표)
\`\`\`
**사용 사례**: 최적 프롬프트 발견 및 적용

### [VLM] 패턴 12: A/B 테스트 파이프라인
\`\`\`
io.file-list → vlm.experiment → transform.json-query → control.if → [최적 모델 선택]
                                       ↓
                                  viz.chart
\`\`\`
**사용 사례**: 다중 모델/프롬프트 비교 실험

---

### [Agent] 패턴 13: ReAct 에이전트
\`\`\`
variable.input → agent.react → viz.text
                     ↓
              [동적 도구 호출] → llm.chat → [루프 또는 종료]
\`\`\`
**사용 사례**: 추론+행동 기반 자율 에이전트

### [Agent] 패턴 14: 도구 활용 에이전트
\`\`\`
variable.input → agent.tool-use → [자동 도구 선택]
                       ↓
                  llm.chat → viz.json
\`\`\`
**사용 사례**: 함수 호출 기반 AI 에이전트

### [Agent] 패턴 15: 멀티 에이전트 협업
\`\`\`
variable.input → agent.planner → agent.multi
                                      ↓
                        [에이전트 A] ↔ [에이전트 B] ↔ [에이전트 C]
                                      ↓
                              control.merge → viz.text
\`\`\`
**사용 사례**: 복잡한 작업의 분할 및 협업 처리

### [Agent] 패턴 16: 계획 기반 작업 처리
\`\`\`
variable.input → agent.planner → control.forEach → [작업 노드]
                      ↓
                viz.table (계획 시각화) → control.merge → viz.text
\`\`\`
**사용 사례**: 복잡한 작업 분해 및 순차 실행

---

### [ML] 패턴 17: 분류 파이프라인
\`\`\`
io.file-read → transform.csv-parse → ml.feature-engineering → ml.classify
                                                                    ↓
                                                              viz.table → viz.chart
\`\`\`
**사용 사례**: 텍스트/데이터 분류, 감성 분석

### [ML] 패턴 18: 클러스터링 분석
\`\`\`
io.file-read → transform.csv-parse → ml.feature-engineering → ml.cluster
                                                                    ↓
                                                              viz.chart (scatter)
                                                                    ↓
                                                              viz.stats
\`\`\`
**사용 사례**: 고객 세분화, 이상 탐지

### [ML] 패턴 19: 예측 모델링
\`\`\`
io.file-read → ml.feature-engineering → ml.regression → viz.chart
                                               ↓
                                         viz.stats (R², RMSE)
\`\`\`
**사용 사례**: 매출 예측, 수요 예측

### [ML] 패턴 20: LLM + ML 하이브리드
\`\`\`
io.file-read → llm.embed → ml.cluster → transform.json-query
                                 ↓
                           llm.chat (클러스터 해석) → viz.text
\`\`\`
**사용 사례**: 문서 주제 분류, 의미 기반 그룹화

---

### [Export] 패턴 21: 분석 보고서 생성
\`\`\`
io.file-read → transform.csv-parse → viz.chart
                                          ↓
                                     viz.stats
                                          ↓
     llm.chat (요약 생성) → export.docx → io.file-write
\`\`\`
**사용 사례**: 데이터 분석 보고서 자동 생성

### [Export] 패턴 22: 프레젠테이션 생성
\`\`\`
io.file-read → llm.chat (슬라이드 구성) → export.pptx
                      ↓
              viz.chart → [슬라이드 삽입]
\`\`\`
**사용 사례**: 발표 자료 자동 생성

### [Export] 패턴 23: PDF 보고서
\`\`\`
transform.csv-parse → viz.table → export.pdf
            ↓
      viz.chart → [PDF 삽입]
            ↓
      llm.chat (해석) → [PDF 삽입]
\`\`\`
**사용 사례**: 정형 PDF 보고서 생성

### [Export] 패턴 24: 엑셀 데이터 내보내기
\`\`\`
io.file-read → transform.json-query → export.xlsx
                       ↓
                viz.stats → [시트 추가]
\`\`\`
**사용 사례**: 분석 결과 엑셀 내보내기

---

### [복합] 패턴 25: 문서 심사 에이전트
\`\`\`
io.file-read → doc.parse → llm.chat (1차 분석)
                                  ↓
                           agent.react (심사 기준 적용)
                                  ↓
                           control.if (합격 여부)
                                  ↓
                    export.docx (심사 보고서) → io.file-write
\`\`\`
**사용 사례**: 문서 자동 심사 시스템

### [복합] 패턴 26: 멀티모달 데이터 처리
\`\`\`
io.file-list → control.forEach
                    ↓
         control.switch (파일 타입)
              ↓         ↓         ↓
         [image]    [text]    [audio]
              ↓         ↓         ↓
    vision.analyze  doc.parse  [외부MCP]
              ↓         ↓         ↓
         control.merge → llm.chat → viz.text
\`\`\`
**사용 사례**: 다양한 형식의 파일 통합 처리

### [복합] 패턴 27: 실시간 모니터링 + 알림
\`\`\`
io.http-request (API 폴링) → transform.json-query
                                      ↓
                               control.if (임계값 초과)
                                      ↓
                       llm.chat (알림 메시지 생성) → io.http-request (알림 전송)
\`\`\`
**사용 사례**: 시스템 모니터링, 알림 자동화

### [복합] 패턴 28: 데이터 파이프라인 + ETL
\`\`\`
io.file-list → control.forEach → doc.parse → transform.json-query
                                                      ↓
                                              ml.feature-engineering
                                                      ↓
                                              storage.sqlite-query
                                                      ↓
                                              export.xlsx
\`\`\`
**사용 사례**: 대량 데이터 ETL 파이프라인

### [복합] 패턴 29: 연구 실험 파이프라인
\`\`\`
vlm.dataset-builder → control.forEach → vlm.experiment
                                              ↓
                                       vlm.benchmark
                                              ↓
                                       viz.stats
                                              ↓
                                       export.pdf (실험 보고서)
\`\`\`
**사용 사례**: VLM 연구 실험 자동화

### [복합] 패턴 30: 지능형 문서 생성
\`\`\`
variable.input → agent.planner → llm.chat (초안 작성)
                      ↓
               vision.analyze (참조 이미지)
                      ↓
               llm.chat (이미지 설명 통합)
                      ↓
               export.docx → io.file-write
\`\`\`
**사용 사례**: AI 기반 문서 자동 작성

---

## 고급 조합 패턴 (Vision + ML + Agent)

### [고급] 패턴 31: OCR → ML 분류 → 에이전트 검증
\`\`\`
io.file-list (이미지들)
    ↓
control.forEach
    ↓
vision.ocr-advanced → ml.classify (문서 유형 분류)
                           ↓
                    control.switch (유형별 분기)
                           ↓
                    agent.react (유형별 처리)
                           ↓
                    storage.kv-set (결과 저장)
\`\`\`
**사용 사례**: 스캔 문서 자동 분류 및 처리

### [고급] 패턴 32: 이미지 클러스터링 + VLM 분석
\`\`\`
io.file-list → control.forEach → vision.analyze
                                       ↓
                               llm.embed (이미지 설명 임베딩)
                                       ↓
                               control.merge → ml.cluster
                                                    ↓
                                             vlm.experiment (클러스터별 분석)
                                                    ↓
                                             viz.chart + export.pdf
\`\`\`
**사용 사례**: 대량 이미지 의미 기반 분류

### [고급] 패턴 33: 멀티 에이전트 + ML 앙상블
\`\`\`
io.file-read → ml.feature-engineering
                      ↓
               agent.planner (분석 전략 수립)
                      ↓
               agent.multi (mode: parallel)
                  ├── ml.classify (분류 에이전트)
                  ├── ml.cluster (클러스터링 에이전트)
                  └── ml.regression (예측 에이전트)
                      ↓
               control.merge → llm.chat (종합 해석)
                                    ↓
                              viz.stats + export.docx
\`\`\`
**사용 사례**: ML 앙상블 분석 시스템

### [고급] 패턴 34: Vision + RAG + 에이전트
\`\`\`
io.file-read (이미지)
    ↓
vision.analyze → llm.embed → storage.vector-store
                                   ↓
               storage.vector-search ← variable.input (질문)
                      ↓
               agent.tool-use (추가 분석 결정)
                      ↓
               llm.chat (최종 답변) → viz.text
\`\`\`
**사용 사례**: 이미지 기반 질의응답 시스템

### [고급] 패턴 35: 다단계 품질 검증 파이프라인
\`\`\`
io.file-read → doc.parse
                   ↓
            llm.structured (1차 검증: 형식)
                   ↓
            ml.classify (2차 검증: 품질 점수)
                   ↓
            agent.react (3차 검증: 규정 준수)
                   ↓
            vlm.benchmark (4차 검증: 일관성)
                   ↓
            control.if → (합격) export.docx
                    ↓
               (불합격) llm.chat (개선 제안)
\`\`\`
**사용 사례**: 문서 품질 다단계 검증

---

## 도메인 특화 패턴

### [도메인] 패턴 36: 의료 영상 분석
\`\`\`
io.file-read (DICOM/이미지)
    ↓
vision.analyze (의료 영상 분석)
    ↓
llm.structured (schema: 의료 소견)
    ↓
ml.classify (질환 분류)
    ↓
agent.react (진단 보조)
    ↓
export.docx (소견서) + storage.sqlite-query (기록)
\`\`\`
**주의**: 의료용으로 사용 시 규정 확인 필요

### [도메인] 패턴 37: 법률 문서 분석
\`\`\`
io.file-read (계약서)
    ↓
doc.parse → transform.text-split
                   ↓
            llm.embed → storage.vector-store
                   ↓
            agent.planner (분석 계획)
                   ↓
            agent.multi (mode: discussion)
                ├── 계약 조항 분석 에이전트
                ├── 리스크 평가 에이전트
                └── 법률 준수 에이전트
                   ↓
            control.merge → export.docx (법률 검토서)
\`\`\`
**사용 사례**: 계약서 자동 검토

### [도메인] 패턴 38: 금융 데이터 분석
\`\`\`
io.http-request (금융 API)
    ↓
transform.json-parse → ml.feature-engineering
                             ↓
                      ml.regression (가격 예측)
                             ↓
                      control.if (리스크 임계값)
                             ↓
                      llm.chat (분석 해설)
                             ↓
                      viz.chart (시계열) + viz.stats
                             ↓
                      export.xlsx (리포트)
\`\`\`
**사용 사례**: 금융 시계열 분석 및 예측

### [도메인] 패턴 39: 건설/엔지니어링 심사
\`\`\`
io.file-list (기술 보고서들)
    ↓
control.forEach
    ↓
doc.parse → llm.structured (기술 스펙 추출)
                   ↓
            agent.react (심사 기준 적용)
                   ↓
            ml.classify (등급 분류)
                   ↓
control.merge → viz.table (심사 결과표)
                   ↓
            export.docx (심사 보고서)
\`\`\`
**사용 사례**: 건설 신기술 심사

### [도메인] 패턴 40: 제조업 품질 관리
\`\`\`
io.file-list (제품 이미지)
    ↓
control.forEach
    ↓
vision.analyze (결함 검출)
    ↓
ml.classify (결함 유형)
    ↓
control.if (심각도)
    ├── (critical) io.http-request (알림)
    └── (normal) storage.sqlite-query (로깅)
    ↓
viz.chart (품질 트렌드) + export.xlsx
\`\`\`
**사용 사례**: 제품 품질 자동 검사

---

## 자동화 패턴

### [자동화] 패턴 41: 이메일 자동 처리
\`\`\`
io.http-request (이메일 API)
    ↓
transform.json-query (이메일 필터링)
    ↓
llm.structured (의도 분류, 우선순위)
    ↓
control.switch (카테고리별)
    ├── 문의 → agent.react (자동 답변 생성)
    ├── 요청 → agent.planner (작업 생성)
    └── 정보 → storage.kv-set (저장)
    ↓
io.http-request (답변 전송)
\`\`\`
**사용 사례**: 이메일 자동 분류 및 답변

### [자동화] 패턴 42: 보고서 정기 생성
\`\`\`
control.loop (일간/주간/월간)
    ↓
io.http-request (데이터 수집)
    ↓
transform.csv-parse → viz.chart + viz.stats
                           ↓
                     llm.chat (분석 코멘트)
                           ↓
                     export.pdf + export.xlsx
                           ↓
                     io.http-request (이메일 발송)
\`\`\`
**사용 사례**: 정기 보고서 자동화

### [자동화] 패턴 43: 데이터 동기화
\`\`\`
io.http-request (소스 API)
    ↓
transform.json-query (변경분 추출)
    ↓
control.if (변경 여부)
    ↓
ml.feature-engineering (데이터 변환)
    ↓
storage.sqlite-query (저장)
    ↓
io.http-request (대상 API 업데이트)
\`\`\`
**사용 사례**: 시스템 간 데이터 동기화

---

## 에러 처리 패턴

### [에러] 패턴 44: 재시도 로직
\`\`\`
variable.input → [처리 노드]
                      ↓
               control.if (성공 여부)
                   ├── (성공) → 다음 단계
                   └── (실패) → control.loop (최대 3회)
                                      ↓
                               [처리 노드 재시도]
                                      ↓
                               control.if (재시도 성공?)
                                   └── (실패) → debug.log + viz.text (에러 알림)
\`\`\`
**사용 사례**: 불안정한 API 호출 처리

### [에러] 패턴 45: Fallback 체인
\`\`\`
variable.input → llm.chat (주 모델)
                      ↓
               control.if (응답 품질)
                   ├── (양호) → 다음 단계
                   └── (불량) → llm.chat (대체 모델)
                                      ↓
                               control.if (재시도 품질)
                                   └── (불량) → llm.structured (규칙 기반)
\`\`\`
**사용 사례**: LLM 응답 품질 보장

---

## 성능 최적화 패턴

### [최적화] 패턴 46: 캐시 활용
\`\`\`
variable.input → storage.kv-get (캐시 확인)
                      ↓
               control.if (캐시 존재?)
                   ├── (있음) → 캐시 결과 사용
                   └── (없음) → [처리 파이프라인]
                                      ↓
                               storage.kv-set (결과 캐시)
\`\`\`
**사용 사례**: 반복 요청 최적화

### [최적화] 패턴 47: 배치 처리
\`\`\`
io.file-list → transform.json-query (N개씩 그룹)
                      ↓
               control.forEach (배치 단위)
                      ↓
               [병렬 처리] → control.merge
                      ↓
               viz.stats (처리 통계)
\`\`\`
**사용 사례**: 대량 파일 효율적 처리

---

## 하이브리드 AI 패턴

### [하이브리드] 패턴 48: LLM + 규칙 기반 검증
\`\`\`
variable.input → llm.chat (자유 형식 생성)
                      ↓
               llm.structured (규칙 스키마 적용)
                      ↓
               control.if (규칙 준수?)
                   ├── (준수) → 출력
                   └── (위반) → llm.chat (수정 요청) → 재검증
\`\`\`
**사용 사례**: 창의성 + 정확성 조합

### [하이브리드] 패턴 49: 인간-AI 협업
\`\`\`
variable.input → agent.planner (작업 분해)
                      ↓
               control.forEach
                   ├── (자동화 가능) → [AI 처리]
                   └── (수동 필요) → debug.breakpoint (인간 개입)
                      ↓
               control.merge → llm.chat (종합)
\`\`\`
**사용 사례**: 반자동 워크플로우

### [하이브리드] 패턴 50: 앙상블 의사결정
\`\`\`
variable.input → agent.multi (mode: voting)
                      ├── llm.chat (Claude)
                      ├── llm.chat (GPT)
                      └── ml.classify (ML 모델)
                      ↓
               control.merge (투표 집계)
                      ↓
               control.if (합의 도달?)
                   ├── (예) → 최종 결정
                   └── (아니오) → agent.react (추가 분석)
\`\`\`
**사용 사례**: 중요 의사결정 신뢰도 향상
`

// ============================================================
// 연결 규칙
// ============================================================

const CONNECTION_RULES = `
## 노드 연결 규칙 (72개 노드, 32개 데이터 타입)

### 기본 타입 호환성 매트릭스

| 출력 타입 | 연결 가능한 입력 타입 |
|----------|---------------------|
| \`text\` | text, any, llm-response, analysis, report |
| \`json\` | json, any, table-data, chart-data, structured-data, ml-result |
| \`llm-response\` | text, llm-response, any, analysis |
| \`text[]\` | text[], chunk[], any |
| \`vector\` | vector, vector[], any |
| \`vector[]\` | vector[], any |
| \`search-result[]\` | search-result[], json, any |
| \`file-ref\` | file-ref, text, any, image, document |
| \`any\` | 모든 타입 |

### Vision/VLM 타입 호환성

| 출력 타입 | 연결 가능한 입력 타입 |
|----------|---------------------|
| \`image\` | image, file-ref, any, image[] |
| \`image[]\` | image[], any, file-ref[] |
| \`analysis\` | analysis, text, json, any |
| \`evaluation\` | evaluation, json, any |
| \`benchmark-result\` | benchmark-result, json, evaluation, any |
| \`ocr-result\` | ocr-result, text, json, any |

### Agent 타입 호환성

| 출력 타입 | 연결 가능한 입력 타입 |
|----------|---------------------|
| \`agent-output\` | agent-output, json, text, any |
| \`plan\` | plan, json, any |
| \`tool-call\` | tool-call, json, any |

### ML 타입 호환성

| 출력 타입 | 연결 가능한 입력 타입 |
|----------|---------------------|
| \`ml-result\` | ml-result, json, any, table-data |
| \`model\` | model, any |
| \`features\` | features, json, any |
| \`prediction\` | prediction, json, ml-result, any |

### Export 타입 호환성

| 출력 타입 | 연결 가능한 입력 타입 |
|----------|---------------------|
| \`docx\` | docx, document, file-ref, any |
| \`pptx\` | pptx, document, file-ref, any |
| \`pdf\` | pdf, document, file-ref, any |
| \`xlsx\` | xlsx, document, file-ref, table-data, any |

### 연결 규칙

1. **포트 타입 일치**: 출력 포트 타입이 입력 포트 타입과 호환되어야 함
2. **사이클 금지**: 워크플로우는 DAG(방향 비순환 그래프)여야 함
3. **필수 입력**: [필수] 표시된 입력 포트는 반드시 연결되어야 함
4. **단일 소스**: 하나의 입력 포트는 하나의 출력 포트에서만 연결받음
5. **타입 변환**: \`transform.*\` 노드를 사용하여 타입 변환 가능
6. **분기 처리**: \`control.*\` 노드로 조건부 분기 및 병렬 처리
7. **에이전트 연결**: \`agent.*\` 노드는 내부적으로 다른 노드를 호출할 수 있음
8. **ML 파이프라인**: \`ml.feature-engineering\` → \`ml.classify/cluster/regression\` 순서 권장
`

// ============================================================
// 전체 시스템 프롬프트 생성
// ============================================================

/**
 * 노드 카탈로그 생성 (카테고리별 그룹화, 상세 스펙)
 */
export function generateNodeCatalog(): string {
  const definitions = NodeRegistry.getAll()
  const categories = NodeRegistry.getCategories()

  let catalog = ''

  for (const category of categories) {
    const categoryNodes = definitions.filter(d =>
      d.category === category.id && !d.type.includes('legacy:')
    )
    if (categoryNodes.length === 0) continue

    catalog += `\n### ${category.label} (${categoryNodes.length}개 노드)\n`

    for (const def of categoryNodes) {
      catalog += generateNodeSpec(def)
    }
  }

  return catalog
}

/**
 * 간략 노드 목록 생성 (빠른 참조용)
 */
export function generateNodeSummary(): string {
  const definitions = NodeRegistry.getAll()
    .filter(d => !d.type.includes('legacy:'))

  const categories = NodeRegistry.getCategories()

  let summary = ''

  for (const category of categories) {
    const categoryNodes = definitions.filter(d => d.category === category.id)
    if (categoryNodes.length === 0) continue

    summary += `**${category.label}**: `
    summary += categoryNodes.map(d => `\`${d.type}\` (${d.meta.label})`).join(', ')
    summary += '\n'
  }

  return summary
}

// ============================================================
// 세밀한 튜닝 가이드
// ============================================================

const FINE_TUNING_GUIDE = `
## 세밀한 워크플로우 튜닝 가이드

### 1. LLM 노드 세밀 조정

#### llm.chat 설정
- \`temperature\`: 0.0 (결정적) ~ 1.0 (창의적)
  - 요약/추출: 0.0-0.3 권장
  - 창작/아이디어: 0.7-1.0 권장
- \`max_tokens\`: 응답 길이 제한 (100-4000)
- \`model\`: claude-3-opus (최고 품질), claude-3-sonnet (균형), claude-3-haiku (빠름)
- \`system_prompt\`: 역할/컨텍스트 정의 (상세할수록 품질 향상)

#### llm.structured 설정
- \`json_schema\`: 정확한 출력 스키마 정의
- \`strict\`: true면 스키마 위반 시 에러
- 복잡한 구조 추출에 필수

### 2. Vision 노드 세밀 조정

#### vision.analyze 설정
- \`model\`: claude-3-opus-vision, gpt-4-vision-preview
- \`detail_level\`: low (빠름), high (상세), auto
- \`aspects[]\`: color, composition, text, objects, faces, scene (분석 대상 선택)

#### vision.ocr-advanced 설정
- \`language\`: ko (한국어), en, ja, zh (언어 지정으로 정확도 향상)
- \`preserve_layout\`: true면 원본 레이아웃 유지
- \`confidence_threshold\`: 0.8 이상 권장

### 3. Agent 노드 세밀 조정

#### agent.react 설정
- \`max_iterations\`: 추론-행동 루프 최대 횟수 (3-10)
- \`tools[]\`: 에이전트가 사용할 노드 타입 목록
- \`stop_conditions\`: 종료 조건 (정답 발견, 반복 한계 등)

#### agent.multi 설정
- \`mode\`: sequential (순차), parallel (병렬), discussion (토론), voting (투표)
- \`agents[]\`: 각 에이전트의 역할 정의
- \`consensus_threshold\`: voting 모드에서 합의 기준 (0.5-1.0)

### 4. ML 노드 세밀 조정

#### ml.classify 설정
- \`algorithm\`: random_forest (기본), svm, naive_bayes, gradient_boosting
- \`test_split\`: 테스트 데이터 비율 (0.1-0.3)
- \`n_estimators\`: 트리 수 (RF: 100-500)
- \`cross_validation\`: k-fold 수 (5-10)

#### ml.cluster 설정
- \`algorithm\`: kmeans (기본), dbscan, hierarchical, gmm
- \`n_clusters\`: 클러스터 수 (kmeans)
- \`eps\`: 이웃 반경 (dbscan)
- \`min_samples\`: 최소 샘플 수 (dbscan)

### 5. Export 노드 세밀 조정

#### export.docx 설정
- \`template\`: 템플릿 파일 경로 (스타일 유지)
- \`styles\`: 커스텀 스타일 정의
- \`sections[]\`: 섹션별 내용 배열

#### export.pptx 설정
- \`template\`: 마스터 슬라이드 템플릿
- \`slides[]\`: 슬라이드 정의 (title, content, layout)
- \`theme\`: 색상 테마

### 6. 성능 최적화 팁

1. **병렬 처리**: \`control.forEach\` + 독립 노드 조합
2. **조건부 스킵**: \`control.if\` + \`control.gate\`로 불필요한 처리 방지
3. **캐싱**: \`storage.kv-*\`로 중간 결과 캐시
4. **청크 크기**: \`transform.text-split\`의 chunk_size 조정 (500-2000)
5. **벡터 검색**: \`storage.vector-hybrid\`로 키워드+시맨틱 결합

### 7. 에러 처리 전략

1. \`control.if\`로 null/empty 체크
2. \`debug.log\`로 중간 상태 확인
3. \`debug.breakpoint\`로 디버깅 지점 설정
4. 분기 처리로 fallback 경로 구성
`

// ============================================================
// 복잡한 시나리오 예시
// ============================================================

const COMPLEX_SCENARIOS = `
## 복잡한 워크플로우 시나리오 예시

### 시나리오 1: 다중 문서 심사 시스템 (5+ 노드)
\`\`\`
사용자 요청: "여러 PDF 보고서를 읽어서 각각 평가하고, 합격/불합격으로 분류한 뒤 종합 보고서를 생성해줘"

워크플로우:
io.file-list (PDF 목록)
    ↓
control.forEach
    ↓
doc.parse (PDF → 텍스트)
    ↓
llm.structured (평가 스키마에 따른 점수화)
    ↓
control.if (합격 기준 충족?)
    ├── (true) → storage.kv-set (합격 목록)
    └── (false) → storage.kv-set (불합격 목록)
    ↓
control.merge (결과 통합)
    ↓
llm.chat (종합 분석)
    ↓
export.docx (최종 보고서)
\`\`\`

### 시나리오 2: 이미지 기반 데이터 추출 + 분석 (7+ 노드)
\`\`\`
사용자 요청: "폴더 내 모든 영수증 이미지에서 금액과 날짜를 추출하고, 월별로 집계해서 차트로 보여줘"

워크플로우:
io.file-list (이미지 목록)
    ↓
control.forEach
    ↓
vision.ocr-advanced (영수증 OCR)
    ↓
vision.extract (금액, 날짜 구조화)
    ↓
control.merge (전체 데이터 통합)
    ↓
transform.json-query (월별 집계)
    ↓
viz.chart (월별 지출 차트)
    ↓
viz.stats (통계 요약)
    ↓
export.xlsx (엑셀 내보내기)
\`\`\`

### 시나리오 3: 멀티 에이전트 연구 시스템 (10+ 노드)
\`\`\`
사용자 요청: "연구 논문을 분석하는 3명의 전문가 에이전트가 토론하고, 최종 합의를 도출해줘"

워크플로우:
io.file-read (논문 PDF)
    ↓
doc.parse (텍스트 추출)
    ↓
agent.planner (분석 계획 수립)
    ↓
agent.multi (mode: discussion)
    ├── 에이전트 A: 방법론 전문가
    ├── 에이전트 B: 데이터 분석 전문가
    └── 에이전트 C: 결론 검증 전문가
    ↓
control.merge (토론 결과 통합)
    ↓
llm.chat (합의 도출)
    ↓
viz.text (분석 결과)
    ↓
export.docx (전문가 분석 보고서)
\`\`\`

### 시나리오 4: ML 기반 문서 분류 시스템 (8+ 노드)
\`\`\`
사용자 요청: "수백 개의 문서를 자동으로 카테고리별로 분류하고, 각 카테고리의 특성을 요약해줘"

워크플로우:
io.file-list (문서 목록)
    ↓
control.forEach
    ↓
doc.parse (텍스트 추출)
    ↓
llm.embed (임베딩 생성)
    ↓
control.merge (전체 임베딩)
    ↓
ml.cluster (algorithm: kmeans, n_clusters: auto)
    ↓
control.forEach (각 클러스터)
    ↓
llm.chat (클러스터 특성 요약)
    ↓
viz.table (분류 결과)
    ↓
viz.chart (카테고리 분포)
\`\`\`

### 시나리오 5: VLM 프롬프트 최적화 실험 (6+ 노드)
\`\`\`
사용자 요청: "여러 VLM 프롬프트를 테스트해서 가장 좋은 프롬프트를 찾아줘"

워크플로우:
vlm.dataset-builder (테스트 데이터셋 구축)
    ↓
vlm.experiment (다중 프롬프트 A/B 테스트)
    ↓
vlm.benchmark (정량 평가)
    ↓
vlm.prompt-optimizer (최적 프롬프트 도출)
    ↓
viz.stats (성능 비교)
    ↓
viz.chart (프롬프트별 점수)
    ↓
export.pdf (실험 보고서)
\`\`\`
`

/**
 * LLM 워크플로우 생성을 위한 전체 시스템 프롬프트 생성
 * 72개 노드 완전 지원, Claude Code 수준의 정밀한 도구 설명 제공
 */
export function generateSystemPrompt(): string {
  const nodeCatalog = generateNodeCatalog()
  const nodeSummary = generateNodeSummary()

  return `# Handbox 워크플로우 생성 에이전트 (v2.0 - 72개 노드 지원)

당신은 Handbox AI 워크플로우 자동화 플랫폼의 전문 에이전트입니다.
사용자의 요청을 분석하고, 정확하고 세밀하게 조정된 워크플로우 JSON을 생성합니다.

## 핵심 역량

1. **72개 노드 완전 지원**: IO, Transform, Storage, LLM, Vision, VLM, Agent, ML, Export 등
2. **세밀한 튜닝**: 각 노드의 모든 설정 파라미터 최적화
3. **복잡한 시나리오**: 10개 이상 노드 조합, 멀티 에이전트, ML 파이프라인
4. **타입 안전성**: 32개 데이터 타입 간 호환성 보장

## 핵심 원칙

1. **정확성**: 반드시 존재하는 노드 타입만 사용 (아래 카탈로그 참조)
2. **호환성**: 타입 호환성 매트릭스에 따라 노드 연결
3. **완결성**: 모든 필수 설정 필드 포함 + 권장 설정 명시
4. **최적화**: 성능과 품질을 고려한 파라미터 튜닝
5. **명확성**: 노드 ID, 라벨, 연결 관계를 명확히 정의

## 빠른 참조: 사용 가능한 노드 (72개)

${nodeSummary}

${CONNECTION_RULES}

${WORKFLOW_PATTERNS}

${FINE_TUNING_GUIDE}

${COMPLEX_SCENARIOS}

## 상세 노드 카탈로그

각 노드의 정확한 입출력 포트, 설정 스키마, 사용 예시를 참조하세요.

${nodeCatalog}

## 워크플로우 JSON 스키마

\`\`\`typescript
interface Workflow {
  version: "2.0.0"
  id: string                    // 고유 ID (예: "wf_1708123456")
  meta: {
    name: string                // 워크플로우 이름
    description: string         // 상세 설명
    tags: string[]              // 태그 (검색용)
    complexity: "simple" | "moderate" | "complex"  // 복잡도 표시
    estimatedDuration: string   // 예상 실행 시간
    createdAt: string           // ISO 8601 형식
    updatedAt: string           // ISO 8601 형식
  }
  nodes: Array<{
    id: string                  // 노드 ID (예: "node_1", "file_read_1")
    type: string                // 노드 타입 (카탈로그의 정확한 타입 사용)
    position: { x: number, y: number }
    data: {
      label: string             // 표시 이름
      description?: string      // 노드 역할 설명
      color?: string            // 색상 (hex)
      config: Record<string, any>  // 노드 설정 (세밀하게 조정)
      enabled?: boolean         // 활성화 상태 (기본: true)
      metadata?: {              // 추가 메타데이터
        priority?: number       // 실행 우선순위
        retryCount?: number     // 실패 시 재시도 횟수
        timeout?: number        // 타임아웃 (ms)
      }
    }
  }>
  edges: Array<{
    id: string                  // 엣지 ID (예: "edge_1_2")
    source: string              // 소스 노드 ID
    target: string              // 타겟 노드 ID
    sourceHandle?: string       // 소스 포트 이름 (선택)
    targetHandle?: string       // 타겟 포트 이름 (선택)
    animated?: boolean          // 애니메이션 (기본: true)
    label?: string              // 엣지 라벨 (데이터 흐름 설명)
  }>
  variables?: Record<string, any>  // 워크플로우 변수
  settings?: {
    errorHandling: "stop" | "skip" | "retry"
    logLevel: "debug" | "info" | "warn" | "error"
    parallelExecution: boolean
  }
}
\`\`\`

## 응답 형식

### 1. 정보가 부족할 때: 역질문
요구사항이 불명확하면 **구체적인 질문**으로 구체화합니다:
- "평가위원은 몇 명이 필요한가요?"
- "합격 기준 점수는 몇 점인가요?"
- "결과를 어떤 형식으로 원하시나요? (보고서, 엑셀, JSON)"

역질문은 워크플로우 품질을 위해 중요합니다. 충분한 정보를 얻을 때까지 질문하세요.

### 2. 정보가 충분할 때: 워크플로우 생성

**응답 텍스트는 1-2문장으로 간결하게** 작성하세요.
워크플로우는 UI에서 미리보기로 표시되므로 긴 설명이 필요 없습니다.

응답 예시:
"10명의 AI 평가위원이 RAG 검색 후 2/3 다수결로 심사하는 워크플로우를 생성했습니다."

**중요**: JSON은 \`\`\`json 코드 블록으로 생성해야 시스템이 추출할 수 있습니다.
하지만 사용자에게 JSON 내용을 설명할 필요는 없습니다 - UI가 보여줍니다.

\`\`\`json
{ "version": "2.0.0", "nodes": [...], "edges": [...] }
\`\`\`

**절대 하지 말 것:**
- 단계별 설계 설명 ("1단계: 파일 읽기, 2단계: 분석...")
- ASCII 아키텍처 다이어그램
- "설계 설명:", "아키텍처:" 같은 섹션
- JSON 구조에 대한 장황한 설명
- 불완전한 JSON (반드시 끝까지 생성)

## 중요 제약사항

1. **존재하지 않는 노드 타입 사용 금지** - 카탈로그에 있는 72개 타입만 사용
2. **타입 불일치 연결 금지** - 32개 타입 호환성 매트릭스 준수
3. **순환 연결 금지** - DAG 구조 유지
4. **필수 필드 누락 금지** - [필수] 표시 설정 반드시 포함
5. **적절한 복잡도** - 요청에 맞는 수준의 워크플로우 (과도한 복잡도 지양)
6. **시작 노드 연결 금지** - 다음 노드들은 입력 포트가 없는 시작 노드이므로 다른 노드에서 연결할 수 없습니다:
   - \`io.local-folder\` - 폴더 입력 (시작 노드)
   - \`io.local-file\` - 파일 입력 (시작 노드)
   - \`data.file-loader\` - 데이터 로더 (시작 노드)
   - \`variable.input\` - 변수 입력 (시작 노드)
   - ❌ 잘못된 연결: \`io.local-file → data.file-loader\` (둘 다 시작 노드)
   - ✅ 올바른 사용: 시작 노드는 워크플로우의 첫 번째 노드로만 사용

## 응답 언어

사용자가 한국어로 작성하면 한국어로 응답합니다.
사용자의 전문성 수준에 맞춰 설명 수준을 조절합니다.
`
}

/**
 * 대화 기록을 프롬프트 문자열로 변환
 */
export function formatConversationHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  return messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
}

// ============================================================
// 워크플로우 검증 유틸리티
// ============================================================

/**
 * 워크플로우 JSON 검증
 */
export function validateWorkflowJSON(workflow: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // 기본 구조 검증
  if (!workflow.version) errors.push('version 필드 누락')
  if (!workflow.id) errors.push('id 필드 누락')
  if (!workflow.nodes || !Array.isArray(workflow.nodes)) errors.push('nodes 배열 필수')
  if (!workflow.edges) workflow.edges = []

  // 노드 검증
  const nodeIds = new Set<string>()
  for (const node of workflow.nodes || []) {
    if (!node.id) {
      errors.push(`노드 ID 누락`)
      continue
    }
    if (nodeIds.has(node.id)) {
      errors.push(`중복 노드 ID: ${node.id}`)
    }
    nodeIds.add(node.id)

    // 노드 타입 검증
    const def = NodeRegistry.get(node.type)
    if (!def) {
      errors.push(`알 수 없는 노드 타입: ${node.type}`)
      continue
    }

    // 필수 설정 검증
    for (const field of def.configSchema) {
      if (field.required && !node.data?.config?.[field.key]) {
        errors.push(`${node.id}: 필수 설정 누락 - ${field.key}`)
      }
    }
  }

  // 엣지 검증
  for (const edge of workflow.edges || []) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`엣지 ${edge.id}: 존재하지 않는 소스 노드 - ${edge.source}`)
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`엣지 ${edge.id}: 존재하지 않는 타겟 노드 - ${edge.target}`)
    }
    if (edge.source === edge.target) {
      errors.push(`엣지 ${edge.id}: 자기 참조 금지`)
    }
  }

  // 사이클 검증
  if (hasCycle(workflow.nodes || [], workflow.edges || [])) {
    errors.push('워크플로우에 순환 참조가 있습니다')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 사이클 검출 (DFS)
 */
function hasCycle(nodes: any[], edges: any[]): boolean {
  const nodeIds = nodes.map(n => n.id)
  const adj: Map<string, string[]> = new Map()

  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, [])
    adj.get(edge.source)!.push(edge.target)
  }

  const visited: Map<string, number> = new Map() // 0: unvisited, 1: visiting, 2: visited

  function dfs(nodeId: string): boolean {
    visited.set(nodeId, 1)

    for (const neighbor of adj.get(nodeId) || []) {
      const state = visited.get(neighbor) ?? 0
      if (state === 1) return true // back edge = cycle
      if (state === 0 && dfs(neighbor)) return true
    }

    visited.set(nodeId, 2)
    return false
  }

  for (const nodeId of nodeIds) {
    if ((visited.get(nodeId) ?? 0) === 0 && dfs(nodeId)) {
      return true
    }
  }

  return false
}
