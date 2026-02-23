/**
 * Guardrails Service
 *
 * AWS Bedrock Guardrails 수준의 콘텐츠 안전 시스템
 *
 * 기능:
 * 1. PII (개인식별정보) 감지 및 마스킹
 * 2. 프롬프트 인젝션 탐지
 * 3. 민감 콘텐츠 필터링
 * 4. 입력/출력 검증
 */

// ============================================================
// Types
// ============================================================

export interface PIIEntity {
  type: PIIType
  value: string
  masked: string
  start: number
  end: number
  confidence: number
}

export type PIIType =
  | 'EMAIL'
  | 'PHONE_KR'
  | 'PHONE_INTL'
  | 'SSN_KR'           // 주민등록번호
  | 'CREDIT_CARD'
  | 'BANK_ACCOUNT'
  | 'IP_ADDRESS'
  | 'URL'
  | 'ADDRESS_KR'
  | 'NAME_KR'
  | 'PASSPORT'
  | 'DRIVER_LICENSE'

export interface GuardrailConfig {
  // PII 설정
  enablePIIMasking?: boolean
  piiTypesToMask?: PIIType[]
  piiMaskChar?: string

  // 프롬프트 인젝션
  enableInjectionDetection?: boolean
  injectionThreshold?: number

  // 콘텐츠 필터
  enableContentFilter?: boolean
  blockedKeywords?: string[]
  blockedPatterns?: RegExp[]

  // 길이 제한
  maxInputLength?: number
  maxOutputLength?: number
}

export interface GuardrailResult {
  passed: boolean
  processedText: string
  piiDetected: PIIEntity[]
  injectionDetected: boolean
  injectionScore: number
  contentViolations: string[]
  warnings: string[]
}

// ============================================================
// PII Detection Patterns (한국어 + 영어)
// ============================================================

const PII_PATTERNS: Record<PIIType, { pattern: RegExp; mask: (match: string) => string }> = {
  EMAIL: {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: (m) => m.replace(/(.{2})[^@]+(@.+)/, '$1***$2'),
  },

  PHONE_KR: {
    pattern: /(?:010|011|016|017|018|019)[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    mask: () => '010-****-****',
  },

  PHONE_INTL: {
    pattern: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    mask: (m) => m.replace(/(\+\d{1,3}).*/, '$1-****-****'),
  },

  SSN_KR: {
    // 주민등록번호: 6자리-7자리
    pattern: /\d{6}[-.\s]?[1-4]\d{6}/g,
    mask: () => '******-*******',
  },

  CREDIT_CARD: {
    pattern: /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
    mask: (m) => m.replace(/\d{4}[-.\s]?\d{4}[-.\s]?(\d{4})[-.\s]?(\d{4})/, '****-****-$1-$2'),
  },

  BANK_ACCOUNT: {
    // 한국 은행 계좌번호 (다양한 형식)
    pattern: /\d{3,4}[-.\s]?\d{2,4}[-.\s]?\d{4,6}/g,
    mask: () => '***-**-******',
  },

  IP_ADDRESS: {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    mask: () => '***.***.***.***',
  },

  URL: {
    pattern: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
    mask: (m) => {
      try {
        const url = new URL(m)
        return `${url.protocol}//${url.hostname}/***`
      } catch {
        return '[URL MASKED]'
      }
    },
  },

  ADDRESS_KR: {
    // 한국 주소 패턴 (시/도, 구/군, 동/읍/면, 번지)
    pattern: /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*[가-힣]+(?:시|군|구)\s*[가-힣]+(?:동|읍|면|로|길)\s*[\d\-]+(?:번지)?/g,
    mask: () => '[주소 마스킹됨]',
  },

  NAME_KR: {
    // 한국 이름 (2-4글자 한글)
    // 주의: 오탐 가능성 높음, 컨텍스트 기반 사용 권장
    pattern: /[가-힣]{2,4}(?=\s*(?:님|씨|선생|교수|대표|사장|부장|과장|차장|대리|사원|고객))/g,
    mask: (m) => m[0] + '*'.repeat(m.length - 1),
  },

  PASSPORT: {
    // 한국 여권번호
    pattern: /[A-Z]{1,2}\d{7,8}/g,
    mask: () => 'M*******',
  },

  DRIVER_LICENSE: {
    // 한국 운전면허번호
    pattern: /\d{2}-\d{2}-\d{6}-\d{2}/g,
    mask: () => '**-**-******-**',
  },
}

// ============================================================
// Prompt Injection Patterns
// ============================================================

const INJECTION_PATTERNS = [
  // 역할 탈취 시도
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?)/i,
  /forget\s+(?:everything|all|your)\s+(?:instructions?|rules?|training)/i,

  // 시스템 프롬프트 추출 시도
  /(?:show|print|display|reveal|tell)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)/i,
  /what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?)/i,

  // 새 페르소나 주입
  /you\s+are\s+now\s+(?:a|an)\s+/i,
  /from\s+now\s+on\s+you\s+(?:are|will|should)/i,
  /pretend\s+(?:to\s+be|you\s+are)/i,
  /act\s+as\s+(?:if\s+you\s+(?:are|were)|a|an)/i,

  // 출력 형식 조작
  /respond\s+only\s+with/i,
  /output\s+only/i,
  /do\s+not\s+(?:say|mention|include)/i,

  // 한국어 패턴
  /이전\s*(?:지시|명령|규칙).*무시/,
  /시스템\s*프롬프트.*(?:알려|보여|출력)/,
  /지금부터\s*(?:너는|당신은)/,
  /역할.*(?:바꿔|변경)/,
]

// ============================================================
// Content Filter Keywords (예시)
// ============================================================

const DEFAULT_BLOCKED_KEYWORDS: string[] = [
  // 한국어 비속어/혐오 표현 (일부 예시)
  // 실제 운영 시 더 포괄적인 목록 필요
]

// ============================================================
// Guardrails Service
// ============================================================

class GuardrailsService {
  private defaultConfig: GuardrailConfig = {
    enablePIIMasking: true,
    piiTypesToMask: ['EMAIL', 'PHONE_KR', 'SSN_KR', 'CREDIT_CARD', 'BANK_ACCOUNT'],
    piiMaskChar: '*',
    enableInjectionDetection: true,
    injectionThreshold: 0.5,
    enableContentFilter: true,
    blockedKeywords: DEFAULT_BLOCKED_KEYWORDS,
    blockedPatterns: [],
    maxInputLength: 10000,
    maxOutputLength: 50000,
  }

  /**
   * PII 감지 및 마스킹
   */
  detectAndMaskPII(
    text: string,
    typesToMask?: PIIType[],
  ): { maskedText: string; entities: PIIEntity[] } {
    const entities: PIIEntity[] = []
    let maskedText = text
    const types = typesToMask || this.defaultConfig.piiTypesToMask || []

    for (const piiType of types) {
      const config = PII_PATTERNS[piiType]
      if (!config) continue

      // 패턴 복사 (lastIndex 리셋용)
      const pattern = new RegExp(config.pattern.source, config.pattern.flags)
      let match: RegExpExecArray | null

      while ((match = pattern.exec(text)) !== null) {
        const value = match[0]
        const masked = config.mask(value)

        entities.push({
          type: piiType,
          value,
          masked,
          start: match.index,
          end: match.index + value.length,
          confidence: 0.9,  // 패턴 매칭 기반
        })
      }
    }

    // 마스킹 적용 (뒤에서부터 - 인덱스 변경 방지)
    const sortedEntities = [...entities].sort((a, b) => b.start - a.start)
    for (const entity of sortedEntities) {
      maskedText = maskedText.slice(0, entity.start) + entity.masked + maskedText.slice(entity.end)
    }

    return { maskedText, entities }
  }

  /**
   * 프롬프트 인젝션 탐지
   */
  detectInjection(text: string): { detected: boolean; score: number; matches: string[] } {
    const matches: string[] = []
    let score = 0

    for (const pattern of INJECTION_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        matches.push(match[0])
        score += 0.3  // 각 패턴 매칭당 점수 증가
      }
    }

    // 점수 정규화 (0-1)
    score = Math.min(1, score)

    return {
      detected: score >= (this.defaultConfig.injectionThreshold || 0.5),
      score,
      matches,
    }
  }

  /**
   * 콘텐츠 필터링
   */
  filterContent(
    text: string,
    blockedKeywords?: string[],
    blockedPatterns?: RegExp[],
  ): { violations: string[]; passed: boolean } {
    const violations: string[] = []
    const keywords = blockedKeywords || this.defaultConfig.blockedKeywords || []
    const patterns = blockedPatterns || this.defaultConfig.blockedPatterns || []

    // 키워드 검사
    const lowerText = text.toLowerCase()
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        violations.push(`차단된 키워드 감지: "${keyword}"`)
      }
    }

    // 패턴 검사
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push(`차단된 패턴 감지: ${pattern.source}`)
      }
    }

    return {
      violations,
      passed: violations.length === 0,
    }
  }

  /**
   * 입력 검증 (종합)
   */
  validateInput(text: string, config?: Partial<GuardrailConfig>): GuardrailResult {
    const cfg = { ...this.defaultConfig, ...config }
    const warnings: string[] = []
    let processedText = text

    // 길이 검사
    if (cfg.maxInputLength && text.length > cfg.maxInputLength) {
      warnings.push(`입력이 최대 길이(${cfg.maxInputLength})를 초과합니다.`)
      processedText = text.slice(0, cfg.maxInputLength)
    }

    // PII 마스킹
    let piiDetected: PIIEntity[] = []
    if (cfg.enablePIIMasking) {
      const piiResult = this.detectAndMaskPII(processedText, cfg.piiTypesToMask)
      processedText = piiResult.maskedText
      piiDetected = piiResult.entities

      if (piiResult.entities.length > 0) {
        warnings.push(`${piiResult.entities.length}개의 개인정보가 감지되어 마스킹되었습니다.`)
      }
    }

    // 프롬프트 인젝션 탐지
    let injectionDetected = false
    let injectionScore = 0
    if (cfg.enableInjectionDetection) {
      const injectionResult = this.detectInjection(processedText)
      injectionDetected = injectionResult.detected
      injectionScore = injectionResult.score

      if (injectionResult.detected) {
        warnings.push(`프롬프트 인젝션 시도가 감지되었습니다. (점수: ${injectionScore.toFixed(2)})`)
      }
    }

    // 콘텐츠 필터
    let contentViolations: string[] = []
    if (cfg.enableContentFilter) {
      const contentResult = this.filterContent(processedText, cfg.blockedKeywords, cfg.blockedPatterns)
      contentViolations = contentResult.violations
    }

    return {
      passed: !injectionDetected && contentViolations.length === 0,
      processedText,
      piiDetected,
      injectionDetected,
      injectionScore,
      contentViolations,
      warnings,
    }
  }

  /**
   * 출력 검증
   */
  validateOutput(text: string, config?: Partial<GuardrailConfig>): GuardrailResult {
    const cfg = { ...this.defaultConfig, ...config }
    const warnings: string[] = []
    let processedText = text

    // 길이 검사
    if (cfg.maxOutputLength && text.length > cfg.maxOutputLength) {
      warnings.push(`출력이 최대 길이(${cfg.maxOutputLength})를 초과합니다.`)
      processedText = text.slice(0, cfg.maxOutputLength)
    }

    // PII 마스킹 (출력에서도)
    let piiDetected: PIIEntity[] = []
    if (cfg.enablePIIMasking) {
      const piiResult = this.detectAndMaskPII(processedText, cfg.piiTypesToMask)
      processedText = piiResult.maskedText
      piiDetected = piiResult.entities
    }

    // 콘텐츠 필터
    let contentViolations: string[] = []
    if (cfg.enableContentFilter) {
      const contentResult = this.filterContent(processedText, cfg.blockedKeywords, cfg.blockedPatterns)
      contentViolations = contentResult.violations
    }

    return {
      passed: contentViolations.length === 0,
      processedText,
      piiDetected,
      injectionDetected: false,  // 출력에서는 인젝션 검사 불필요
      injectionScore: 0,
      contentViolations,
      warnings,
    }
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<GuardrailConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config }
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): GuardrailConfig {
    return { ...this.defaultConfig }
  }
}

// 싱글톤 인스턴스
export const Guardrails = new GuardrailsService()

// ============================================================
// 편의 함수
// ============================================================

/**
 * 텍스트에서 PII 마스킹
 */
export function maskPII(text: string, types?: PIIType[]): string {
  return Guardrails.detectAndMaskPII(text, types).maskedText
}

/**
 * 프롬프트 인젝션 검사
 */
export function checkInjection(text: string): boolean {
  return Guardrails.detectInjection(text).detected
}

/**
 * 입력 안전성 검증
 */
export function validateInput(text: string): GuardrailResult {
  return Guardrails.validateInput(text)
}

/**
 * 출력 안전성 검증
 */
export function validateOutput(text: string): GuardrailResult {
  return Guardrails.validateOutput(text)
}
