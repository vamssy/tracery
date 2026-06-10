// Node catalog — visual metadata + config schema (bound to REAL backend keys) +
// the port/typing logic that drives wiring and validation.
import type { Ports, PortType } from '../types'

export const PORT_COLORS: Record<PortType, string> = {
  string: '#60a5fa',
  chunks: '#f5a623',
  messages: '#a78bfa',
  json: '#34d399',
  number: '#f472b6',
  any: '#9aa0aa',
}

export function typesCompatible(a: PortType, b: PortType): boolean {
  return a === b || a === 'any' || b === 'any'
}

export function templateVars(t: string): string[] {
  const seen: string[] = []
  const re = /{{\s*([\w.]+)\s*}}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const name = m[1].split('.')[0]
    if (!seen.includes(name)) seen.push(name)
  }
  return seen
}

export const MODEL_SUGGESTIONS = [
  'anthropic/claude-3-5-sonnet-latest',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'groq/llama-3.3-70b-versatile',
  'gemini/gemini-1.5-flash',
]

// ── config-field schema (rendered by the config panel) ───────────────────────
export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'segment' | 'slider' | 'fields' | 'kb' | 'combo' | 'csv'
export interface FieldDef {
  k: string
  t: FieldType
  label: string
  opts?: string[]
  min?: number
  max?: number
  step?: number
  mono?: boolean
  placeholder?: string
  showIf?: (config: Record<string, any>) => boolean
}

export interface NodeDef {
  type: string
  label: string
  color: string // css var
  hex: string // for minimap / JS
  desc: string
  shape: 'card' | 'circle'
  defaultConfig: Record<string, any>
  schema: FieldDef[]
  declarePorts: (config: Record<string, any>) => Ports
  sub: (config: Record<string, any>) => string
}

export const NODE_DEFS: Record<string, NodeDef> = {
  input: {
    type: 'input',
    label: 'Input',
    color: 'var(--c-input)',
    hex: '#4d8df0',
    desc: 'Entry point — typed fields',
    shape: 'card',
    defaultConfig: { fields: [{ name: 'question', type: 'string', required: true }] },
    schema: [{ k: 'fields', t: 'fields', label: 'Fields' }],
    declarePorts: (c) => ({
      inputs: [],
      outputs: (c.fields || []).map((f: any) => ({ name: f.name, type: (f.type || 'string') as PortType })),
    }),
    sub: (c) =>
      (c.fields || [])
        .map((f: any) => f.name)
        .slice(0, 2)
        .join(' · ') || 'typed fields',
  },
  retrieval: {
    type: 'retrieval',
    label: 'Retrieval',
    color: 'var(--c-retrieval)',
    hex: '#f5a623',
    desc: 'Vector search a knowledge base',
    shape: 'card',
    defaultConfig: { knowledge_base_id: '', top_k: 4, score_threshold: 0 },
    schema: [
      { k: 'knowledge_base_id', t: 'kb', label: 'Knowledge base' },
      { k: 'top_k', t: 'slider', label: 'Top K', min: 1, max: 50, step: 1 },
      { k: 'score_threshold', t: 'slider', label: 'Min similarity', min: 0, max: 1, step: 0.01 },
    ],
    declarePorts: () => ({ inputs: [{ name: 'query', type: 'string' }], outputs: [{ name: 'chunks', type: 'chunks' }] }),
    sub: () => 'vector search',
  },
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    color: 'var(--c-prompt)',
    hex: '#a06bf0',
    desc: 'Render a {{template}}',
    shape: 'card',
    defaultConfig: { template: 'Answer using only this context:\n{{context}}\n\nQuestion: {{question}}' },
    schema: [{ k: 'template', t: 'textarea', label: 'Template', mono: true }],
    declarePorts: (c) => ({
      inputs: templateVars(c.template || '').map((v) => ({ name: v, type: 'any' as PortType })),
      outputs: [{ name: 'prompt', type: 'string' }],
    }),
    sub: () => 'render {{…}}',
  },
  model: {
    type: 'model',
    label: 'Model',
    color: 'var(--c-model)',
    hex: '#2ec97e',
    desc: 'Call an LLM',
    shape: 'card',
    defaultConfig: { model: 'anthropic/claude-3-5-sonnet-latest', temperature: 0.2, max_tokens: 1024, system_prompt: '' },
    schema: [
      { k: 'model', t: 'combo', label: 'Model (LiteLLM id)', opts: MODEL_SUGGESTIONS },
      { k: 'temperature', t: 'slider', label: 'Temperature', min: 0, max: 2, step: 0.1 },
      { k: 'max_tokens', t: 'number', label: 'Max tokens' },
      { k: 'system_prompt', t: 'textarea', label: 'System prompt' },
      { k: 'response_format', t: 'segment', label: 'Response format', opts: ['text', 'json'] },
    ],
    declarePorts: () => ({
      inputs: [
        { name: 'prompt', type: 'string', required: false },
        { name: 'messages', type: 'messages', required: false },
      ],
      outputs: [{ name: 'completion', type: 'string' }],
    }),
    sub: (c) => (c.model ? String(c.model).split('/').pop()! : 'call an LLM'),
  },
  output: {
    type: 'output',
    label: 'Output',
    color: 'var(--c-output)',
    hex: '#f0524d',
    desc: 'Terminal result',
    shape: 'card',
    defaultConfig: { format: 'text' },
    schema: [{ k: 'format', t: 'segment', label: 'Format', opts: ['text', 'json'] }],
    declarePorts: () => ({ inputs: [{ name: 'result', type: 'any' }], outputs: [] }),
    sub: (c) => c.format || 'terminal',
  },
  evaluator: {
    type: 'evaluator',
    label: 'Evaluator',
    color: 'var(--c-evaluator)',
    hex: '#ec4899',
    desc: 'Score an output (judge / keyword / regex)',
    shape: 'circle',
    defaultConfig: { strategy: 'keyword', criteria: '', pass_threshold: 0.5 },
    schema: [
      { k: 'strategy', t: 'segment', label: 'Strategy', opts: ['keyword', 'regex', 'llm_judge'] },
      { k: 'criteria', t: 'textarea', label: 'Criteria' },
      { k: 'pass_threshold', t: 'slider', label: 'Pass threshold', min: 0, max: 1, step: 0.05 },
      {
        k: 'model',
        t: 'combo',
        label: 'Judge model',
        opts: MODEL_SUGGESTIONS,
        showIf: (c) => c.strategy === 'llm_judge',
      },
    ],
    declarePorts: () => ({
      inputs: [
        { name: 'output', type: 'string' },
        { name: 'reference', type: 'string', required: false },
      ],
      outputs: [
        { name: 'score', type: 'number' },
        { name: 'passed', type: 'json' },
      ],
    }),
    sub: (c) => c.strategy || 'score output',
  },
  tool: {
    type: 'tool',
    label: 'Tool',
    color: 'var(--c-tool)',
    hex: '#15c5a6',
    desc: 'Allow-listed function (calculator / http_get)',
    shape: 'circle',
    defaultConfig: { tool: 'calculator' },
    schema: [
      { k: 'tool', t: 'select', label: 'Function', opts: ['calculator', 'http_get'] },
      {
        k: 'allowed_domains',
        t: 'csv',
        label: 'Allowed domains',
        placeholder: 'example.com, api.example.com',
        showIf: (c) => c.tool === 'http_get',
      },
      { k: 'timeout', t: 'number', label: 'Timeout (s)', showIf: (c) => c.tool === 'http_get' },
    ],
    declarePorts: (c) => {
      let inputs: { name: string; type: PortType; required?: boolean }[]
      if (c.tool === 'http_get') inputs = [{ name: 'url', type: 'string', required: false }]
      else if (c.tool === 'calculator') inputs = [{ name: 'expression', type: 'string', required: false }]
      else inputs = [{ name: 'input', type: 'any', required: false }]
      return { inputs, outputs: [{ name: 'result', type: 'json' }] }
    },
    sub: (c) => c.tool || 'allow-listed fn',
  },
}

export function declarePorts(type: string, config: Record<string, any>): Ports {
  const def = NODE_DEFS[type]
  return def ? def.declarePorts(config || {}) : { inputs: [], outputs: [] }
}

export const NODE_ORDER = ['input', 'retrieval', 'prompt', 'model', 'output', 'evaluator', 'tool']
export const shapeFor = (type: string): 'card' | 'circle' => NODE_DEFS[type]?.shape ?? 'card'
