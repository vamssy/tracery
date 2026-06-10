import { useEffect, useRef, useState } from 'react'
import { NODE_DEFS } from '../canvas/nodeDefs'
import { Glyph, Icon } from '../icons'
import type { RunOut, SpanOut } from '../types'

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  err?: boolean
}

function colorJSON(obj: any): string {
  if (obj === undefined || obj === null) return ''
  return JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="n">$1</span>')
}

export function ChatDock({
  messages,
  onSend,
  running,
  trace,
}: {
  messages: ChatMsg[]
  onSend: (text: string) => void
  running: boolean
  trace: RunOut | null
}) {
  const [text, setText] = useState('')
  const [spanIdx, setSpanIdx] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => {
    setSpanIdx(0)
  }, [trace])

  const send = () => {
    const v = text.trim()
    if (!v || running) return
    onSend(v)
    setText('')
  }

  const spans = trace?.trace.spans ?? []
  const span: SpanOut | undefined = spans[spanIdx]

  return (
    <div className="chat">
      {/* chat */}
      <div className="chat-col">
        <div className="chat-head">
          <span className="ch-t">Chat</span>
          <span className="ch-meta">runs the workflow live</span>
        </div>
        <div className="chat-msgs">
          {messages.length === 0 && (
            <div className="chat-empty">Type a message to run the workflow.{'\n'}The answer comes from your live pipeline.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <span className="av">{m.role === 'user' ? 'VR' : <Glyph name="spark" size={13} />}</span>
              <div className={`bubble${m.err ? ' err' : ''}`}>{m.text}</div>
            </div>
          ))}
          {running && (
            <div className="msg assistant">
              <span className="av">
                <Glyph name="spark" size={13} />
              </span>
              <div className="bubble">Running through the workflow…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="chat-input">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask your workflow something…"
          />
          <button className="send" onClick={send} disabled={running}>
            <Glyph name="send" size={16} />
          </button>
        </div>
      </div>

      {/* logs */}
      <div className="chat-col">
        <div className="chat-head">
          <span className="ch-t">Trace</span>
          {trace && (
            <span className="logs-totals">
              <span>
                <b>{trace.trace.total_latency_ms}</b> ms
              </span>
              <span>
                $<b>{trace.trace.total_cost_usd.toFixed(6)}</b>
              </span>
            </span>
          )}
        </div>
        <div className="logs-body">
          {spans.length === 0 ? (
            <div className="logs-empty">Run the workflow to see a per-node trace here.</div>
          ) : (
            <>
              <div className="logs-tree">
                {spans.map((s, i) => {
                  const t = NODE_DEFS[s.node_type]
                  return (
                    <div
                      key={i}
                      className={`lt-item${i === spanIdx ? ' on' : ''}`}
                      style={{ ['--n-color' as any]: t?.color }}
                      onClick={() => setSpanIdx(i)}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
