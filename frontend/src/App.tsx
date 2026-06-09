import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import { ApiError, api } from './api/client'
import { Canvas } from './canvas/Canvas'
import { Palette } from './canvas/Palette'
import { ConfigPanel } from './panels/ConfigPanel'
import { useCanvas } from './store/store'
import { ragTemplate } from './templates'
import type { ValidateResult, WorkflowSummary } from './types'

export default function App() {
  // individual selectors — zustand v5 re-renders on every call for object selectors
  const workflowId = useCanvas((s) => s.workflowId)
  const workflowName = useCanvas((s) => s.workflowName)
  const dirty = useCanvas((s) => s.dirty)
  const nodeCount = useCanvas((s) => s.nodes.length)
  const setName = useCanvas((s) => s.setName)
  const setSavedAs = useCanvas((s) => s.setSavedAs)
  const newWorkflow = useCanvas((s) => s.newWorkflow)
  const loadGraphSpec = useCanvas((s) => s.loadGraphSpec)
  const toGraphSpec = useCanvas((s) => s.toGraphSpec)

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [validation, setValidation] = useState<ValidateResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refreshWorkflows = () => api.listWorkflows().then(setWorkflows).catch(() => {})
  useEffect(() => {
    refreshWorkflows()
  }, [])

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2500)
  }

  const save = async () => {
    const spec = toGraphSpec()
    try {
      if (workflowId) {
        await api.updateWorkflow(workflowId, { name: workflowName, graph_spec: spec })
        setSavedAs(workflowId, workflowName)
        flash('Saved')
      } else {
        const wf = await api.createWorkflow(workflowName, spec)
        setSavedAs(wf.id, wf.name)
        flash('Created')
      }
      refreshWorkflows()
    } catch (e) {
      flash(`Save failed: ${(e as Error).message}`)
    }
  }

  const validate = async () => {
    try {
      setValidation(await api.validate(toGraphSpec()))
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

  const loadSample = () => {
    loadGraphSpec(ragTemplate(), null, 'RAG starter')
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
        <button className="btn btn--ghost" onClick={loadSample}>
          Sample
        </button>
        <button className="btn btn--ghost" onClick={newWorkflow}>
          New
        </button>
        <button className="btn btn--ghost" onClick={validate} disabled={!nodeCount}>
          Validate
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
