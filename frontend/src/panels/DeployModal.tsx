import { useState } from 'react'
import { Glyph } from '../icons'
import type { DeployOut } from '../types'

export function DeployModal({ deploy, onClose }: { deploy: DeployOut; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1200)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="mh-t">
            <Glyph name="rocket" size={18} />
            Deployed
          </span>
          <button className="cfg-x" onClick={onClose}>
            <Glyph name="x" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="lede">
            Your workflow's graph spec is <b>frozen</b> and live at the endpoint below. The API key is shown once — copy it now.
          </p>
          <Row label="Endpoint" value={deploy.endpoint_url} copied={copied} onCopy={copy} />
          <Row label="API key" value={deploy.api_key} secret copied={copied} onCopy={copy} />
          <div className="kvrow">
            <span className="kr-l">
              curl
              <button className="btn-mini" style={{ marginLeft: 8, height: 22 }} onClick={() => copy('curl', deploy.curl)}>
                {copied === 'curl' ? 'copied' : 'copy'}
              </button>
            </span>
            <div className="kv" style={{ whiteSpace: 'pre', overflowX: 'auto' }}>
              {deploy.curl}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  secret,
  copied,
  onCopy,
}: {
  label: string
  value: string
  secret?: boolean
  copied: string | null
  onCopy: (l: string, v: string) => void
}) {
  return (
    <div className="kvrow">
      <span className="kr-l">{label}</span>
      <div className="kr-v">
        <code className={secret ? 'secret' : ''}>{value}</code>
        <button className="btn-mini" onClick={() => onCopy(label, value)}>
          {copied === label ? 'copied' : <Glyph name="copy" size={13} />}
        </button>
      </div>
    </div>
  )
}
