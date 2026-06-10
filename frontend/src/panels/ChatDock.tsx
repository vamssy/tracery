import { useEffect, useRef, useState } from 'react'
import { Glyph } from '../icons'
import type { RunOut } from '../types'
import { TraceView } from './TraceView'

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  err?: boolean
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
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = () => {
    const v = text.trim()
    if (!v || running) return
    onSend(v)
    setText('')
  }

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
        {trace ? <TraceView trace={trace} /> : <div className="logs-empty">Run the workflow to see a per-node trace here.</div>}
      </div>
    </div>
  )
}
