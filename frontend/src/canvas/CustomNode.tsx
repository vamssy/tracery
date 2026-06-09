import { Handle, type NodeProps, Position } from '@xyflow/react'
import { NODE_DEFS, PORT_COLORS, declarePorts } from './nodeDefs'

const HEAD = 38
const PAD = 10
const ROW = 26

function handleTop(i: number): number {
  return HEAD + PAD + i * ROW + ROW / 2
}

export function CustomNode({ type, data, selected }: NodeProps) {
  const def = NODE_DEFS[type!]
  const config = (data as { config: Record<string, any> }).config
  const ports = declarePorts(type!, config)
  const rows = Math.max(ports.inputs.length, ports.outputs.length, 1)

  return (
    <div className="md-node" style={{ outline: selected ? `2px solid ${def.accent}` : 'none' }}>
      <div className="md-node__head" style={{ background: def.accent }}>
        <span className="md-node__dot" />
        {def.label}
      </div>

      <div className="md-node__io" style={{ minHeight: rows * ROW + PAD * 2 }}>
        <div className="md-col md-col--in">
          {ports.inputs.map((p) => (
            <div className="md-portrow" key={p.name}>
              {p.name}
              {p.required === false && <span className="md-opt">?</span>}
            </div>
          ))}
        </div>
        <div className="md-col md-col--out">
          {ports.outputs.map((p) => (
            <div className="md-portrow md-portrow--out" key={p.name}>
              {p.name}
            </div>
          ))}
        </div>
      </div>

      {ports.inputs.map((p, i) => (
        <Handle
          key={`in-${p.name}`}
          id={p.name}
          type="target"
          position={Position.Left}
          style={{ top: handleTop(i), background: PORT_COLORS[p.type], borderColor: PORT_COLORS[p.type] }}
          title={`${p.name}: ${p.type}`}
        />
      ))}
      {ports.outputs.map((p, i) => (
        <Handle
          key={`out-${p.name}`}
          id={p.name}
          type="source"
          position={Position.Right}
          style={{ top: handleTop(i), background: PORT_COLORS[p.type], borderColor: PORT_COLORS[p.type] }}
          title={`${p.name}: ${p.type}`}
        />
      ))}
    </div>
  )
}
