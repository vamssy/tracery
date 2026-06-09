"""Evaluator node — score an output for quality (spec §5.6).

Strategies:
  keyword  — fraction of comma-separated keywords present (deterministic)
  regex    — 1.0 if the pattern matches, else 0.0 (deterministic)
  llm_judge — ask a model for a JSON {score, reason}
"""
from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

from app.config import settings
from app.engine.nodes.base import Node, NodeError, Port, Ports, register
from app.services.providers import ProviderError

if TYPE_CHECKING:
    from app.engine.context import RunContext

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

_JUDGE_PROMPT = (
    "You are a strict evaluator. Score how well the OUTPUT satisfies the CRITERIA on a "
    "scale from 0.0 (fails) to 1.0 (fully satisfies). Respond with ONLY a JSON object: "
    '{{"score": <number 0..1>, "reason": "<one sentence>"}}.\n\n'
    "CRITERIA:\n{criteria}\n\nOUTPUT:\n{output}\n{reference}"
)


@register
class EvaluatorNode(Node):
    type = "evaluator"
    timeout_s = 60

    def declare_ports(self, config: dict) -> Ports:
        return Ports(
            inputs=[Port("output", "string"), Port("reference", "string", required=False)],
            outputs=[Port("score", "number"), Port("passed", "json")],
        )

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        output = str(inputs.get("output", ""))
        reference = inputs.get("reference")
        strategy = config.get("strategy", "keyword")
        criteria = config.get("criteria", "")
        threshold = float(config.get("pass_threshold", 0.5))

        if strategy == "keyword":
            kws = [k.strip().lower() for k in criteria.split(",") if k.strip()]
            score = 1.0 if not kws else sum(1 for k in kws if k in output.lower()) / len(kws)
            reason = f"matched {round(score * len(kws))}/{len(kws)} keywords" if kws else "no keywords set"
        elif strategy == "regex":
            try:
                score = 1.0 if re.search(criteria, output) else 0.0
            except re.error as e:
                raise NodeError(f"evaluator: invalid regex: {e}") from e
            reason = "pattern matched" if score else "pattern did not match"
        elif strategy == "llm_judge":
            score, reason = await self._llm_judge(criteria, output, reference, config, ctx)
        else:
            raise NodeError(f"evaluator: unknown strategy {strategy!r}")

        score = max(0.0, min(1.0, float(score)))
        passed = score >= threshold
        return {"score": round(score, 4), "passed": {"passed": passed, "reason": reason}}

    async def _llm_judge(self, criteria, output, reference, config, ctx) -> tuple[float, str]:
        model = config.get("model") or settings.default_model
        ref = f"\nREFERENCE:\n{reference}" if reference else ""
        prompt = _JUDGE_PROMPT.format(criteria=criteria, output=output, reference=ref)
        try:
            comp = await ctx.services.providers.complete(
                model, [{"role": "user", "content": prompt}], temperature=0, max_tokens=300
            )
        except ProviderError as e:
            raise NodeError(f"evaluator: judge provider error: {e}") from e
        ctx.record_usage(comp.tokens_in, comp.tokens_out, comp.cost_usd)

        m = _JSON_RE.search(comp.text)
        if not m:
            return 0.0, "could not parse judge output"
        try:
            data = json.loads(m.group(0))
            return float(data.get("score", 0.0)), str(data.get("reason", ""))
        except (ValueError, TypeError):
            return 0.0, "could not parse judge JSON"
