"""Output node — terminal sink. Designates the run's final result and shape."""
from __future__ import annotations

import json
from typing import TYPE_CHECKING

from app.engine.nodes.base import Node, Port, Ports, register

if TYPE_CHECKING:
    from app.engine.context import RunContext


@register
class OutputNode(Node):
    type = "output"

    def declare_ports(self, config: dict) -> Ports:
        return Ports(inputs=[Port("result", "any")], outputs=[])

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        result = inputs.get("result")
        fmt = config.get("format", "text")
        if fmt == "json" and isinstance(result, str):
            try:
                result = json.loads(result)
            except (ValueError, TypeError):
                pass  # not JSON — leave the string as-is
        elif fmt == "text" and not isinstance(result, (str, int, float, bool, type(None))):
            result = json.dumps(result, ensure_ascii=False)
        ctx.final_output = result
        return {}
