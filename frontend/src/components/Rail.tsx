import { Glyph } from '../icons'

export function Rail({ onAdd, onHelp }: { onAdd: () => void; onHelp: () => void }) {
  return (
    <nav className="rail">
      <span className="rail-logo">
        <Glyph name="logo" size={24} stroke={2.2} />
      </span>
      <button className="rail-btn" title="Add node" onClick={onAdd}>
        <Glyph name="plus" size={19} />
      </button>
      <div className="rail-sep" />
      <button className="rail-btn" title="About & shortcuts" onClick={onHelp}>
        <Glyph name="info" size={19} />
      </button>
      <div className="rail-avatar">VR</div>
    </nav>
  )
}
