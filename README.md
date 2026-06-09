# Mini-Dify

A visual workflow builder for RAG and LLM agents. Compose an AI pipeline as a graph
of typed nodes — **input → retrieval → prompt → model → output** — run it, inspect a
per-node execution trace (I/O, latency, tokens, cost), and deploy it as a callable
HTTP endpoint.

It is **not** a chatbot. It's the tool you build chatbots (and other LLM pipelines)
*with* — a small, opinionated slice of what Dify / LangGraph Studio / Promptflow do.

> Build order matters here: the **execution engine is built headless first**, before
> any UI. Everything else is downstream of getting that right.

---

## Status

| Phase | What | State |
|---|---|---|
| 0 | Project scaffold (repo, docker-compose, CI) | ✅ |
| 1 | **Headless execution engine** + 5 core nodes + provider/retrieval layers | ✅ |
| 2 | REST API + Postgres/pgvector persistence | ⏳ |
| 3 | React Flow canvas | ⏳ |
| 4 | Run UX, trace viewer, deploy endpoints | ⏳ |
| 5 | Evaluator + Tool nodes, templates, polish | ⏳ |

---

## Architecture

```
Frontend (React + @xyflow/react)        Backend (FastAPI)
  canvas / config / trace viewer  ──▶   REST API ──▶ Execution engine ──▶ Provider layer (LiteLLM)
                                                          │                Retrieval service (pgvector)
                                                          ▼
                                                  Postgres + pgvector
```

The **execution engine** is the core: it validates a graph spec, topologically sorts
it, runs each node while threading state between them, and records a trace span per
node. The **provider layer** is the only place that talks to an LLM/embedding vendor,
so switching providers is a config change, not a code change.

See [`mini-dify-spec.md`](./mini-dify-spec.md) for the full design (if present), or the
docstrings in `backend/app/engine/`.

---

## Quick start — run a workflow headless (Phase 1)

No database, no API key required (a deterministic mock provider runs everything).

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Run the canonical 5-node RAG workflow against a seeded knowledge base:
python run_workflow.py sample_rag.json \
  --input '{"question": "What is the refund policy?"}' \
  --kb sample_kb.json
```

You'll get the output plus a full per-node trace (status, latency, tokens, cost).

### Run the engine test suite

```bash
cd backend && pytest        # validation, per-node, and end-to-end engine tests
ruff check .
```

### Use a real model

Set the provider in `.env` (copy `.env.example`):

```
LLM_PROVIDER=litellm
ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY / GROQ_API_KEY / ...
DEFAULT_MODEL=anthropic/claude-3-5-sonnet-latest
```

`model` strings are [LiteLLM](https://docs.litellm.ai) identifiers (`vendor/model`),
so the same workflow runs against OpenAI, Anthropic, Groq, etc. unchanged.

---

## Node types (v1)

| Node | Purpose | In → Out |
|---|---|---|
| `input` | Typed entry point | — → one port per field |
| `retrieval` | Vector search over a knowledge base | `query:string` → `chunks` |
| `prompt` | Render a `{{template}}` | one port per var → `prompt:string` |
| `model` | Call an LLM via the provider layer | `prompt`/`messages` → `completion:string` |
| `output` | Terminal sink — the run's result | `result:any` → — |

Evaluator and Tool nodes land in Phase 5.

---

## Repo layout

```
mini-dify/
├── docker-compose.yml          # Postgres + pgvector
├── backend/
│   ├── app/
│   │   ├── engine/             # THE CORE: graph, executor, context, trace, nodes/
│   │   ├── services/           # providers.py (LiteLLM), retrieval.py (RAG)
│   │   ├── api/                # REST routes (Phase 2)
│   │   └── models/             # SQLAlchemy models (Phase 2)
│   ├── run_workflow.py         # headless CLI
│   ├── sample_rag.json         # canonical 5-node RAG fixture
│   └── tests/
└── frontend/                   # React + Vite canvas (Phase 3)
```
