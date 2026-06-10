// TypeScript mirror of the backend graph spec (backend/app/engine/graph.py).
// This is the contract: the canvas produces it, the engine consumes it.

export type PortType = 'string' | 'chunks' | 'messages' | 'json' | 'number' | 'any'

export interface Port {
  name: string
  type: PortType
  required?: boolean
}

export interface Ports {
  inputs: Port[]
  outputs: Port[]
}

export type NodeConfig = Record<string, any>

export interface GraphNode {
  id: string
  type: string
  position: { x: number; y: number }
  config: NodeConfig
}

export interface GraphEdge {
  id: string
  source: string
  source_port: string
  target: string
  target_port: string
}

export interface GraphSpec {
  version: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ─── API response shapes ─────────────────────────────────────────────────────
export interface WorkflowSummary {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Workflow extends WorkflowSummary {
  graph_spec: GraphSpec
}

export interface ValidateResult {
  valid: boolean
  errors: string[]
}

export interface SpanOut {
  node_id: string
  node_type: string
  ordinal: number
  status: string
  attempts?: number
  inputs?: any
  outputs?: any
  latency_ms?: number | null
  tokens_in?: number | null
  tokens_out?: number | null
  cost_usd?: number | null
  error?: string | null
}

export interface TraceOut {
  total_latency_ms: number
  total_cost_usd: number
  spans: SpanOut[]
}

export interface RunOut {
  run_id: string
  workflow_id: string
  status: string
  output?: any
  error?: string | null
  created_at?: string | null
  trace: TraceOut
}

export interface RunSummary {
  run_id: string
  status: string
  total_latency_ms?: number | null
  total_cost_usd?: number | null
  created_at: string
}

export interface KnowledgeBase {
  id: string
  name: string
  created_at: string
  chunk_count: number
}

export interface DeployOut {
  deployment_id: string
  deployment_key: string
  endpoint_url: string
  api_key: string
  curl: string
}
