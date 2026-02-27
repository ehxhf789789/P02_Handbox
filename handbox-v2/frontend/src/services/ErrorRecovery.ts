/**
 * ErrorRecovery — Service for handling and recovering from execution errors.
 *
 * Features:
 * - Automatic retry for transient errors
 * - Error classification and diagnostics
 * - Recovery suggestions
 * - Error history tracking
 */

/** Error severity levels */
export type ErrorSeverity = 'warning' | 'error' | 'critical'

/** Error categories for classification */
export type ErrorCategory =
  | 'network'      // Network/API failures
  | 'rate_limit'   // Rate limiting
  | 'auth'         // Authentication errors
  | 'validation'   // Input validation errors
  | 'timeout'      // Timeout errors
  | 'resource'     // Resource exhaustion
  | 'config'       // Configuration errors
  | 'unknown'      // Unknown errors

/** Classified error with metadata */
export interface ClassifiedError {
  id: string
  nodeId: string
  timestamp: string
  category: ErrorCategory
  severity: ErrorSeverity
  message: string
  originalError: string
  stackTrace?: string
  retryCount: number
  maxRetries: number
  canRetry: boolean
  recoveryOptions: RecoveryOption[]
}

/** Recovery option for an error */
export interface RecoveryOption {
  id: string
  label: string
  description: string
  action: 'retry' | 'skip' | 'modify' | 'fallback' | 'abort'
  automatic?: boolean
}

/** Retry policy configuration */
export interface RetryPolicy {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableCategories: ErrorCategory[]
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableCategories: ['network', 'rate_limit', 'timeout'],
}

/** Error patterns for classification */
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  category: ErrorCategory
  severity: ErrorSeverity
}> = [
  // Network errors
  { pattern: /network|fetch|connection|ECONNREFUSED/i, category: 'network', severity: 'error' },
  { pattern: /timeout|ETIMEDOUT/i, category: 'timeout', severity: 'error' },

  // Rate limiting
  { pattern: /rate.?limit|too.?many.?requests|429/i, category: 'rate_limit', severity: 'warning' },
  { pattern: /quota|exceeded/i, category: 'rate_limit', severity: 'warning' },

  // Authentication
  { pattern: /unauthorized|403|401|auth|credential|token/i, category: 'auth', severity: 'critical' },
  { pattern: /permission|denied|forbidden/i, category: 'auth', severity: 'critical' },

  // Validation
  { pattern: /invalid|validation|required|missing/i, category: 'validation', severity: 'error' },
  { pattern: /type.?error|expected/i, category: 'validation', severity: 'error' },

  // Resource
  { pattern: /memory|out.?of.?memory|heap/i, category: 'resource', severity: 'critical' },
  { pattern: /disk|storage|space/i, category: 'resource', severity: 'error' },

  // Configuration
  { pattern: /config|setting|option|parameter/i, category: 'config', severity: 'error' },
]

/**
 * Classify an error based on its message
 */
export function classifyError(
  error: string | Error,
  nodeId: string,
  retryCount = 0,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : error
  const stackTrace = error instanceof Error ? error.stack : undefined

  // Find matching pattern
  let category: ErrorCategory = 'unknown'
  let severity: ErrorSeverity = 'error'

  for (const { pattern, category: cat, severity: sev } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      category = cat
      severity = sev
      break
    }
  }

  // Check if error is retryable
  const canRetry =
    retryCount < policy.maxRetries &&
    policy.retryableCategories.includes(category)

  // Generate recovery options
  const recoveryOptions = generateRecoveryOptions(category, canRetry)

  return {
    id: crypto.randomUUID(),
    nodeId,
    timestamp: new Date().toISOString(),
    category,
    severity,
    message: getHumanReadableMessage(category, errorMessage),
    originalError: errorMessage,
    stackTrace,
    retryCount,
    maxRetries: policy.maxRetries,
    canRetry,
    recoveryOptions,
  }
}

/**
 * Generate human-readable error message
 */
function getHumanReadableMessage(category: ErrorCategory, originalMessage: string): string {
  switch (category) {
    case 'network':
      return 'Network connection failed. Check your internet connection and try again.'
    case 'rate_limit':
      return 'API rate limit reached. Please wait before retrying.'
    case 'auth':
      return 'Authentication failed. Check your API credentials.'
    case 'timeout':
      return 'Request timed out. The server took too long to respond.'
    case 'validation':
      return `Invalid input: ${originalMessage}`
    case 'resource':
      return 'Resource limit exceeded. Try reducing the workload.'
    case 'config':
      return `Configuration error: ${originalMessage}`
    default:
      return originalMessage
  }
}

/**
 * Generate recovery options based on error category
 */
function generateRecoveryOptions(
  category: ErrorCategory,
  canRetry: boolean
): RecoveryOption[] {
  const options: RecoveryOption[] = []

  if (canRetry) {
    options.push({
      id: 'retry',
      label: 'Retry',
      description: 'Retry the failed operation',
      action: 'retry',
      automatic: category === 'network' || category === 'timeout',
    })
  }

  switch (category) {
    case 'rate_limit':
      options.push({
        id: 'wait-retry',
        label: 'Wait and Retry',
        description: 'Wait for rate limit to reset, then retry',
        action: 'retry',
      })
      break

    case 'auth':
      options.push({
        id: 'update-creds',
        label: 'Update Credentials',
        description: 'Open settings to update API credentials',
        action: 'modify',
      })
      break

    case 'validation':
      options.push({
        id: 'modify-input',
        label: 'Modify Input',
        description: 'Edit the node configuration to fix the input',
        action: 'modify',
      })
      break

    case 'config':
      options.push({
        id: 'modify-config',
        label: 'Modify Configuration',
        description: 'Edit the node configuration',
        action: 'modify',
      })
      break
  }

  // Always offer skip and abort
  options.push({
    id: 'skip',
    label: 'Skip Node',
    description: 'Skip this node and continue with the workflow',
    action: 'skip',
  })

  options.push({
    id: 'abort',
    label: 'Abort Workflow',
    description: 'Stop the workflow execution',
    action: 'abort',
  })

  return options
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
  retryCount: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): number {
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, retryCount)
  return Math.min(delay, policy.maxDelayMs)
}

/**
 * Execute with automatic retry
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  nodeId: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  onRetry?: (error: ClassifiedError, attempt: number) => void
): Promise<{ success: true; result: T } | { success: false; error: ClassifiedError }> {
  let lastError: ClassifiedError | null = null

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      const result = await operation()
      return { success: true, result }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      lastError = classifyError(error, nodeId, attempt, policy)

      if (!lastError.canRetry) {
        return { success: false, error: lastError }
      }

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, policy)
      onRetry?.(lastError, attempt + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: lastError! }
}

/**
 * Error history store for diagnostics
 */
export class ErrorHistory {
  private errors: ClassifiedError[] = []
  private maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  add(error: ClassifiedError): void {
    this.errors.unshift(error)
    if (this.errors.length > this.maxSize) {
      this.errors.pop()
    }
  }

  getAll(): ClassifiedError[] {
    return [...this.errors]
  }

  getByNode(nodeId: string): ClassifiedError[] {
    return this.errors.filter(e => e.nodeId === nodeId)
  }

  getByCategory(category: ErrorCategory): ClassifiedError[] {
    return this.errors.filter(e => e.category === category)
  }

  getBySeverity(severity: ErrorSeverity): ClassifiedError[] {
    return this.errors.filter(e => e.severity === severity)
  }

  clear(): void {
    this.errors = []
  }

  getStats(): {
    total: number
    byCategory: Record<ErrorCategory, number>
    bySeverity: Record<ErrorSeverity, number>
    retrySuccess: number
  } {
    const byCategory: Record<ErrorCategory, number> = {
      network: 0,
      rate_limit: 0,
      auth: 0,
      validation: 0,
      timeout: 0,
      resource: 0,
      config: 0,
      unknown: 0,
    }

    const bySeverity: Record<ErrorSeverity, number> = {
      warning: 0,
      error: 0,
      critical: 0,
    }

    let retrySuccess = 0

    for (const error of this.errors) {
      byCategory[error.category]++
      bySeverity[error.severity]++
      if (error.retryCount > 0) {
        retrySuccess++
      }
    }

    return {
      total: this.errors.length,
      byCategory,
      bySeverity,
      retrySuccess,
    }
  }
}

// Singleton error history instance
export const errorHistory = new ErrorHistory()
