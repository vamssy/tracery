import { useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import { useCanvas } from '../store/store'
import type { RunOut } from '../types'
import { TraceView } from './TraceView'

export function RunModal({ ensureSaved, onClose }: { ensureSaved: () => Promise<string | null>; onClose: () => void }) {
  const nodes = useCanvas((s) => s.nodes)
  const fields = useMemo(() => {
    const input = nodes.find((n) => n.type === 'input')
    return (input?.data.config.fields || []) as { name: string; type: string; required?: boolean; default?: any }[]
  }, [nodes])

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.default != null ? String(f.default) : ''])),
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunOut | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      const id = await ensureSaved()
      if (!id) throw new Error('save the workflow first')
      const input: Record<string, any> = {}
      for (const f of fields) {
        const raw = values[f.name] ?? ''
        if (f.type === 'number') input[f.name] = raw === '' ? null : Number(raw)
        else if (f.type === 'json') input[f.name] = raw ? JSON.parse(raw) : null
        else input[f.name] = raw
      }
      setResult(await api.run(id, input))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal title="Run workflow" onClose={onClose} wide={!!result}>
      <div className="run">
        <div className="run__form">
          {fields.length === 0 && <div className="muted">No input fields — add an Input node.</div>}
          {fields.map((f) => (
            <label className="field" key={f.name}>
              <span className="field__label">
                {f.name} <span className="muted">· {f.type}</span>
              </span>
              {f.type === 'json' ? (
                <textarea
                  className="input input--area mono"
                  rows={3}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : (
                <input
                  className="input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <button className="btn btn--primary" onClick={run} disabled={running}>
            {running ? 'Running…' : '▶ Run'}
          </button>
          {error && <div className="run__error">{error}</div>}
        </div>

        {result && (
          <div className="run__result">
            <div className={`pill ${result.status === 'completed' ? 'pill--ok' : 'pill--err'}`}>{result.status}</div>
            <div className="field__label" style={{ marginTop: 12 }}>
              Output
            </div>
            <pre className="io__pre run__output">
              {typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
            </pre>
            <div className="field__label" style={{ marginTop: 12 }}>
              Trace
            </div>
            <TraceView trace={result.trace} />
          </div>
        )}
      </div>
    </Modal>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span className="modal__title">{title}</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
