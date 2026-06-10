import { useState } from 'react'
import { Glyph } from '../icons'
import { useCanvas } from '../store/store'

export function Rail({ onTemplate }: { onTemplate: () => void }) {
  const openPalette = useCanvas((s) => s.openPalette)
  const [active, setActive] = useState('home')
  return (
    <nav className="rail">
      <span className="rail-logo">
        <Glyph name="logo" size={24} stroke={2.2} />
      </span>
      <button className="rail-btn" title="Add node" onClick={(e) => openPalette(e.clientX + 36, e.clientY)}>
        <Glyph name="plus" size={19} />
      </button>
      <button className={`rail-btn${active === 'home' ? ' on' : ''}`} title="Editor" onClick={() => setActive('home')}>
        <Glyph name="home" size={19} />
      </button>
      <button className="rail-btn" title="Load template" onClick={onTemplate}>
        <Glyph name="layers" size={19} />
      </button>
      <button className={`rail-btn${active === 'book' ? ' on' : ''}`} title="Docs" onClick={() => setActive('book')}>
        <Glyph name="book" size={19} />
      </button>
      <div className="rail-sep" />
      <button className="rail-btn" title="About">
        <Glyph name="info" size={19} />
      </button>
      <div className="rail-avatar">VR</div>
    </nav>
  )
}
