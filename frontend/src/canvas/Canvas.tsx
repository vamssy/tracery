import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { Popover } from '../components/Popover'
import { Glyph } from '../icons'
import { useCanvas } from '../store/store'
import { NODE_DEFS, shapeFor } from './nodeDefs'
import { TraceryEdge } from './TraceryEdge'
import { TraceryNode } from './TraceryNode'

const nodeTypes = Object.fromEntries(Object.keys(NODE_DEFS).map((t) => [t, TraceryNode]))
const edgeTypes = { tracery: TraceryEdge }
const defaultEdgeOptions = { type: 'tracery' }

export function Canvas() {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)
  const onNodesChange = useCanvas((s) => s.onNodesChange)
  const onEdgesChange = useCanvas((s) => s.onEdgesChange)
  const onConnect = useCanvas((s) => s.onConnect)
  const isValidConnection = useCanvas((s) => s.isValidConnection)
  const setSelected = useCanvas((s) => s.setSelected)
  const addNode = useCanvas((s) => s.addNode)
  const palette = useCanvas((s) => s.palette)
  const openPalette = useCanvas((s) => s.openPalette)
  const closePalette = useCanvas((s) => s.closePalette)

  const pick = (type: string) => {
    const pal = useCanvas.getState().palette
    if (!pal) return
    if (pal.from) {
      const src = useCanvas.getState().nodes.find((n) => n.id === pal.from)
      const pos = src
        ? { x: src.position.x + (shapeFor(src.type!) === 'circle' ? 70 : 104) + 96, y: src.position.y }
        : screenToFlowPosition({ x: pal.sx, y: pal.sy })
      addNode(type, pos, pal.from)
    } else {
      addNode(type, screenToFlowPosition({ x: pal.sx, y: pal.sy }), null)
    }
    closePalette()
  }

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => {
          setSelected(null)
          closePalette()
        }}
        minZoom={0.3}
        maxZoom={2.4}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.05)" />
      </ReactFlow>

      <button className="cv-add" title="Add node" onClick={(e) => openPalette(e.clientX, e.clientY + 10, null)}>
        <Glyph name="plus" size={18} />
      </button>
      {!nodes.length && <div className="cv-hint">Press + to add your first node.</div>}

      {palette && <Popover sx={palette.sx} sy={palette.sy} onPick={pick} onClose={closePalette} />}
    </>
  )
}
