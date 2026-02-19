/**
 * Plugin Registration — 플러그인 등록
 *
 * 현재는 핵심 기능에 집중하여 외부 API 플러그인은 제거됨.
 * 향후 필요시 플러그인 시스템 확장 가능.
 */

export function registerBuiltinPlugins(): void {
  // 현재 등록된 플러그인 없음
  // 핵심 노드는 executors/index.ts에서 등록됨
  console.log('[Plugins] 플러그인 시스템 초기화 완료')
}
