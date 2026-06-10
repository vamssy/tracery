import { Glyph } from '../icons'

const SHORTCUTS: [string, string][] = [
  ['Add node', 'click ＋ on the canvas, a node, or the rail'],
  ['Connect nodes', 'drag from a green output port to an input port'],
  ['Delete node', 'select it, then Delete / Backspace'],
  ['Undo', '⌘Z / Ctrl Z (or the ↺ in the toolbar)'],
  ['Deselect / close', 'Escape'],
  ['Run', 'Test workflow, or send a message in Chat'],
]

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="mh-t">
            <Glyph name="info" size={18} />
            About Tracery
          </span>
          <button className="cfg-x" onClick={onClose}>
            <Glyph name="x" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="lede">
            <b>Tracery</b> is a visual builder for RAG & LLM pipelines. Compose typed nodes, <b>run</b> them, inspect a
            full per-node <b>trace</b> (I/O, latency, tokens, cost), evaluate with the <b>Tests</b> tab, and{' '}
            <b>deploy</b> any workflow as a callable API.
          </p>
          <div className="kvrow">
            <span className="kr-l">Tabs</span>
            <div className="kv" style={{ whiteSpace: 'normal' }}>
              <b style={{ color: 'var(--text)' }}>Editor</b> build · <b style={{ color: 'var(--text)' }}>Executions</b>{' '}
              run history + trace replay · <b style={{ color: 'var(--text)' }}>Tests</b> batch evaluation
            </div>
          </div>
          <div className="kvrow">
            <span className="kr-l">Shortcuts</span>
            <div className="kv" style={{ whiteSpace: 'normal', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10 }}>
                  <b style={{ color: 'var(--text)', minWidth: 110 }}>{k}</b>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
