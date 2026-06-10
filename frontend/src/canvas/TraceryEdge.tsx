import { type EdgeProps, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import { useCanvas } from '../store/store'

export function TraceryEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  })
  const running = useCanvas((s) => s.running)
  const removeEdge = useCanvas((s) => s.removeEdge)

  return (
    <g className={`e-g${running ? ' running' : ''}`}>
      <path className="e-glow" d={path} />
      <path className="e-main" d={path} />
      <path className="e-flow" d={path} />
      <EdgeLabelRenderer>
        <div
          className="edge-label nodrag nopan"
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
        >
          {sourceHandleId && <span className="el-name">{sourceHandleId}</span>}
          <button
            className="el-x"
            title="Remove connection"
            onClick={(e) => {
              e.stopPropagation()
              removeEdge(id)
            }}
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </g>
  )
}
