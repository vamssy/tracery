"""Prompt node — render a template, substituting {{variable}} placeholders with
upstream values. One input port is declared per distinct {{variable}}.

`chunks`-typed inputs are rendered to an ordered, numbered context block so the
rendering is deterministic (spec §5.3)."""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from app.engine.nodes.base import Node, NodeError, Port, Ports, register

if TYPE_CHECKING:
    from app.engine.context import RunContext

_VAR_RE = re.compile(r"{{\s*(\w+)\s*}}")


def _template_vars(template: str) -> list[str]:
    seen: list[str] = []
    for v in _VAR_RE.findall(template):
        if v not in seen:
            seen.append(v)
    return seen


def render_chunks(chunks: list[dict]) -> str:
    """Deterministic, readable context block from retrieval output."""
    lines = []
    for i, c in enumerate(chunks, start=1):
        text = (c.get("text") or "").strip()
        score = c.get("score")
        header = f"[{i}]" + (f" (score {score:.3f})" if isinstance(score, (int, float)) else "")
        lines.append(f"{header} {text}")
    return "\n\n".join(lines)


def _render_value(value) -> str:
    if isinstance(value, list) and value and isinstance(value[0], dict) and "text" in value[0]:
        return render_chunks(value)
    if isinstance(value, (dict, list)):
        import json

        return json.dumps(value, ensure_ascii=False)
    return str(value)


@register
class PromptNode(Node):
    type = "prompt"

    def declare_ports(self, config: dict) -> Ports:
        template = config.get("template", "")
        inputs = [Port(v, "any") for v in _template_vars(template)]
        return Ports(inputs=inputs, outputs=[Port("prompt", "string")])

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        template = config.get("template", "")

        def _sub(m: re.Match) -> str:
            name = m.group(1)
            if name not in inputs:
                raise NodeError(f"prompt: no value supplied for {{{{{name}}}}}")
            return _render_value(inputs[name])

        return {"prompt": _VAR_RE.sub(_sub, template)}
