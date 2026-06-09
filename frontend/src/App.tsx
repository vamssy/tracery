import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import { ApiError, api } from './api/client'
import { Canvas } from './canvas/Canvas'
import { Palette } from './canvas/Palette'
import { ConfigPanel } from './panels/ConfigPanel'
import { DeployModal } from './panels/DeployModal'
import { RunModal } from './panels/RunModal'
import { useCanvas } from './store/store'
import { TEMPLATES } from './templates'
import type { ValidateResult, WorkflowSummary } from './types'

export default function App() {
  const workflowId = useCanvas((s) => s.workflowId)
  const workflowName = useCanvas((s) => s.workflowName)
  const dirty = useCanvas((s) => s.dirty)
  const nodeCount = useCanvas((s) => s.nodes.length)
  const setName = useCanvas((s) => s.setName)
  const newWorkflow = useCanvas((s) => s.newWorkflow)
  const loadGraphSpec = useCanvas((s) => s.loadGraphSpec)

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [validation, setValidation] = useState<ValidateResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [runOpen, setRunOpen] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)

  const refreshWorkflows = () => api.listWorkflows().then(setWorkflows).catch(() => {})
  useEffect(() => {
    refreshWorkflows()
  }, [])

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2500)
  }

  // Save the current canvas; returns the workflow id (reads live store state so it
  // is safe to call from modals). Returns null on failure.
  const save = async (): Promise<string | null> => {
    const st = useCanvas.getState()
    const spec = st.toGraphSpec()
    try {
      if (st.workflowId) {
        await api.updateWorkflow(st.workflowId, { name: st.workflowName, graph_spec: spec })
        st.setSavedAs(st.workflowId, st.workflowName)
        flash('Saved')
        refreshWorkflows()
        return st.workflowId
      }
      const wf = await api.createWorkflow(st.workflowName, spec)
      st.setSavedAs(wf.id, wf.name)
      flash('Created')
      refreshWorkflows()
      return wf.id
    } catch (e) {
      flash(`Save failed: ${(e as Error).message}`)
      return null
    }
  }

  const ensureSaved = async (): Promise<string | null> => {
    const st = useCanvas.getState()
    return st.workflowId && !st.dirty ? st.workflowId : save()
  }

  const validate = async () => {
    try {
      setValidation(await api.validate(useCanvas.getState().toGraphSpec()))
    } catch (e) {
      if (e instanceof ApiError) flash(`Validate failed: ${e.message}`)
    }
  }

  const load = async (id: string) => {
    if (!id) return
    const wf = await api.getWorkflow(id)
    loadGraphSpec(wf.graph_spec, wf.id, wf.name)
    setValidation(null)
  }

  const loadTemplate = (name: string) => {
    const t = TEMPLATES.find((x) => x.name === name)
    if (!t) return
    loadGraphSpec(t.build(), null, name)
    setValidation(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">◆</span> Mini-Dify
        </div>
        <input className="topbar__name" value={workflowName} onChange={(e) => setName(e.target.value)} />
        <span className={`pill ${dirty ? 'pill--warn' : 'pill--ok'}`}>{dirty ? 'unsaved' : workflowId ? 'saved' : 'new'}</span>

        <div className="topbar__spacer" />

        {validation && (
          <span className={`pill ${validation.valid ? 'pill--ok' : 'pill--err'}`}>
            {validation.valid ? '✓ valid' : `✕ ${validation.errors.length} error(s)`}
          </span>
        )}

        <select className="topbar__select" value={workflowId || ''} onChange={(e) => load(e.target.value)}>
          <option value="">Load…</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className="topbar__select"
          value=""
          onChange={(e) => {
            loadTemplate(e.target.value)
            e.currentTarget.value = ''
          }}
        >
          <option value="">Templates…</option>
          {TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn btn--ghost" onClick={newWorkflow}>
          New
        </button>
        <button className="btn btn--ghost" onClick={validate} disabled={!nodeCount}>
          Validate
        </button>
        <button className="btn btn--ghost" onClick={() => setRunOpen(true)} disabled={!nodeCount}>
          ▶ Run
        </button>
        <button className="btn btn--ghost" onClick={() => setDeployOpen(true)} disabled={!nodeCount}>
          Deploy
        </button>
        <button className="btn btn--primary" onClick={save} disabled={!nodeCount}>
          Save
        </button>
      </header>

      {validation && !validation.valid && (
        <div className="errors">
          {validation.errors.map((e, i) => (
            <div className="errors__item" key={i}>
              {e}
            </div>
          ))}
        </div>
      )}

      <ReactFlowProvider>
        <div className="editor">
          <Palette />
          <Canvas />
          <ConfigPanel />
        </div>
      </ReactFlowProvider>

      {runOpen && <RunModal ensureSaved={ensureSaved} onClose={() => setRunOpen(false)} />}
      {deployOpen && <DeployModal ensureSaved={ensureSaved} onClose={() => setDeployOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
