import { useEffect, useState } from 'react'
import { NODE_DEFS } from '../canvas/nodeDefs'
import { Glyph, Icon } from '../icons'
import type { RunOut, SpanOut } from '../types'

export function colorJSON(obj: any): string {
  if (obj === undefined || obj === null) return ''
  return JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="n">$1</span>')
}

// The per-node trace: a tree of spans on the left, the selected span's detail on the right.
export function TraceView({ trace }: { trace: RunOut }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    setIdx(0)
  }, [trace])

  const spans = trace.trace.spans
  const span: SpanOut | undefined = spans[idx]
  if (!spans.length) return <div className="logs-empty">This run has no spans.</div>

  return (
    <div className="logs-body">
      <div className="logs-tree">
        {spans.map((s, i) => {
          const t = NODE_DEFS[s.node_type]
          return (
            <div
              key={i}
              className={`lt-item${i === idx ? ' on' : ''}`}
              style={{ ['--n-color' as any]: t?.color }}
              onClick={() => setIdx(i)}
            >
              <span className="lt-ico">
                <Icon type={s.node_type} size={15} />
              </span>
              {s.node_id}
              <span className={`lt-dot ${s.status}`} />
            </div>
          )
        })}
      </div>
      <div className="logs-detail">
        {span && (
          <>
            <div className="ld-h" style={{ ['--n-color' as any]: NODE_DEFS[span.node_type]?.color }}>
              <span className="ld-ico">
                <Icon type={span.node_type} size={16} />
              </span>
              {span.node_id}
            </div>
            <div className="ld-time">
              <span>{span.latency_ms ?? 0} ms</span>
              {span.tokens_in != null && (
                <span>
                  {span.tokens_in}/{span.tokens_out} tok
                </span>
              )}
              {span.cost_usd != null && <span>${span.cost_usd.toFixed(6)}</span>}
              <span style={{ color: span.status === 'ok' ? 'var(--green)' : 'var(--coral)' }}>{span.status}</span>
            </div>
            {span.error && (
              <>
                <div className="ld-sec">Error</div>
                <div className="kv" style={{ color: '#ffb4a6' }}>
                  {span.error}
                </div>
              </>
            )}
            <div className="ld-sec">
              <Glyph name="caretD" size={13} />
              Input
            </div>
            <div className="kv" dangerouslySetInnerHTML={{ __html: colorJSON(span.inputs) || '—' }} />
            <div className="ld-sec">
              <Glyph name="caretD" size={13} />
              Output
            </div>
            <div className="kv" dangerouslySetInnerHTML={{ __html: colorJSON(span.outputs) || '—' }} />
          </>
        )}
      </div>
    </div>
  )
}
