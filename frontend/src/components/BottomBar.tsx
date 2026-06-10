import { useReactFlow } from '@xyflow/react'
import { Glyph } from '../icons'

export function BottomBar({
  running,
  chatOpen,
  onRun,
  onToggleChat,
  onTrash,
  onSpark,
  onUndo,
  onTidy,
}: {
  running: boolean
  chatOpen: boolean
  onRun: () => void
  onToggleChat: () => void
  onTrash: () => void
  onSpark: () => void
  onUndo: () => void
  onTidy: () => void
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return (
    <div className="toolbar">
      <div className="tb-cluster">
        <button className="tb-ico" title="Fit view" onClick={() => fitView({ padding: 0.3, duration: 300 })}>
          <Glyph name="fit" size={17} />
        </button>
        <button className="tb-ico" title="Zoom in" onClick={() => zoomIn({ duration: 150 })}>
          <Glyph name="zoomIn" size={17} />
        </button>
        <button className="tb-ico" title="Zoom out" onClick={() => zoomOut({ duration: 150 })}>
          <Glyph name="zoomOut" size={17} />
        </button>
        <button className="tb-ico" title="Undo" onClick={onUndo}>
          <Glyph name="undo" size={17} />
        </button>
        <button className="tb-ico" title="Tidy up" onClick={onTidy}>
          <Glyph name="tidy" size={17} />
        </button>
      </div>

      <div className="tb-center">
        <button className="btn-test" onClick={onRun} disabled={running}>
          <Glyph name="flask" size={16} />
          {running ? 'Running…' : 'Test workflow'}
        </button>
        <button className="btn-chat" onClick={onToggleChat}>
          <Glyph name="chatb" size={15} />
          {chatOpen ? 'Hide chat' : 'Show chat'}
        </button>
        <button className="btn-trash" title="Delete selected" onClick={onTrash}>
          <Glyph name="trash" size={17} />
        </button>
      </div>

      <button className="btn-spark" title="Ask Tracery AI" onClick={onSpark}>
        <Glyph name="spark" size={18} />
      </button>
    </div>
  )
}
