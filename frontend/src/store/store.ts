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

export interface MdNodeData extends Record<string, unknown> {
  config: Record<string, any>
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

interface CanvasState {
  nodes: MdNode[]
  edges: Edge[]
  workflowId: string | null
  workflowName: string
  selectedNodeId: string | null
  dirty: boolean

  onNodesChange: (c: NodeChange[]) => void
  onEdgesChange: (c: EdgeChange[]) => void
  onConnect: (c: Connection) => void
  isValidConnection: (c: Connection | Edge) => boolean

  addNode: (type: string, position: { x: number; y: number }) => void
  updateNodeConfig: (id: string, config: Record<string, any>) => void
  deleteNode: (id: string) => void
  setSelected: (id: string | null) => void
  setName: (name: string) => void
  setSavedAs: (id: string, name: string) => void
  newWorkflow: () => void

  toGraphSpec: () => GraphSpec
  loadGraphSpec: (spec: GraphSpec, id: string | null, name: string) => void
}

export const useCanvas = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  workflowId: null,
  workflowName: 'Untitled workflow',
  selectedNodeId: null,
  dirty: false,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) as MdNode[], dirty: true }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges), dirty: true }),

  onConnect: (conn) => {
    if (!get().isValidConnection(conn)) return
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
    // at most one incoming edge per target port
    const occupied = edges.some(
      (e) => e.target === conn.target && e.targetHandle === conn.targetHandle && (e as any).id !== (conn as any).id,
    )
    return !occupied
  },

  addNode: (type, position) => {
    const def = NODE_DEFS[type]
    if (!def) return
    const node: MdNode = {
      id: newId(type),
      type,
      position,
      data: { config: structuredClone(def.defaultConfig) },
    }
    set({ nodes: [...get().nodes, node], selectedNodeId: node.id, dirty: true })
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)),
      dirty: true,
    })
    // dropping a template var (etc.) can orphan an edge into a now-missing port — prune those
    const valid = get().isValidConnection
    set({ edges: get().edges.filter((e) => valid({ source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle } as Connection)) })
  },

  deleteNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      dirty: true,
    }),

  setSelected: (id) => set({ selectedNodeId: id }),
  setName: (name) => set({ workflowName: name, dirty: true }),
  setSavedAs: (id, name) => set({ workflowId: id, workflowName: name, dirty: false }),
  newWorkflow: () =>
    set({ nodes: [], edges: [], workflowId: null, workflowName: 'Untitled workflow', selectedNodeId: null, dirty: false }),

  toGraphSpec: () => {
    const { nodes, edges } = get()
    return {
      version: '1.0',
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type!,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        config: n.data.config,
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
    const nodes: MdNode[] = (spec.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: { config: n.config || {} },
    }))
    const edges: Edge[] = (spec.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_port,
      targetHandle: e.target_port,
    }))
    set({ nodes, edges, workflowId: id, workflowName: name, selectedNodeId: null, dirty: false })
  },
}))
