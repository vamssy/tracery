import type { GraphSpec } from './types'

// The canonical 5-node RAG workflow (matches backend/sample_rag.json). The
// retrieval node's knowledge_base_id is left blank for the user to pick.
export function ragTemplate(): GraphSpec {
  return {
    version: '1.0',
    nodes: [
      { id: 'n_input', type: 'input', position: { x: 80, y: 60 }, config: { fields: [{ name: 'question', type: 'string', required: true }] } },
      { id: 'n_retrieval', type: 'retrieval', position: { x: 80, y: 240 }, config: { knowledge_base_id: '', top_k: 4, score_threshold: 0 } },
      { id: 'n_prompt', type: 'prompt', position: { x: 420, y: 120 }, config: { template: 'Answer using only this context:\n{{context}}\n\nQuestion: {{question}}' } },
      { id: 'n_model', type: 'model', position: { x: 740, y: 200 }, config: { model: 'anthropic/claude-3-5-sonnet-latest', temperature: 0.2, max_tokens: 1024, system_prompt: 'You are a precise assistant. Answer only from the provided context.' } },
      { id: 'n_output', type: 'output', position: { x: 1060, y: 220 }, config: { format: 'text' } },
    ],
    edges: [
      { id: 'e1', source: 'n_input', source_port: 'question', target: 'n_retrieval', target_port: 'query' },
      { id: 'e2', source: 'n_input', source_port: 'question', target: 'n_prompt', target_port: 'question' },
      { id: 'e3', source: 'n_retrieval', source_port: 'chunks', target: 'n_prompt', target_port: 'context' },
      { id: 'e4', source: 'n_prompt', source_port: 'prompt', target: 'n_model', target_port: 'prompt' },
      { id: 'e5', source: 'n_model', source_port: 'completion', target: 'n_output', target_port: 'result' },
    ],
  }
}
