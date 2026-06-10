import { NODE_DEFS, NODE_ORDER } from '../canvas/nodeDefs'
import { Icon } from '../icons'

export function Popover({
  sx,
  sy,
  onPick,
  onClose,
}: {
  sx: number
  sy: number
  onPick: (type: string) => void
  onClose: () => void
}) {
  const W = 268
  const H = 360
  const left = Math.min(sx, window.innerWidth - W - 16)
  const top = Math.min(sy, window.innerHeight - H - 16)
  return (
    <>
      <div className="pop-overlay" onPointerDown={onClose} />
      <div className="pop" style={{ left, top }}>
        <div className="pop-head">Add node</div>
        <div className="pop-list">
          {NODE_ORDER.map((key) => {
            const t = NODE_DEFS[key]
            return (
              <div key={key} className="pop-item" style={{ ['--n-color' as any]: t.color }} onClick={() => onPick(key)}>
                <span className="pi-ico">
                  <Icon type={key} size={17} />
                </span>
                <div>
                  <div className="pi-t">{t.label}</div>
                  <div className="pi-d">{t.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
