import { useState } from 'react'
import { Glyph } from '../icons'
import type { WorkflowSummary } from '../types'

export interface MenuItem {
  icon?: string
  label?: string
  fn?: () => void
  sep?: boolean
}

export function TopBar({
  name,
  onName,
  tag,
  tagKind,
  dirty,
  onDeploy,
  menu,
  workflows,
  currentId,
  onLoad,
}: {
  name: string
  onName: (v: string) => void
  tag: string | null
  tagKind?: 'valid' | 'err' | null
  dirty: boolean
  onDeploy: () => void
  menu: MenuItem[]
  workflows: WorkflowSummary[]
  currentId: string | null
  onLoad: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <span className="brand">
        <span className="tb-logo">
          <Glyph name="logo" size={22} stroke={2.2} />
        </span>
        <span className="bw">Tracery</span>
      </span>
      <span className="tb-sep" />
      <input className="wf-name" value={name} onChange={(e) => onName(e.target.value)} spellCheck={false} />
      {tag && <span className={`tag${tagKind ? ` ${tagKind}` : ''}`}>{tag}</span>}

      <div className="spacer" />

      <div className="tb-right">
        <span className="saved">{dirty ? 'Unsaved' : 'Saved'}</span>
        <button className="btn-share" onClick={onDeploy}>
          <Glyph name="rocket" size={15} />
          Deploy
        </button>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" title="More" onClick={() => setOpen((o) => !o)}>
            <Glyph name="dots" size={18} />
          </button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setOpen(false)} />
              <div className="menu">
                <select
                  className="menu-load"
                  value={currentId || ''}
                  onChange={(e) => {
                    setOpen(false)
                    onLoad(e.target.value)
                  }}
                >
                  <option value="">Load workflow…</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <div className="sep" />
                {menu.map((m, i) =>
                  m.sep ? (
                    <div className="sep" key={i} />
                  ) : (
                    <button
                      key={i}
                      onClick={() => {
                        setOpen(false)
                        m.fn?.()
                      }}
                    >
                      <Glyph name={m.icon!} size={15} />
                      {m.label}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
