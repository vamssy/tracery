import { NODE_DEFS, NODE_ORDER } from './nodeDefs'

export function Palette() {
  return (
    <aside className="palette">
      <div className="palette__title">Nodes</div>
      <div className="palette__hint">drag onto the canvas</div>
      {NODE_ORDER.map((type) => {
        const def = NODE_DEFS[type]
        return (
          <div
            key={type}
            className="palette__item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/mini-dify', type)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <span className="palette__dot" style={{ background: def.accent }} />
            <div>
              <div className="palette__label">{def.label}</div>
              <div className="palette__desc">{def.description}</div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
