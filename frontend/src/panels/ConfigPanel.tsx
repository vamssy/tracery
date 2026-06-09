import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { NODE_DEFS, templateVars } from '../canvas/nodeDefs'
import { useCanvas } from '../store/store'
import type { KnowledgeBase, PortType } from '../types'

const MODEL_SUGGESTIONS = [
  'anthropic/claude-3-5-sonnet-latest',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'groq/llama-3.3-70b-versatile',
  'gemini/gemini-1.5-flash',
]
const FIELD_TYPES: PortType[] = ['string', 'number', 'json']

export function ConfigPanel() {
  const selectedId = useCanvas((s) => s.selectedNodeId)
  const node = useCanvas((s) => s.nodes.find((n) => n.id === selectedId))
  const updateNodeConfig = useCanvas((s) => s.updateNodeConfig)
  const deleteNode = useCanvas((s) => s.deleteNode)

  if (!node) {
    return (
      <aside className="config">
        <div className="config__empty">Select a node to configure it.</div>
      </aside>
    )
  }

  const def = NODE_DEFS[node.type!]
  const config = node.data.config
  const update = (patch: Record<string, any>) => updateNodeConfig(node.id, { ...config, ...patch })

  return (
    <aside className="config">
      <div className="config__head">
        <span className="config__badge" style={{ background: def.accent }}>
          {def.label}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={() => deleteNode(node.id)}>
          Delete
        </button>
      </div>
      <div className="config__id">{node.id}</div>

      {node.type === 'input' && <InputConfig config={config} update={update} />}
      {node.type === 'retrieval' && <RetrievalConfig config={config} update={update} />}
      {node.type === 'prompt' && <PromptConfig config={config} update={update} />}
      {node.type === 'model' && <ModelConfig config={config} update={update} />}
      {node.type === 'output' && <OutputConfig config={config} update={update} />}
      {node.type === 'evaluator' && <EvaluatorConfig config={config} update={update} />}
      {node.type === 'tool' && <ToolConfig config={config} update={update} />}
    </aside>
  )
}

type CfgProps = { config: Record<string, any>; update: (p: Record<string, any>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

function InputConfig({ config, update }: CfgProps) {
  const fields: any[] = config.fields || []
  const setField = (i: number, patch: any) =>
    update({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="config__body">
      <div className="field__label">Fields</div>
      {fields.map((f, i) => (
        <div className="rowfield" key={i}>
          <input
            className="input"
            value={f.name}
            onChange={(e) => setField(i, { name: e.target.value })}
            placeholder="name"
          />
          <select className="input input--sm" value={f.type || 'string'} onChange={(e) => setField(i, { type: e.target.value })}>
            {FIELD_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="chk" title="required">
            <input type="checkbox" checked={f.required !== false} onChange={(e) => setField(i, { required: e.target.checked })} />
          </label>
          <button className="btn btn--ghost btn--sm" onClick={() => update({ fields: fields.filter((_, j) => j !== i) })}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn btn--sm" onClick={() => update({ fields: [...fields, { name: `field${fields.length + 1}`, type: 'string', required: true }] })}>
        + Add field
      </button>
    </div>
  )
}

function RetrievalConfig({ config, update }: CfgProps) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [ingestText, setIngestText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = () => api.listKBs().then(setKbs).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])

  const createKB = async () => {
    const name = prompt('Knowledge base name:')
    if (!name) return
    const kb = await api.createKB(name)
    await refresh()
    update({ knowledge_base_id: kb.id })
  }

  const addDoc = async () => {
    if (!config.knowledge_base_id || !ingestText.trim()) return
    setBusy('ingest')
    try {
      const r = await api.ingestText(config.knowledge_base_id, ingestText.trim())
      setIngestText('')
      await refresh()
      setBusy(`+${r.chunks_ingested} chunk(s)`)
      setTimeout(() => setBusy(null), 1500)
    } catch {
      setBusy('error')
    }
  }

  return (
    <div className="config__body">
      <Field label="Knowledge base">
        <div className="rowfield">
          <select className="input" value={config.knowledge_base_id || ''} onChange={(e) => update({ knowledge_base_id: e.target.value })}>
            <option value="">— select —</option>
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} ({kb.chunk_count})
              </option>
            ))}
          </select>
          <button className="btn btn--sm" onClick={createKB}>
            + New
          </button>
        </div>
      </Field>
      {config.knowledge_base_id && (
        <Field label="Add a document">
          <textarea
            className="input input--area"
            rows={4}
            value={ingestText}
            placeholder="Paste text to ingest into this KB…"
            onChange={(e) => setIngestText(e.target.value)}
          />
          <button className="btn btn--sm" onClick={addDoc} disabled={busy === 'ingest'}>
            {busy && busy !== 'ingest' ? busy : 'Ingest'}
          </button>
        </Field>
      )}
      <Field label="top_k">
        <input className="input" type="number" min={1} value={config.top_k ?? 4} onChange={(e) => update({ top_k: Number(e.target.value) })} />
      </Field>
      <Field label="score_threshold">
        <input
          className="input"
          type="number"
          step={0.05}
          value={config.score_threshold ?? 0}
          onChange={(e) => update({ score_threshold: Number(e.target.value) })}
        />
      </Field>
    </div>
  )
}

function PromptConfig({ config, update }: CfgProps) {
  const vars = templateVars(config.template || '')
  return (
    <div className="config__body">
      <Field label="Template">
        <textarea
          className="input input--area mono"
          rows={8}
          value={config.template || ''}
          onChange={(e) => update({ template: e.target.value })}
        />
      </Field>
      <div className="field__label">Detected variables → input ports</div>
      <div className="chips">
        {vars.length ? vars.map((v) => <span className="chip" key={v}>{v}</span>) : <span className="muted">none</span>}
      </div>
    </div>
  )
}

function ModelConfig({ config, update }: CfgProps) {
  return (
    <div className="config__body">
      <Field label="Model (LiteLLM id)">
        <input className="input" list="model-suggestions" value={config.model || ''} onChange={(e) => update({ model: e.target.value })} />
        <datalist id="model-suggestions">
          {MODEL_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label="Temperature">
        <input className="input" type="number" step={0.1} min={0} max={2} value={config.temperature ?? 0.2} onChange={(e) => update({ temperature: Number(e.target.value) })} />
      </Field>
      <Field label="Max tokens">
        <input className="input" type="number" min={1} value={config.max_tokens ?? 1024} onChange={(e) => update({ max_tokens: Number(e.target.value) })} />
      </Field>
      <Field label="System prompt">
        <textarea className="input input--area" rows={4} value={config.system_prompt || ''} onChange={(e) => update({ system_prompt: e.target.value })} />
      </Field>
      <Field label="Response format">
        <select className="input" value={config.response_format || 'text'} onChange={(e) => update({ response_format: e.target.value })}>
          <option value="text">text</option>
          <option value="json">json</option>
        </select>
      </Field>
    </div>
  )
}

function OutputConfig({ config, update }: CfgProps) {
  return (
    <div className="config__body">
      <Field label="Format">
        <select className="input" value={config.format || 'text'} onChange={(e) => update({ format: e.target.value })}>
          <option value="text">text</option>
          <option value="json">json</option>
        </select>
      </Field>
    </div>
  )
}

function EvaluatorConfig({ config, update }: CfgProps) {
  const strategy = config.strategy || 'keyword'
  const criteriaHint =
    strategy === 'keyword'
      ? 'comma-separated keywords'
      : strategy === 'regex'
        ? 'a regular expression'
        : 'what a good answer looks like'
  return (
    <div className="config__body">
      <Field label="Strategy">
        <select className="input" value={strategy} onChange={(e) => update({ strategy: e.target.value })}>
          <option value="keyword">keyword</option>
          <option value="regex">regex</option>
          <option value="llm_judge">llm_judge</option>
        </select>
      </Field>
      <Field label={`Criteria · ${criteriaHint}`}>
        <textarea
          className="input input--area"
          rows={3}
          value={config.criteria || ''}
          onChange={(e) => update({ criteria: e.target.value })}
        />
      </Field>
      <Field label="Pass threshold">
        <input
          className="input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          value={config.pass_threshold ?? 0.5}
          onChange={(e) => update({ pass_threshold: Number(e.target.value) })}
        />
      </Field>
      {strategy === 'llm_judge' && (
        <Field label="Judge model (LiteLLM id)">
          <input className="input" value={config.model || ''} placeholder="(default)" onChange={(e) => update({ model: e.target.value })} />
        </Field>
      )}
    </div>
  )
}

function ToolConfig({ config, update }: CfgProps) {
  const tool = config.tool || 'calculator'
  return (
    <div className="config__body">
      <Field label="Tool">
        <select className="input" value={tool} onChange={(e) => update({ tool: e.target.value })}>
          <option value="calculator">calculator</option>
          <option value="http_get">http_get</option>
        </select>
      </Field>
      {tool === 'http_get' && (
        <>
          <Field label="Allowed domains · comma-separated">
            <input
              className="input"
              value={(config.allowed_domains || []).join(', ')}
              placeholder="example.com, api.example.com"
              onChange={(e) => update({ allowed_domains: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Timeout (s)">
            <input className="input" type="number" min={1} value={config.timeout ?? 10} onChange={(e) => update({ timeout: Number(e.target.value) })} />
          </Field>
        </>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        {tool === 'calculator'
          ? 'Wire a string into `expression`. Safe arithmetic only.'
          : 'Wire a string into `url`. Only allow-listed domains are fetched.'}
      </div>
    </div>
  )
}
