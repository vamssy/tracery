import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Glyph } from '../icons'
import type { RunOut, RunSummary } from '../types'
import { TraceView } from './TraceView'

function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const s = Math.max(0, Math.round((Date.now() - d) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function ExecutionsPanel({ workflowId }: { workflowId: string | null }) {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selected, setSelected] = useState<RunOut | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    if (!workflowId) return
    setLoading(true)
    api
      .listRuns(workflowId)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    setSelected(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId])

  const open = async (runId: string) => {
    try {
      setSelected(await api.getRun(runId))
    } catch {
      /* ignore */
    }
  }

  if (!workflowId) {
    return (
      <div className="panel">
        <div className="empty-big">Save and run this workflow first.{'\n'}Every execution shows up here with its full per-node trace.</div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-l">Executions</span>
        <span className="ph-sub">{runs.length} run(s)</span>
        <div className="spacer" />
        <button className="btn-mini" onClick={refresh}>
          <Glyph name="refresh" size={13} /> Refresh
        </button>
      </div>
      <div className="exec-body">
        <div className="exec-list">
          {!runs.length && <div className="empty-big" style={{ fontSize: 13 }}>{loading ? 'Loading…' : 'No runs yet.'}</div>}
          {runs.map((r) => (
            <div key={r.run_id} className={`exec-row${selected?.run_id === r.run_id ? ' on' : ''}`} onClick={() => open(r.run_id)}>
              <span className={`er-dot ${r.status}`} />
              <div className="er-main">
                <div className="er-id">{r.run_id.slice(0, 8)}</div>
                <div className="er-meta">
                  {r.status} · {relTime(r.created_at)}
                </div>
              </div>
              <div className="er-cost">
                {r.total_latency_ms ?? 0}ms
                <br />${(r.total_cost_usd ?? 0).toFixed(6)}
              </div>
            </div>
          ))}
        </div>
        <div className="exec-detail">
          {selected ? (
            <>
              <div className="ed-head">
                <span className="ph-l">{selected.run_id.slice(0, 8)}</span>
                <span className="logs-totals">
                  <span>
                    <b>{selected.trace.total_latency_ms}</b> ms
                  </span>
                  <span>
                    $<b>{selected.trace.total_cost_usd.toFixed(6)}</b>
                  </span>
                  <span style={{ color: selected.status === 'completed' ? 'var(--green)' : 'var(--coral)' }}>{selected.status}</span>
                </span>
              </div>
              <TraceView trace={selected} />
            </>
          ) : (
            <div className="empty-big">Select a run to inspect its trace.</div>
          )}
        </div>
      </div>
    </div>
  )
}
