/**
 * Pack Manifest v0.1 — TypeScript mirror of Rust hb-core::pack types.
 * Source of truth: crates/hb-core/src/pack/mod.rs
 */

export interface PackManifest {
  pack_version: '0.1.0'
  id: string
  version: string
  name: string
  description: string
  author: string
  license: string
  platform_version: string
  dependencies: PackDependencySpec[]
  category: PackCategory
  tools: string[]
  templates: string[]
  composites: string[]
  runtime_requirements?: RuntimeRequirements
}

export interface PackDependencySpec {
  pack_id: string
  version_range: string
  optional: boolean
}

export type PackCategory =
  | 'core'
  | 'ai'
  | 'rag'
  | 'data'
  | 'document'
  | 'export'
  | 'integration'
  | 'ml'
  | 'custom'

export interface RuntimeRequirements {
  python?: string
  docker?: boolean
  native_deps: string[]
  os: string[]
}
