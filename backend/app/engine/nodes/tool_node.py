"""Tool node — call an allow-listed function as a workflow step (spec §5.7).

Security: the registry is a closed allow-list — no arbitrary code execution.
The http_get tool additionally requires a per-node domain allow-list and a timeout.
"""
from __future__ import annotations

import ast
import operator
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from app.engine.nodes.base import Node, NodeError, Port, Ports, register

if TYPE_CHECKING:
    from app.engine.context import RunContext

# ─── calculator (safe arithmetic via AST, no names/calls) ────────────────────
_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        return _BIN_OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval_node(node.operand))
    raise NodeError("calculator: only numeric arithmetic is allowed")


async def _calculator(inputs: dict, config: dict, ctx: RunContext) -> dict:
    expr = inputs.get("expression") or config.get("expression")
    if not expr:
        raise NodeError("calculator: no expression provided")
    try:
        tree = ast.parse(str(expr), mode="eval")
    except SyntaxError as e:
        raise NodeError(f"calculator: invalid expression: {e}") from e
    return {"expression": str(expr), "value": _eval_node(tree)}


async def _http_get(inputs: dict, config: dict, ctx: RunContext) -> dict:
    import httpx

    url = inputs.get("url") or config.get("url")
    if not url:
        raise NodeError("http_get: no url provided")
    allowed = [d.strip().lower() for d in config.get("allowed_domains", []) if d.strip()]
    host = (urlparse(str(url)).hostname or "").lower()
    if not allowed or host not in allowed:
        raise NodeError(f"http_get: domain {host!r} is not in the allow-list {allowed}")
    timeout = float(config.get("timeout", 10))
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(str(url))
    except httpx.HTTPError as e:
        raise NodeError(f"http_get: request failed: {e}") from e
    return {"status": resp.status_code, "url": str(resp.url), "text": resp.text[:2000]}


TOOL_REGISTRY = {
    "calculator": _calculator,
    "http_get": _http_get,
}


@register
class ToolNode(Node):
    type = "tool"
    timeout_s = 30

    def declare_ports(self, config: dict) -> Ports:
        tool = config.get("tool")
        if tool == "calculator":
            inputs = [Port("expression", "string", required=False)]
        elif tool == "http_get":
            inputs = [Port("url", "string", required=False)]
        else:
            inputs = [Port("input", "any", required=False)]
        return Ports(inputs=inputs, outputs=[Port("result", "json")])

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        tool = config.get("tool")
        if tool not in TOOL_REGISTRY:
            raise NodeError(f"tool: unknown tool {tool!r} (allowed: {sorted(TOOL_REGISTRY)})")
        return {"result": await TOOL_REGISTRY[tool](inputs, config, ctx)}
