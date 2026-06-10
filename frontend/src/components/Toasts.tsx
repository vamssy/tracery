import { Glyph } from '../icons'

export interface Toast {
  id: string
  type: 'ok' | 'warn' | 'err' | 'info'
  title: string
  desc?: string
}

const ICON: Record<Toast['type'], string> = { ok: 'check', warn: 'warn', err: 'x', info: 'info' }

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="ti">
            <Glyph name={ICON[t.type]} size={16} stroke={2} />
          </span>
          <div>
            <div className="tt">{t.title}</div>
            {t.desc && <div className="td">{t.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
