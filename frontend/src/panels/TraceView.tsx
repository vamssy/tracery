import { useState } from 'react'
import { NODE_DEFS } from '../canvas/nodeDefs'
import type { SpanOut, TraceOut } from '../types'

export function TraceView({ trace }: { trace: TraceOut }) {
  return (
    <div className="trace">
      <div className="trace__totals">
        <span>
          <b>{trace.total_latency_ms}</b> ms
        </span>
        <span>
          $<b>{trace.total_cost_usd.toFixed(6)}</b>
        </span>
        <span>{trace.spans.length} nodes</span>
      </div>
      <div className="trace__spans">
        {trace.spans.map((s) => (
          <SpanRow key={`${s.node_id}-${s.ordinal}`} span={s} />
        ))}
      </div>
    </div>
  )
}

function SpanRow({ span }: { span: SpanOut }) {
  const [open, setOpen] = useState(false)
  const accent = NODE_DEFS[span.node_type]?.accent ?? '#64748b'
  const hasIO = span.inputs != null || span.outputs != null
  return (
    <div className={`span span--${span.status}`}>
      <button className="span__head" onClick={() => hasIO && setOpen((o) => !o)}>
        <span className="span__dot" style={{ background: span.status === 'ok' ? '#22c55e' : '#ef4444' }} />
        <span className="span__type" style={{ color: accent }}>
          {span.node_type}
        </span>
        <span className="span__id">{span.node_id}</span>
        <span className="span__spacer" />
        {(span.attempts ?? 1) > 1 && <span className="span__meta span__retry">×{span.attempts}</span>}
        {span.tokens_in != null && (
          <span className="span__meta">
            {span.tokens_in}/{span.tokens_out} tok
          </span>
        )}
        {span.cost_usd != null && <span className="span__meta">${span.cost_usd.toFixed(6)}</span>}
        <span className="span__meta span__ms">{span.latency_ms ?? 0}ms</span>
        {hasIO && <span className="span__chev">{open ? '▾' : '▸'}</span>}
      </button>
      {span.error && <div className="span__error">{span.error}</div>}
      {open && (
        <div className="span__io">
          <IO label="inputs" value={span.inputs} />
          <IO label="outputs" value={span.outputs} />
        </div>
      )}
    </div>
  )
}

function IO({ label, value }: { label: string; value: any }) {
  if (value == null) return null
  return (
    <div className="io">
      <div className="io__label">{label}</div>
      <pre className="io__pre">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}
