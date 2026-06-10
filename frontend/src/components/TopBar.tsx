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
  active,
  onToggleActive,
  dirty,
  onShare,
  onUndo,
  menu,
  workflows,
  currentId,
  onLoad,
}: {
  name: string
  onName: (v: string) => void
  tag: string | null
  tagKind?: 'valid' | 'err' | null
  active: boolean
  onToggleActive: () => void
  dirty: boolean
  onShare: () => void
  onUndo: () => void
  menu: MenuItem[]
  workflows: WorkflowSummary[]
  currentId: string | null
  onLoad: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <span className="tb-logo">
        <Glyph name="logo" size={22} stroke={2.2} />
      </span>
      <input className="wf-name" value={name} onChange={(e) => onName(e.target.value)} spellCheck={false} />
      {tag && <span className={`tag${tagKind ? ` ${tagKind}` : ''}`}>{tag}</span>}

      <div className="spacer" />

      <div className="tb-right">
        <div className="active-wrap">
          <span className={`lbl${active ? '' : ' off'}`}>{active ? 'Active' : 'Inactive'}</span>
          <span className={`toggle${active ? '' : ' off'}`} onClick={onToggleActive} />
        </div>
        <button className="btn-share" onClick={onShare}>
          <Glyph name="share" size={15} />
          Share
        </button>
        <span className="saved">{dirty ? 'Unsaved' : 'Saved'}</span>
        <button className="icon-btn" title="Undo" onClick={onUndo}>
          <Glyph name="history" size={17} />
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
