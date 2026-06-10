import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Glyph, Icon } from '../icons'
import { useCanvas } from '../store/store'
import { NODE_DEFS, declarePorts } from './nodeDefs'

function pct(i: number, n: number): string {
  return `${((i + 1) / (n + 1)) * 100}%`
}

export function TraceryNode({ id, type, data }: NodeProps) {
  const def = NODE_DEFS[type!]
  const config = (data as { config: Record<string, any> }).config
  const title = (data as { title: string }).title
  const ports = declarePorts(type!, config)
  const selected = useCanvas((s) => s.selectedNodeId === id)
  const status = useCanvas((s) => s.runStatuses[id])
  const openPalette = useCanvas((s) => s.openPalette)
  const shape = def?.shape ?? 'card'
  const trigger = type === 'input'
  const sub = def?.sub(config)

  const cls = `gnode ${shape}${selected ? ' sel' : ''}${status === 'running' ? ' active' : ''}`

  return (
    <div className="node-wrap" style={{ ['--n-color' as any]: def?.color }}>
      <div className={cls}>
        {trigger && (
          <span className="bolt">
            <Glyph name="bolt" size={13} />
          </span>
        )}

        {ports.inputs.map((p, i) => (
          <Handle
            key={`in-${p.name}`}
            id={p.name}
            type="target"
            position={Position.Left}
            className="port in"
            style={{ top: pct(i, ports.inputs.length) }}
            title={`${p.name}: ${p.type}`}
          />
        ))}

        <span className="gicon">
          <Icon type={type!} size={shape === 'circle' ? 24 : 28} stroke={1.9} />
        </span>

        {ports.outputs.map((p, i) => (
          <Handle
            key={`out-${p.name}`}
            id={p.name}
            type="source"
            position={Position.Right}
            className="port out"
            style={{ top: pct(i, ports.outputs.length) }}
            title={`${p.name}: ${p.type}`}
          />
        ))}

        {ports.outputs.length > 0 && (
          <button
            className="node-add nodrag"
            title="Add connected node"
            onClick={(e) => {
              e.stopPropagation()
              openPalette(e.clientX, e.clientY, id)
            }}
          >
            <Glyph name="plus" size={13} />
          </button>
        )}

        {status === 'running' && <span className="nrun" />}
        {status === 'done' && (
          <span className="ncheck">
            <Glyph name="check" size={11} stroke={2.6} />
          </span>
        )}
        {status === 'error' && (
          <span className="ncheck err">
            <Glyph name="x" size={11} stroke={2.6} />
          </span>
        )}
      </div>

      <div className={`nlabel ${shape}`}>
        <div className="nt">{title}</div>
        {sub && <div className="ns">{sub}</div>}
      </div>
    </div>
  )
}
