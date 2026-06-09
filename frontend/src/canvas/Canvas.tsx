import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { useCallback } from 'react'
import { useCanvas } from '../store/store'
import { NODE_DEFS } from './nodeDefs'
import { CustomNode } from './CustomNode'

// nodeTypes must be referentially stable across renders
const nodeTypes = Object.fromEntries(Object.keys(NODE_DEFS).map((t) => [t, CustomNode]))

export function Canvas() {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useCanvas((s) => s.nodes)
  const edges = useCanvas((s) => s.edges)
  const onNodesChange = useCanvas((s) => s.onNodesChange)
  const onEdgesChange = useCanvas((s) => s.onEdgesChange)
  const onConnect = useCanvas((s) => s.onConnect)
  const isValidConnection = useCanvas((s) => s.isValidConnection)
  const addNode = useCanvas((s) => s.addNode)
  const setSelected = useCanvas((s) => s.setSelected)

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/mini-dify')
      if (!type) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(type, position)
    },
    [screenToFlowPosition, addNode],
  )

  return (
    <div className="canvas" onDrop={onDrop} onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => setSelected(null)}
        defaultEdgeOptions={{ animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#27324a" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => NODE_DEFS[n.type!]?.accent ?? '#64748b'} maskColor="rgba(10,14,24,0.7)" />
      </ReactFlow>
    </div>
  )
}
