"""Input node — workflow entry point. Declares the typed fields the run expects
and emits each one on its own output port."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.engine.nodes.base import Node, NodeError, Port, Ports, register

if TYPE_CHECKING:
    from app.engine.context import RunContext


@register
class InputNode(Node):
    type = "input"

    def declare_ports(self, config: dict) -> Ports:
        outputs = [
            Port(f["name"], f.get("type", "string"), required=f.get("required", True))
            for f in config.get("fields", [])
        ]
        return Ports(inputs=[], outputs=outputs)

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        out: dict = {}
        for f in config.get("fields", []):
            name = f["name"]
            if name in ctx.input and ctx.input[name] is not None:
                out[name] = ctx.input[name]
            elif f.get("default") is not None:
                out[name] = f["default"]
            elif f.get("required", True):
                raise NodeError(f"missing required input field: {name!r}")
            else:
                out[name] = None
        return out
