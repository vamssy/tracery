"""The Node contract + port type system.

The engine knows nothing about a node's internals — only this contract. That
abstraction is what makes the engine extensible: adding a node type is adding a
module here, never touching the executor.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.engine.context import RunContext

# v1 port types — deliberately tiny (spec §4.3). Expand only when a node needs it.
PORT_TYPES = {"string", "chunks", "messages", "json", "number", "any"}


def types_compatible(src: str, dst: str) -> bool:
    """An edge from a `src`-typed output to a `dst`-typed input is valid iff the
    types match, or either side is the wildcard `any`."""
    return src == dst or src == "any" or dst == "any"


@dataclass(frozen=True)
class Port:
    name: str
    type: str
    required: bool = True


@dataclass
class Ports:
    inputs: list[Port] = field(default_factory=list)
    outputs: list[Port] = field(default_factory=list)

    def input(self, name: str) -> Port | None:
        return next((p for p in self.inputs if p.name == name), None)

    def output(self, name: str) -> Port | None:
        return next((p for p in self.outputs if p.name == name), None)


class NodeError(Exception):
    """A node failed at run time. In v1 this fails the whole run."""


class NodeConfigError(Exception):
    """A node's config is invalid (caught at graph-validation time, not run time)."""


class Node(ABC):
    """Every node type implements this. Instances are stateless and shared;
    per-node configuration is passed explicitly to ``declare_ports`` / ``execute``."""

    type: str = "base"
    # default per-call timeout; a node type may override (model > retrieval).
    timeout_s: float | None = None

    @abstractmethod
    def declare_ports(self, config: dict) -> Ports:
        """Return typed input/output ports for this node given its config.
        Used for validation and for wiring the canvas."""
        ...

    @abstractmethod
    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        """Do the work. ``inputs`` maps input-port-name -> value.
        Return a dict mapping output-port-name -> value. Raise NodeError on failure."""
        ...


# ─── Registry ────────────────────────────────────────────────────────────────
NODE_REGISTRY: dict[str, Node] = {}


def register(cls: type[Node]) -> type[Node]:
    inst = cls()
    if not inst.type or inst.type == "base":
        raise ValueError(f"Node {cls.__name__} must declare a unique `type`")
    if inst.type in NODE_REGISTRY:
        raise ValueError(f"Duplicate node type registered: {inst.type!r}")
    NODE_REGISTRY[inst.type] = inst
    return cls


def get_node(node_type: str) -> Node:
    node = NODE_REGISTRY.get(node_type)
    if node is None:
        raise NodeConfigError(f"Unknown node type: {node_type!r}")
    return node
