import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { Glyph } from '../icons'
import type { RunOut } from '../types'

interface CaseResult {
  state: 'idle' | 'running' | 'pass' | 'fail'
  latency?: number
  cost?: number
  output?: string
  reason?: string
}
interface TestCase {
  id: string
  name: string
  input: string
  expect: string
  result: CaseResult
}

let _tc = 0
const newCase = (n: number): TestCase => ({
  id: `tc${Date.now()}${_tc++}`,
  name: `Test ${n}`,
  input: '',
  expect: '',
  result: { state: 'idle' },
})

function keyFor(workflowId: string | null) {
  return `tracery.tests.${workflowId || 'draft'}`
}

export function TestsPanel({
  workflowId,
  runOnce,
  pushToast,
}: {
  workflowId: string | null
  runOnce: (input: string) => Promise<RunOut>
  pushToast: (t: { type: any; title: string; desc?: string }) => void
}) {
  const [cases, setCases] = useState<TestCase[]>([])
  const [running, setRunning] = useState(false)

  // load on workflow change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(workflowId))
      const loaded: TestCase[] = raw ? JSON.parse(raw) : []
      setCases(loaded.length ? loaded.map((c) => ({ ...c, result: { state: 'idle' } })) : [newCase(1)])
    } catch {
      setCases([newCase(1)])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId])

  // persist (without transient results)
  useEffect(() => {
    if (!cases.length) return
    const slim = cases.map(({ result, ...c }) => ({ ...c, result: { state: 'idle' } }))
    localStorage.setItem(keyFor(workflowId), JSON.stringify(slim))
  }, [cases, workflowId])

  const patch = (id: string, p: Partial<TestCase>) => setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const setResult = (id: string, r: CaseResult) => setCases((cs) => cs.map((c) => (c.id === id ? { ...c, result: r } : c)))

  const runOne = async (c: TestCase): Promise<CaseResult> => {
    try {
      const res = await runOnce(c.input)
      const latency = res.trace.total_latency_ms
      const cost = res.trace.total_cost_usd
      const out = typeof res.output === 'string' ? res.output : JSON.stringify(res.output)
      if (res.status !== 'completed') return { state: 'fail', latency, cost, output: res.error || 'run failed', reason: 'errored' }

      const expect = c.expect.trim()
      if (expect) {
        const pass = (out || '').toLowerCase().includes(expect.toLowerCase())
        return { state: pass ? 'pass' : 'fail', latency, cost, output: out, reason: pass ? `contains "${expect}"` : `missing "${expect}"` }
      }
      const ev = res.trace.spans.find((s) => s.node_type === 'evaluator')
      if (ev?.outputs?.passed) {
        const pass = !!ev.outputs.passed.passed
        return { state: pass ? 'pass' : 'fail', latency, cost, output: out, reason: ev.outputs.passed.reason || 'evaluator' }
      }
      return { state: 'pass', latency, cost, output: out, reason: 'completed' }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message
      return { state: 'fail', output: msg, reason: 'run error' }
    }
  }

  const runAll = async () => {
    if (running || !cases.length) return
    setRunning(true)
    setCases((cs) => cs.map((c) => ({ ...c, result: { state: 'running' } })))
    for (const c of cases) {
      const r = await runOne(c)
      setResult(c.id, r)
    }
    setRunning(false)
    pushToast({ type: 'info', title: 'Tests finished' })
  }

  const done = cases.filter((c) => c.result.state === 'pass' || c.result.state === 'fail')
  const passed = cases.filter((c) => c.result.state === 'pass').length
  const totalCost = done.reduce((a, c) => a + (c.result.cost ?? 0), 0)

  return (
    <div className="panel">
      <div className="tests-bar">
        <span className="tb-score">
          {done.length ? (
            <>
              <span className="pf">{passed}</span>/{done.length} passed
            </>
          ) : (
            `${cases.length} test${cases.length === 1 ? '' : 's'}`
          )}
        </span>
        {done.length > 0 && (
          <span className="tb-meta">
            <span>${totalCost.toFixed(6)}</span>
          </span>
        )}
        <div className="spacer" />
        <button className="btn-mini" onClick={() => setCases((cs) => [...cs, newCase(cs.length + 1)])}>
          <Glyph name="plus" size={13} /> Add test
        </button>
        <button className="btn-run-all" onClick={runAll} disabled={running}>
          <Glyph name="flask" size={15} />
          {running ? 'Running…' : 'Run all'}
        </button>
      </div>

      <div className="tests-body">
        {cases.map((c) => (
          <div className="tcase" key={c.id}>
            <div className="tcase-top">
              <input className="tc-name tinput" style={{ maxWidth: 220 }} value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} />
              <div className="spacer" style={{ flex: 1 }} />
              <span className={`badge ${c.result.state}`}>{c.result.state === 'idle' ? 'not run' : c.result.state}</span>
              <button className="tcase-del" onClick={() => setCases((cs) => cs.filter((x) => x.id !== c.id))}>
                <Glyph name="x" size={13} />
              </button>
            </div>
            <div className="tcase-fields">
              <div className="tfield">
                <span>Input</span>
                <input className="tinput" value={c.input} placeholder="value for the Input node" onChange={(e) => patch(c.id, { input: e.target.value })} />
              </div>
              <div className="tfield">
                <span>Expect (output contains)</span>
                <input className="tinput" value={c.expect} placeholder="optional — else uses evaluator / completion" onChange={(e) => patch(c.id, { expect: e.target.value })} />
              </div>
            </div>
            {c.result.output && <div className="tcase-out">{c.result.output.slice(0, 400)}</div>}
            {(c.result.latency != null || c.result.reason) && (
              <div className="tcase-foot">
                <div className="tc-meta">
                  {c.result.latency != null && <span>{c.result.latency} ms</span>}
                  {c.result.cost != null && <span>${c.result.cost.toFixed(6)}</span>}
                  {c.result.reason && <span className="tc-reason">{c.result.reason}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
