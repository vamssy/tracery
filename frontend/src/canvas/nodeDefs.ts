// Frontend node catalog — mirrors backend declare_ports so the canvas can render
// handles and validate connections without a round-trip.
import type { Ports, PortType } from '../types'

export const PORT_COLORS: Record<PortType, string> = {
  string: '#60a5fa',
  chunks: '#f59e0b',
  messages: '#a78bfa',
  json: '#34d399',
  number: '#f472b6',
  any: '#94a3b8',
}

export function typesCompatible(a: PortType, b: PortType): boolean {
  return a === b || a === 'any' || b === 'any'
}

export function templateVars(t: string): string[] {
  const seen: string[] = []
  const re = /{{\s*(\w+)\s*}}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

export interface NodeDef {
  type: string
  label: string
  description: string
  accent: string
  defaultConfig: Record<string, any>
  declarePorts: (config: Record<string, any>) => Ports
}

export const NODE_DEFS: Record<string, NodeDef> = {
  input: {
    type: 'input',
    label: 'Input',
    description: 'Entry point — typed fields',
    accent: '#3b82f6',
    defaultConfig: { fields: [{ name: 'question', type: 'string', required: true }] },
    declarePorts: (c) => ({
      inputs: [],
      outputs: (c.fields || []).map((f: any) => ({ name: f.name, type: (f.type || 'string') as PortType })),
    }),
  },
  retrieval: {
    type: 'retrieval',
    label: 'Retrieval',
    description: 'Vector search a knowledge base',
    accent: '#f59e0b',
    defaultConfig: { knowledge_base_id: '', top_k: 4, score_threshold: 0 },
    declarePorts: () => ({
      inputs: [{ name: 'query', type: 'string' }],
      outputs: [{ name: 'chunks', type: 'chunks' }],
    }),
  },
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    description: 'Render a {{template}}',
    accent: '#8b5cf6',
    defaultConfig: { template: 'Answer using only this context:\n{{context}}\n\nQuestion: {{question}}' },
    declarePorts: (c) => ({
      inputs: templateVars(c.template || '').map((v) => ({ name: v, type: 'any' as PortType })),
      outputs: [{ name: 'prompt', type: 'string' }],
    }),
  },
  model: {
    type: 'model',
    label: 'Model',
    description: 'Call an LLM',
    accent: '#10b981',
    defaultConfig: {
      model: 'anthropic/claude-3-5-sonnet-latest',
      temperature: 0.2,
      max_tokens: 1024,
      system_prompt: '',
    },
    declarePorts: () => ({
      inputs: [
        { name: 'prompt', type: 'string', required: false },
        { name: 'messages', type: 'messages', required: false },
      ],
      outputs: [{ name: 'completion', type: 'string' }],
    }),
  },
  output: {
    type: 'output',
    label: 'Output',
    description: 'Terminal result',
    accent: '#ef4444',
    defaultConfig: { format: 'text' },
    declarePorts: () => ({ inputs: [{ name: 'result', type: 'any' }], outputs: [] }),
  },
}

export function declarePorts(type: string, config: Record<string, any>): Ports {
  const def = NODE_DEFS[type]
  return def ? def.declarePorts(config || {}) : { inputs: [], outputs: [] }
}

export const NODE_ORDER = ['input', 'retrieval', 'prompt', 'model', 'output']
