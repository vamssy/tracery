import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { type FieldDef, NODE_DEFS } from '../canvas/nodeDefs'
import { Glyph, Icon } from '../icons'
import { useCanvas } from '../store/store'
import type { KnowledgeBase } from '../types'

function colorJSON(obj: any): string {
  return JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="n">$1</span>')
}

export function ConfigPanel({ pushToast }: { pushToast: (t: { type: any; title: string; desc?: string }) => void }) {
  const selectedId = useCanvas((s) => s.selectedNodeId)
  const node = useCanvas((s) => s.nodes.find((n) => n.id === selectedId))
  const updateNodeConfig = useCanvas((s) => s.updateNodeConfig)
  const updateNodeTitle = useCanvas((s) => s.updateNodeTitle)
  const deleteNode = useCanvas((s) => s.deleteNode)
  const setSelected = useCanvas((s) => s.setSelected)

  if (!node) return null
  const def = NODE_DEFS[node.type!]
  const config = node.data.config
  const update = (k: string, v: any) => updateNodeConfig(node.id, { ...config, [k]: v })

  return (
    <aside className="cfg" key={node.id} style={{ ['--n-color' as any]: def.color }}>
      <div className="cfg-head">
        <span className="chip">
          <Icon type={node.type!} size={20} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ph-type">{def.label}</div>
          <input
            className="ph-title"
            value={node.data.title}
            spellCheck={false}
            onChange={(e) => updateNodeTitle(node.id, e.target.value)}
          />
        </div>
        <button className="cfg-x" onClick={() => setSelected(null)}>
          <Glyph name="x" size={15} />
        </button>
      </div>

      <div className="cfg-body">
        {def.schema
          .filter((f) => !f.showIf || f.showIf(config))
          .map((f) => (
            <Field key={f.k} def={f} value={config[f.k]} update={update} pushToast={pushToast} />
          ))}
        <div className="field">
          <label>Resolved config</label>
          <div className="kv" dangerouslySetInnerHTML={{ __html: colorJSON(config) }} />
        </div>
      </div>

      <div className="cfg-foot">
        <button className="btn-del" onClick={() => deleteNode(node.id)}>
          <Glyph name="trash" size={14} />
          Delete node
        </button>
      </div>
    </aside>
  )
}

function Field({
  def,
  value,
  update,
  pushToast,
}: {
  def: FieldDef
  value: any
  update: (k: string, v: any) => void
  pushToast: (t: { type: any; title: string; desc?: string }) => void
}) {
  const set = (v: any) => update(def.k, v)

  if (def.t === 'kb') return <KBField def={def} value={value} set={set} pushToast={pushToast} />

  if (def.t === 'text')
    return (
      <Wrap def={def}>
        <input className="inp" value={value || ''} spellCheck={false} onChange={(e) => set(e.target.value)} />
      </Wrap>
    )
  if (def.t === 'number')
    return (
      <Wrap def={def}>
        <input className="inp mono" type="number" value={value ?? ''} onChange={(e) => set(Number(e.target.value))} />
      </Wrap>
    )
  if (def.t === 'csv')
    return (
      <Wrap def={def}>
        <input
          className="inp"
          value={(value || []).join(', ')}
          placeholder={def.placeholder}
          spellCheck={false}
          onChange={(e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </Wrap>
    )
  if (def.t === 'textarea')
    return (
      <Wrap def={def}>
        <textarea className="ta" value={value || ''} spellCheck={false} onChange={(e) => set(e.target.value)} />
      </Wrap>
    )
  if (def.t === 'select')
    return (
      <Wrap def={def}>
        <select className="sel" value={value} onChange={(e) => set(e.target.value)}>
          {def.opts!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Wrap>
    )
  if (def.t === 'combo')
    return (
      <Wrap def={def}>
        <input
          className="inp mono"
          list={`dl-${def.k}`}
          value={value || ''}
          spellCheck={false}
          onChange={(e) => set(e.target.value)}
        />
        <datalist id={`dl-${def.k}`}>
          {def.opts!.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </Wrap>
    )
  if (def.t === 'segment')
    return (
      <Wrap def={def}>
        <div className="seg">
          {def.opts!.map((o) => (
            <button key={o} className={value === o ? 'on' : ''} onClick={() => set(o)}>
              {o}
            </button>
          ))}
        </div>
      </Wrap>
    )
  if (def.t === 'slider')
    return (
      <div className="field">
        <label>
          {def.label}
          <span className="val">{value}</span>
        </label>
        <input
          className="range"
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value ?? def.min}
          onChange={(e) => set(Number(e.target.value))}
        />
      </div>
    )
  if (def.t === 'fields') {
    const rows: any[] = value || []
    const setRow = (i: number, patch: any) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    return (
      <Wrap def={def}>
        <div className="flist">
          {rows.map((r, i) => (
            <div className="frow" key={i}>
              <input className="inp" value={r.name} spellCheck={false} onChange={(e) => setRow(i, { name: e.target.value })} />
              <select className="sel ftype" value={r.type} onChange={(e) => setRow(i, { type: e.target.value })}>
                {['string', 'number', 'json'].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button className="del" onClick={() => set(rows.filter((_, j) => j !== i))} title="Remove">
                <Glyph name="x" size={13} />
              </button>
            </div>
          ))}
          <button className="addrow" onClick={() => set([...rows, { name: `field${rows.length + 1}`, type: 'string', required: true }])}>
            <Glyph name="plus" size={13} />
            Add field
          </button>
        </div>
      </Wrap>
    )
  }
  return null
}

function Wrap({ def, children }: { def: FieldDef; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{def.label}</label>
      {children}
    </div>
  )
}

function KBField({
  def,
  value,
  set,
  pushToast,
}: {
  def: FieldDef
  value: any
  set: (v: any) => void
  pushToast: (t: { type: any; title: string; desc?: string }) => void
}) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => api.listKBs().then(setKbs).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])

  const createKB = async () => {
    const name = prompt('Knowledge base name:')
    if (!name) return
    try {
      const kb = await api.createKB(name)
      await refresh()
      set(kb.id)
      pushToast({ type: 'ok', title: 'Knowledge base created', desc: name })
    } catch (e) {
      pushToast({ type: 'err', title: 'Create failed', desc: (e as Error).message })
    }
  }

  const ingest = async () => {
    if (!value || !text.trim()) return
    setBusy(true)
    try {
      const r = await api.ingestText(value, text.trim())
      setText('')
      await refresh()
      pushToast({ type: 'ok', title: 'Document ingested', desc: `+${r.chunks_ingested} chunk(s)` })
    } catch (e) {
      pushToast({ type: 'err', title: 'Ingest failed', desc: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <label>{def.label}</label>
      <div className="kbrow">
        <select className="sel" value={value || ''} onChange={(e) => set(e.target.value)}>
          <option value="">— select —</option>
          {kbs.map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name} ({kb.chunk_count})
            </option>
          ))}
        </select>
        <button className="btn-mini" onClick={createKB}>
          + New
        </button>
      </div>
      {value && (
        <>
          <textarea
            className="ta"
            style={{ minHeight: 60 }}
            value={text}
            placeholder="Paste text to ingest into this KB…"
            onChange={(e) => setText(e.target.value)}
          />
          <button className="addrow" onClick={ingest} disabled={busy}>
            <Glyph name="plus" size={13} />
            {busy ? 'Ingesting…' : 'Ingest document'}
          </button>
        </>
      )}
    </div>
  )
}
