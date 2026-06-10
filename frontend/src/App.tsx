import { type Edge, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api/client'
import { Canvas } from './canvas/Canvas'
import { type MdNode, useCanvas } from './store/store'
import { BottomBar } from './components/BottomBar'
import { HelpModal } from './components/HelpModal'
import { Rail } from './components/Rail'
import { type MenuItem, TopBar } from './components/TopBar'
import { type Toast, Toasts } from './components/Toasts'
import { type ChatMsg, ChatDock } from './panels/ChatDock'
import { ConfigPanel } from './panels/ConfigPanel'
import { DeployModal } from './panels/DeployModal'
import { ExecutionsPanel } from './panels/ExecutionsPanel'
import { TestsPanel } from './panels/TestsPanel'
import { TEMPLATES } from './templates'
import type { DeployOut, RunOut, WorkflowSummary } from './types'

type Tab = 'Editor' | 'Executions' | 'Tests'
const TABS: Tab[] = ['Editor', 'Executions', 'Tests']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function topoOrder(nodes: MdNode[], edges: { source: string; target: string }[]): string[] {
  const indeg: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  nodes.forEach((n) => {
    indeg[n.id] = 0
    adj[n.id] = []
  })
  edges.forEach((e) => {
    if (indeg[e.target] != null) {
      indeg[e.target]++
      adj[e.source]?.push(e.target)
    }
  })
  const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
  const order: string[] = []
  while (q.length) {
    const id = q.shift()!
    order.push(id)
    adj[id]?.forEach((t) => {
      if (--indeg[t] === 0) q.push(t)
    })
  }
  nodes.forEach((n) => !order.includes(n.id) && order.push(n.id))
  return order
}

function autoLayout(nodes: MdNode[], edges: Edge[]): MdNode[] {
  const order = topoOrder(nodes, edges)
  const depth: Record<string, number> = {}
  nodes.forEach((n) => (depth[n.id] = 0))
  order.forEach((id) => {
    edges.filter((e) => e.target === id).forEach((e) => (depth[id] = Math.max(depth[id], (depth[e.source] ?? 0) + 1)))
  })
  const cols: Record<number, MdNode[]> = {}
  nodes.forEach((n) => ((cols[depth[n.id]] ||= []).push(n)))
  return nodes.map((n) => {
    const d = depth[n.id]
    const row = cols[d].indexOf(n)
    return { ...n, position: { x: 100 + d * 250, y: 140 + row * 180 } }
  })
}

function RFBridge({ apiRef }: { apiRef: React.MutableRefObject<ReturnType<typeof useReactFlow> | null> }) {
  const rf = useReactFlow()
  useEffect(() => {
    apiRef.current = rf
  }, [rf, apiRef])
  return null
}

export default function App() {
  const name = useCanvas((s) => s.workflowName)
  const dirty = useCanvas((s) => s.dirty)
  const workflowId = useCanvas((s) => s.workflowId)
  const running = useCanvas((s) => s.running)
  const setName = useCanvas((s) => s.setName)
  const newWorkflow = useCanvas((s) => s.newWorkflow)
  const loadGraphSpec = useCanvas((s) => s.loadGraphSpec)
  const undo = useCanvas((s) => s.undo)
  const deleteNode = useCanvas((s) => s.deleteNode)
  const setGraph = useCanvas((s) => s.setGraph)
  const openPalette = useCanvas((s) => s.openPalette)

  const [tab, setTab] = useState<Tab>('Editor')
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [trace, setTrace] = useState<RunOut | null>(null)
  const [deploy, setDeploy] = useState<DeployOut | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [vtag, setVtag] = useState<{ text: string; kind: 'valid' | 'err' } | null>(null)
  const rfApi = useRef<ReturnType<typeof useReactFlow> | null>(null)

  const pushToast = (t: Omit<Toast, 'id'>) => {
    const id = `t${Date.now()}${Math.round(performance.now())}`
    setToasts((ts) => [...ts, { id, ...t }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800)
  }

  const refreshWorkflows = () => api.listWorkflows().then(setWorkflows).catch(() => {})
  const fit = () => setTimeout(() => rfApi.current?.fitView({ padding: 0.3, duration: 300 }), 80)

  useEffect(() => {
    refreshWorkflows()
    loadGraphSpec(TEMPLATES[0].build(), null, TEMPLATES[0].name)
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (): Promise<string | null> => {
    const st = useCanvas.getState()
    try {
      if (st.workflowId) {
        await api.updateWorkflow(st.workflowId, { name: st.workflowName, graph_spec: st.toGraphSpec() })
        st.setSavedAs(st.workflowId, st.workflowName)
        pushToast({ type: 'ok', title: 'Saved', desc: st.workflowName })
        refreshWorkflows()
        return st.workflowId
      }
      const wf = await api.createWorkflow(st.workflowName, st.toGraphSpec())
      st.setSavedAs(wf.id, wf.name)
      pushToast({ type: 'ok', title: 'Created', desc: wf.name })
      refreshWorkflows()
      return wf.id
    } catch (e) {
      pushToast({ type: 'err', title: 'Save failed', desc: (e as Error).message })
      return null
    }
  }
  const ensureSaved = async (): Promise<string | null> => {
    const st = useCanvas.getState()
    return st.workflowId && !st.dirty ? st.workflowId : save()
  }

  const validate = async () => {
    try {
      const res = await api.validate(useCanvas.getState().toGraphSpec())
      if (res.valid) {
        setVtag({ text: '✓ valid', kind: 'valid' })
        pushToast({ type: 'ok', title: 'Workflow is valid' })
      } else {
        setVtag({ text: `✕ ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}`, kind: 'err' })
        pushToast({ type: 'warn', title: `${res.errors.length} issue(s) found`, desc: res.errors[0] })
      }
    } catch (e) {
      pushToast({ type: 'err', title: 'Validate failed', desc: (e as Error).message })
    }
  }

  const resetViews = () => {
    setVtag(null)
    setTrace(null)
    setChatMsgs([])
  }
  const loadTemplate = (tname: string) => {
    const t = TEMPLATES.find((x) => x.name === tname)
    if (!t) return
    setTab('Editor')
    loadGraphSpec(t.build(), null, t.name)
    resetViews()
    fit()
    pushToast({ type: 'info', title: 'Template loaded', desc: t.name })
  }
  const loadWorkflow = async (id: string) => {
    if (!id) return
    try {
      const wf = await api.getWorkflow(id)
      setTab('Editor')
      loadGraphSpec(wf.graph_spec, wf.id, wf.name)
      resetViews()
      fit()
    } catch (e) {
      pushToast({ type: 'err', title: 'Load failed', desc: (e as Error).message })
    }
  }
  const newWf = () => {
    setTab('Editor')
    newWorkflow()
    resetViews()
    pushToast({ type: 'info', title: 'New workflow' })
  }

  const exportJSON = () => {
    const spec = useCanvas.getState().toGraphSpec()
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'workflow'}.json`
    a.click()
    URL.revokeObjectURL(url)
    pushToast({ type: 'info', title: 'Exported workflow.json', desc: `${spec.nodes.length} nodes` })
  }

  const deployWorkflow = async () => {
    const st = useCanvas.getState()
    if (!st.nodes.length) {
      pushToast({ type: 'warn', title: 'Nothing to deploy' })
      return
    }
    const id = await ensureSaved()
    if (!id) return
    try {
      setDeploy(await api.deploy(id))
      pushToast({ type: 'ok', title: 'Deployed', desc: 'Endpoint is live' })
    } catch (e) {
      pushToast({ type: 'err', title: 'Deploy failed', desc: (e as Error).message })
    }
  }

  const tidy = () => {
    const st = useCanvas.getState()
    st.snapshot()
    setGraph(autoLayout(st.nodes, st.edges), st.edges)
    fit()
    pushToast({ type: 'info', title: 'Tidied up' })
  }

  const railAdd = () => {
    setTab('Editor')
    openPalette(window.innerWidth / 2, 200, null)
  }

  // build the run input from the Input node's fields
  const buildInput = (inputText: string): Record<string, any> => {
    const st = useCanvas.getState()
    const fields: any[] = st.nodes.find((n) => n.type === 'input')?.data.config.fields || []
    const input: Record<string, any> = {}
    fields.forEach((f, i) => {
      const raw = i === 0 ? inputText : ''
      input[f.name] = f.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw
    })
    return input
  }

  // quiet run for the Tests tab
  const runOnce = async (inputText: string): Promise<RunOut> => {
    const id = await ensureSaved()
    if (!id) throw new ApiError(0, 'could not save workflow')
    return api.run(id, buildInput(inputText))
  }

  // interactive run (Editor chat / Test workflow) — animates + shows trace
  const run = async (inputText?: string) => {
    const st = useCanvas.getState()
    if (st.running) return
    if (!st.nodes.length) {
      pushToast({ type: 'warn', title: 'Nothing to run', desc: 'Add nodes first.' })
      return
    }
    if (inputText) setChatMsgs((m) => [...m, { role: 'user', text: inputText }])
    st.clearRunStatuses()
    st.setRunning(true)
    setTrace(null)
    const id = await ensureSaved()
    if (!id) {
      st.setRunning(false)
      return
    }
    try {
      const res = await api.run(id, buildInput(inputText ?? ''))
      for (const s of res.trace.spans) {
        st.setRunStatus(s.node_id, 'running')
        await sleep(240)
        st.setRunStatus(s.node_id, s.status === 'ok' ? 'done' : 'error')
      }
      setTrace(res)
      if (res.status === 'completed') {
        const out = typeof res.output === 'string' ? res.output : JSON.stringify(res.output, null, 2)
        if (inputText !== undefined) setChatMsgs((m) => [...m, { role: 'assistant', text: out || '(empty output)' }])
        pushToast({ type: 'ok', title: 'Run complete', desc: `${res.trace.spans.length} nodes · ${res.trace.total_latency_ms}ms` })
      } else {
        const err = res.error || 'Run failed'
        if (inputText !== undefined) setChatMsgs((m) => [...m, { role: 'assistant', text: err, err: true }])
        pushToast({ type: 'err', title: 'Run failed', desc: err })
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message
      if (inputText !== undefined) setChatMsgs((m) => [...m, { role: 'assistant', text: msg, err: true }])
      pushToast({ type: 'err', title: 'Run error', desc: msg })
    } finally {
      st.setRunning(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.matches('input,textarea,select')) return
      const sel = useCanvas.getState().selectedNodeId
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        deleteNode(sel)
      }
      if (e.key === 'Escape') {
        useCanvas.getState().setSelected(null)
        useCanvas.getState().closePalette()
        setHelpOpen(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteNode, undo])

  const menu: MenuItem[] = [
    { icon: 'home', label: 'New workflow', fn: newWf },
    { sep: true },
    ...TEMPLATES.map((t) => ({ icon: 'layers', label: `Template · ${t.name}`, fn: () => loadTemplate(t.name) })),
    { sep: true },
    { icon: 'check', label: 'Validate', fn: validate },
    { icon: 'history', label: 'Save', fn: save },
    { icon: 'send', label: 'Export JSON', fn: exportJSON },
  ]

  return (
    <div className="app">
      <div className="window">
        <TopBar
          name={name}
          onName={setName}
          tag={vtag?.text ?? null}
          tagKind={vtag?.kind ?? null}
          dirty={dirty}
          onDeploy={deployWorkflow}
          menu={menu}
          workflows={workflows}
          currentId={workflowId}
          onLoad={loadWorkflow}
        />
        <div className="main">
          <Rail onAdd={railAdd} onHelp={() => setHelpOpen(true)} />
          <div className="stage">
            <div className="canvas-area">
              <div className="cv-tabs">
                {TABS.map((t) => (
                  <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'Editor' && (
                <ReactFlowProvider>
                  <RFBridge apiRef={rfApi} />
                  <Canvas />
                  <ConfigPanel pushToast={pushToast} />
                  <BottomBar
                    running={running}
                    chatOpen={chatOpen}
                    onRun={() => run()}
                    onToggleChat={() => setChatOpen((c) => !c)}
                    onTrash={() => {
                      const sel = useCanvas.getState().selectedNodeId
                      if (sel) deleteNode(sel)
                      else pushToast({ type: 'info', title: 'Nothing selected' })
                    }}
                    onUndo={() => {
                      if (!undo()) pushToast({ type: 'info', title: 'Nothing to undo' })
                    }}
                    onTidy={tidy}
                  />
                </ReactFlowProvider>
              )}
              {tab === 'Executions' && <ExecutionsPanel workflowId={workflowId} />}
              {tab === 'Tests' && <TestsPanel workflowId={workflowId} runOnce={runOnce} pushToast={pushToast} />}
            </div>
            {tab === 'Editor' && chatOpen && <ChatDock messages={chatMsgs} onSend={(t) => run(t)} running={running} trace={trace} />}
          </div>
        </div>
      </div>

      {deploy && <DeployModal deploy={deploy} onClose={() => setDeploy(null)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      <Toasts toasts={toasts} />
    </div>
  )
}
