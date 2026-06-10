import { type Edge, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api/client'
import { Canvas } from './canvas/Canvas'
import { type MdNode, useCanvas } from './store/store'
import { BottomBar } from './components/BottomBar'
import { Rail } from './components/Rail'
import { type MenuItem, TopBar } from './components/TopBar'
import { type Toast, Toasts } from './components/Toasts'
import { type ChatMsg, ChatDock } from './panels/ChatDock'
import { ConfigPanel } from './panels/ConfigPanel'
import { DeployModal } from './panels/DeployModal'
import { TEMPLATES } from './templates'
import type { DeployOut, RunOut, WorkflowSummary } from './types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── simple layered auto-layout ───────────────────────────────────────────────
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

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [trace, setTrace] = useState<RunOut | null>(null)
  const [deploy, setDeploy] = useState<DeployOut | null>(null)
  const [active, setActive] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const [tag, setTag] = useState<{ text: string; kind: 'valid' | 'err' } | null>(null)
  const rfApi = useRef<ReturnType<typeof useReactFlow> | null>(null)

  const pushToast = (t: Omit<Toast, 'id'>) => {
    const id = `t${Date.now()}${Math.round(performance.now())}`
    setToasts((ts) => [...ts, { id, ...t }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800)
  }

  const refreshWorkflows = () => api.listWorkflows().then(setWorkflows).catch(() => {})
  const fit = () => setTimeout(() => rfApi.current?.fitView({ padding: 0.3, duration: 300 }), 60)

  useEffect(() => {
    refreshWorkflows()
    loadGraphSpec(TEMPLATES[0].build(), null, TEMPLATES[0].name)
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── actions ────────────────────────────────────────────────────────────────
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
        setTag({ text: '✓ valid', kind: 'valid' })
        pushToast({ type: 'ok', title: 'Workflow is valid' })
      } else {
        setTag({ text: `✕ ${res.errors.length} issue${res.errors.length > 1 ? 's' : ''}`, kind: 'err' })
        pushToast({ type: 'warn', title: `${res.errors.length} issue(s) found`, desc: res.errors[0] })
      }
    } catch (e) {
      pushToast({ type: 'err', title: 'Validate failed', desc: (e as Error).message })
    }
  }

  const loadTemplate = (tname: string) => {
    const t = TEMPLATES.find((x) => x.name === tname)
    if (!t) return
    loadGraphSpec(t.build(), null, t.name)
    setTag(null)
    setTrace(null)
    setChatMsgs([])
    fit()
    pushToast({ type: 'info', title: 'Template loaded', desc: t.name })
  }

  const loadWorkflow = async (id: string) => {
    if (!id) return
    try {
      const wf = await api.getWorkflow(id)
      loadGraphSpec(wf.graph_spec, wf.id, wf.name)
      setTag(null)
      setTrace(null)
      setChatMsgs([])
      fit()
    } catch (e) {
      pushToast({ type: 'err', title: 'Load failed', desc: (e as Error).message })
    }
  }

  const newWf = () => {
    newWorkflow()
    setTag(null)
    setTrace(null)
    setChatMsgs([])
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

  const onShare = async () => {
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

  // ── run (real) ───────────────────────────────────────────────────────────────
  const run = async (inputText?: string) => {
    const st = useCanvas.getState()
    if (st.running) return
    if (!st.nodes.length) {
      pushToast({ type: 'warn', title: 'Nothing to run', desc: 'Add nodes first.' })
      return
    }
    const inputNode = st.nodes.find((n) => n.type === 'input')
    const fields: any[] = inputNode?.data.config.fields || []
    const input: Record<string, any> = {}
    fields.forEach((f, i) => {
      const raw = i === 0 ? (inputText ?? '') : ''
      input[f.name] = f.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw
    })

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
      const res = await api.run(id, input)
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

  // keyboard
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
          tag={tag?.text ?? null}
          tagKind={tag?.kind ?? null}
          active={active}
          onToggleActive={() => {
            setActive((a) => !a)
            pushToast({ type: active ? 'warn' : 'ok', title: active ? 'Workflow paused' : 'Workflow active' })
          }}
          dirty={dirty}
          onShare={onShare}
          onUndo={() => {
            if (!undo()) pushToast({ type: 'info', title: 'Nothing to undo' })
          }}
          menu={menu}
          workflows={workflows}
          currentId={workflowId}
          onLoad={loadWorkflow}
        />
        <div className="main">
          <Rail onTemplate={() => loadTemplate(TEMPLATES[0].name)} />
          <div className="stage">
            <ReactFlowProvider>
              <RFBridge apiRef={rfApi} />
              <div className="canvas-area">
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
                  onSpark={() => pushToast({ type: 'info', title: 'Tracery AI', desc: 'Coming soon — describe a workflow to generate it.' })}
                  onUndo={() => {
                    if (!undo()) pushToast({ type: 'info', title: 'Nothing to undo' })
                  }}
                  onTidy={tidy}
                />
              </div>
              {chatOpen && <ChatDock messages={chatMsgs} onSend={(t) => run(t)} running={running} trace={trace} />}
            </ReactFlowProvider>
          </div>
        </div>
      </div>

      {deploy && <DeployModal deploy={deploy} onClose={() => setDeploy(null)} />}
      <Toasts toasts={toasts} />
    </div>
  )
}
