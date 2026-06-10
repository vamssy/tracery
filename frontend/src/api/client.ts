import type {
  DeployOut,
  GraphSpec,
  KnowledgeBase,
  RunOut,
  RunSummary,
  ValidateResult,
  Workflow,
  WorkflowSummary,
} from '../types'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const API_KEY = import.meta.env.VITE_API_KEY

function headers(json = true): HeadersInit {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  if (API_KEY) h['authorization'] = `Bearer ${API_KEY}`
  return h
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    let detail: unknown
    try {
      detail = (await res.json()).detail
    } catch {
      detail = await res.text()
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const api = {
  base: BASE,

  // workflows
  listWorkflows: () => req<WorkflowSummary[]>('/workflows', { headers: headers(false) }),
  getWorkflow: (id: string) => req<Workflow>(`/workflows/${id}`, { headers: headers(false) }),
  createWorkflow: (name: string, graph_spec: GraphSpec) =>
    req<Workflow>('/workflows', { method: 'POST', headers: headers(), body: JSON.stringify({ name, graph_spec }) }),
  updateWorkflow: (id: string, body: { name?: string; graph_spec?: GraphSpec }) =>
    req<Workflow>(`/workflows/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) }),
  deleteWorkflow: (id: string) => req<void>(`/workflows/${id}`, { method: 'DELETE', headers: headers(false) }),

  // validate (stateless — works on unsaved specs)
  validate: (graph_spec: GraphSpec) =>
    req<ValidateResult>('/validate', { method: 'POST', headers: headers(), body: JSON.stringify({ graph_spec }) }),

  // run
  run: (id: string, input: Record<string, any>) =>
    req<RunOut>(`/workflows/${id}/run`, { method: 'POST', headers: headers(), body: JSON.stringify({ input }) }),
  getRun: (id: string) => req<RunOut>(`/runs/${id}`, { headers: headers(false) }),
  listRuns: (workflowId: string) => req<RunSummary[]>(`/workflows/${workflowId}/runs`, { headers: headers(false) }),

  // knowledge bases
  listKBs: () => req<KnowledgeBase[]>('/knowledge-bases', { headers: headers(false) }),
  createKB: (name: string) =>
    req<KnowledgeBase>('/knowledge-bases', { method: 'POST', headers: headers(), body: JSON.stringify({ name }) }),
  ingestText: (kbId: string, text: string) => {
    const fd = new FormData()
    fd.append('text', text)
    return req<{ chunks_ingested: number; total_chunks: number }>(`/knowledge-bases/${kbId}/documents`, {
      method: 'POST',
      headers: headers(false),
      body: fd,
    })
  },
  ingestFile: (kbId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<{ chunks_ingested: number; total_chunks: number }>(`/knowledge-bases/${kbId}/documents`, {
      method: 'POST',
      headers: headers(false),
      body: fd,
    })
  },

  // deploy (Phase 4)
  deploy: (id: string) => req<DeployOut>(`/workflows/${id}/deploy`, { method: 'POST', headers: headers(false) }),
}
