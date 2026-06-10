import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react'
import { create } from 'zustand'
import { NODE_DEFS, declarePorts, typesCompatible } from '../canvas/nodeDefs'
import type { GraphSpec, PortType } from '../types'

export type RunStatus = 'running' | 'done' | 'error' | undefined

export interface MdNodeData extends Record<string, unknown> {
  config: Record<string, any>
  title: string
}
export type MdNode = Node<MdNodeData>

let _seq = 0
const newId = (type: string) => `${type}_${Date.now().toString(36)}${(_seq++).toString(36)}`

function portType(node: MdNode | undefined, handle: string | null | undefined, side: 'inputs' | 'outputs'): PortType | null {
  if (!node || !handle) return null
  const ports = declarePorts(node.type!, node.data.config)
  const p = ports[side].find((x) => x.name === handle)
  return p ? p.type : null
}

// ── undo history (module-level so it never triggers re-renders) ──────────────
interface Snap {
  nodes: MdNode[]
  edges: Edge[]
}
const history: Snap[] = []
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

interface CanvasState {
  nodes: MdNode[]
  edges: Edge[]
  workflowId: string | null
  workflowName: string
  selectedNodeId: string | null
  dirty: boolean
  // ephemeral run state
  running: boolean
  runStatuses: Record<string, RunStatus>
  // node-palette popover
  palette: { sx: number; sy: number; from: string | null } | null

  onNodesChange: (c: NodeChange[]) => void
  onEdgesChange: (c: EdgeChange[]) => void
  onConnect: (c: Connection) => void
  isValidConnection: (c: Connection | Edge) => boolean

  addNode: (type: string, position: { x: number; y: number }, connectFrom?: string | null) => string
  updateNodeConfig: (id: string, config: Record<string, any>) => void
  updateNodeTitle: (id: string, title: string) => void
  deleteNode: (id: string) => void
  removeEdge: (id: string) => void
  setSelected: (id: string | null) => void
  setName: (name: string) => void
  setSavedAs: (id: string, name: string) => void
  newWorkflow: () => void
  setGraph: (nodes: MdNode[], edges: Edge[]) => void
  openPalette: (sx: number, sy: number, from?: string | null) => void
  closePalette: () => void

  snapshot: () => void
  undo: () => boolean

  setRunning: (v: boolean) => void
  setRunStatus: (id: string, s: RunStatus) => void
  clearRunStatuses: () => void

  toGraphSpec: () => GraphSpec
  loadGraphSpec: (spec: GraphSpec, id: string | null, name: string) => void
}

function defaultTitle(type: string): string {
  return NODE_DEFS[type]?.label ?? type
}

// primary output port of a node (for connected-node creation)
function primaryOut(node: MdNode): string | null {
  const outs = declarePorts(node.type!, node.data.config).outputs
  return outs.length ? outs[0].name : null
}
// first input port of a node
function firstIn(type: string, config: Record<string, any>): string | null {
  const ins = declarePorts(type, config).inputs
  return ins.length ? ins[0].name : null
}

export const useCanvas = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  workflowId: null,
  workflowName: 'Untitled workflow',
  selectedNodeId: null,
  dirty: false,
  running: false,
  runStatuses: {},
  palette: null,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) as MdNode[], dirty: true }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges), dirty: true }),

  onConnect: (conn) => {
    if (!get().isValidConnection(conn)) return
    get().snapshot()
    set({ edges: addEdge({ ...conn, id: newId('e') }, get().edges), dirty: true })
  },

  isValidConnection: (conn) => {
    const { nodes, edges } = get()
    if (!conn.source || !conn.target || conn.source === conn.target) return false
    const src = nodes.find((n) => n.id === conn.source)
    const dst = nodes.find((n) => n.id === conn.target)
    const st = portType(src, conn.sourceHandle, 'outputs')
    const dt = portType(dst, conn.targetHandle, 'inputs')
    if (!st || !dt || !typesCompatible(st, dt)) return false
    const occupied = edges.some(
      (e) => e.target === conn.target && e.targetHandle === conn.targetHandle && (e as any).id !== (conn as any).id,
    )
    return !occupied
  },

  addNode: (type, position, connectFrom) => {
    const def = NODE_DEFS[type]
    if (!def) return ''
    get().snapshot()
    const node: MdNode = {
      id: newId(type),
      type,
      position,
      data: { config: structuredClone(def.defaultConfig), title: defaultTitle(type) },
    }
    const nodes = [...get().nodes, node]
    let edges = get().edges
    if (connectFrom) {
      const src = get().nodes.find((n) => n.id === connectFrom)
      const sp = src && primaryOut(src)
      const tp = firstIn(type, node.data.config)
      if (src && sp && tp) {
        const st = portType(src, sp, 'outputs')!
        const dt = declarePorts(type, node.data.config).inputs[0].type
        if (typesCompatible(st, dt)) {
          edges = addEdge({ id: newId('e'), source: connectFrom, sourceHandle: sp, target: node.id, targetHandle: tp }, edges)
        }
      }
    }
    set({ nodes, edges, selectedNodeId: node.id, dirty: true })
    return node.id
  },

  updateNodeConfig: (id, config) => {
    const nodes = get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n))
    const edges = get().edges.filter((e) => {
      const st = portType(nodes.find((n) => n.id === e.source), e.sourceHandle, 'outputs')
      const dt = portType(nodes.find((n) => n.id === e.target), e.targetHandle, 'inputs')
      return !!st && !!dt && typesCompatible(st, dt)
    })
    set({ nodes, edges, dirty: true })
  },

  updateNodeTitle: (id, title) =>
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, title } } : n)), dirty: true }),

  deleteNode: (id) => {
    get().snapshot()
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      dirty: true,
    })
  },

  removeEdge: (id) => {
    get().snapshot()
    set({ edges: get().edges.filter((e) => e.id !== id), dirty: true })
  },

  setSelected: (id) => set({ selectedNodeId: id }),
  setName: (name) => set({ workflowName: name, dirty: true }),
  setSavedAs: (id, name) => set({ workflowId: id, workflowName: name, dirty: false }),
  newWorkflow: () =>
    set({ nodes: [], edges: [], workflowId: null, workflowName: 'Untitled workflow', selectedNodeId: null, dirty: false, runStatuses: {} }),
  setGraph: (nodes, edges) => set({ nodes, edges, dirty: true }),
  openPalette: (sx, sy, from = null) => set({ palette: { sx, sy, from } }),
  closePalette: () => set({ palette: null }),

  snapshot: () => {
    history.push({ nodes: clone(get().nodes), edges: clone(get().edges) })
    if (history.length > 50) history.shift()
  },
  undo: () => {
    const prev = history.pop()
    if (!prev) return false
    set({ nodes: prev.nodes, edges: prev.edges, selectedNodeId: null, dirty: true })
    return true
  },

  setRunning: (v) => set({ running: v }),
  setRunStatus: (id, s) => set({ runStatuses: { ...get().runStatuses, [id]: s } }),
  clearRunStatuses: () => set({ runStatuses: {} }),

  toGraphSpec: () => {
    const { nodes, edges } = get()
    return {
      version: '1.0',
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type!,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        // stash the display title in config under a reserved key (backend ignores it)
        config: { ...n.data.config, _title: n.data.title },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        source_port: e.sourceHandle!,
        target: e.target,
        target_port: e.targetHandle!,
      })),
    }
  },

  loadGraphSpec: (spec, id, name) => {
    const nodes: MdNode[] = (spec.nodes || []).map((n) => {
      const { _title, ...config } = (n.config || {}) as Record<string, any>
      return {
        id: n.id,
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: { config, title: _title || defaultTitle(n.type) },
      }
    })
    const edges: Edge[] = (spec.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_port,
      targetHandle: e.target_port,
    }))
    set({ nodes, edges, workflowId: id, workflowName: name, selectedNodeId: null, dirty: false, runStatuses: {} })
  },
}))
