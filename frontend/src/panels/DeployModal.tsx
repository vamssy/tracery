import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DeployOut } from '../types'
import { Modal } from './RunModal'

export function DeployModal({ ensureSaved, onClose }: { ensureSaved: () => Promise<string | null>; onClose: () => void }) {
  const [dep, setDep] = useState<DeployOut | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const id = await ensureSaved()
        if (!id) throw new Error('save the workflow first')
        setDep(await api.deploy(id))
      } catch (e) {
        setError((e as Error).message)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <Modal title="Deploy" onClose={onClose} wide>
      {error && <div className="run__error">{error}</div>}
      {!dep && !error && <div className="muted">Deploying…</div>}
      {dep && (
        <div className="deploy">
          <p className="deploy__lede">
            Your workflow's graph spec is <b>frozen</b> and live at the endpoint below. The API key is shown once.
          </p>

          <Row label="Endpoint" value={dep.endpoint_url} copied={copied} onCopy={copy} />
          <Row label="API key" value={dep.api_key} copied={copied} onCopy={copy} secret />

          <div className="field__label" style={{ marginTop: 14 }}>
            curl
            <button className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => copy('curl', dep.curl)}>
              {copied === 'curl' ? 'copied' : 'copy'}
            </button>
          </div>
          <pre className="io__pre deploy__curl">{dep.curl}</pre>
        </div>
      )}
    </Modal>
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
    <div className="deploy__row">
      <div className="field__label">{label}</div>
      <div className="deploy__value">
        <code className={secret ? 'secret' : ''}>{value}</code>
        <button className="btn btn--ghost btn--sm" onClick={() => onCopy(label, value)}>
          {copied === label ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  )
}
