/**
 * useExecution — hook for workflow execution control.
 * Phase 0: placeholder.
 */

export function useExecution() {
  return {
    execute: async (_workflowId: string) => {
      // Phase 1: invoke Tauri command
    },
    cancel: async (_executionId: string) => {
      // Phase 1: invoke Tauri command
    },
  }
}
