"""Model node — call an LLM through the provider layer and return its completion.
Token counts and cost are recorded on the trace span, never returned as data."""
from __future__ import annotations

import json
from typing import TYPE_CHECKING

from app.config import settings
from app.engine.nodes.base import Node, NodeError, Port, Ports, TransientNodeError, register
from app.services.providers import ProviderError

if TYPE_CHECKING:
    from app.engine.context import RunContext

# substrings that mark a provider error as worth retrying
_TRANSIENT_MARKERS = (
    "rate limit", "rate_limit", "429", "timeout", "timed out",
    "500", "502", "503", "overloaded", "unavailable",
)


@register
class ModelNode(Node):
    type = "model"
    timeout_s = 120  # model calls get longer than retrieval
    max_retries = 2  # retry transient provider errors with backoff

    def declare_ports(self, config: dict) -> Ports:
        # Either `prompt` or `messages` may feed the model; neither is required at
        # graph-validation time, but the node errors if it gets nothing.
        return Ports(
            inputs=[
                Port("prompt", "string", required=False),
                Port("messages", "messages", required=False),
            ],
            outputs=[Port("completion", "string")],
        )

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        model = config.get("model") or settings.default_model
        system_prompt = config.get("system_prompt")

        messages = inputs.get("messages")
        if messages:
            messages = list(messages)
            if system_prompt and not any(m.get("role") == "system" for m in messages):
                messages = [{"role": "system", "content": system_prompt}, *messages]
        else:
            prompt = inputs.get("prompt")
            if prompt is None:
                raise NodeError("model: needs a `prompt` or `messages` input")
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": str(prompt)})

        params = {
            "temperature": config.get("temperature", 0.2),
            "max_tokens": config.get("max_tokens", 1024),
        }
        try:
            completion = await ctx.services.providers.complete(model, messages, **params)
        except ProviderError as e:
            msg = str(e).lower()
            if any(m in msg for m in _TRANSIENT_MARKERS):
                raise TransientNodeError(f"model: transient provider error: {e}") from e
            raise NodeError(f"model: provider error: {e}") from e

        ctx.record_usage(completion.tokens_in, completion.tokens_out, completion.cost_usd)

        text = completion.text
        if config.get("response_format") == "json":
            try:
                json.loads(text)
            except (ValueError, TypeError) as e:
                raise NodeError(f"model: response_format=json but output is not valid JSON: {e}") from e

        return {"completion": text}
