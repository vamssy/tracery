"""Graph spec: the serialized contract between frontend and engine, plus parsing,
validation (spec §6.8), and topological ordering.

The graph spec (Pydantic here, a matching TS type on the frontend) is the source
of truth and is stable independent of the engine implementation.
"""
from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel, Field

# Importing the package registers all node types (input/retrieval/...).
import app.engine.nodes  # noqa: F401
from app.engine.nodes.base import (
    Ports,
    get_node,
    types_compatible,
)


# ─── Serialized shapes ───────────────────────────────────────────────────────
class Position(BaseModel):
    x: float = 0.0
    y: float = 0.0


class NodeSpec(BaseModel):
    id: str
    type: str
    position: Position = Field(default_factory=Position)
    config: dict = Field(default_factory=dict)


class EdgeSpec(BaseModel):
    id: str
    source: str  # source node id
    source_port: str
    target: str  # target node id
    target_port: str


class GraphSpec(BaseModel):
    version: str = "1.0"
    nodes: list[NodeSpec] = Field(default_factory=list)
    edges: list[EdgeSpec] = Field(default_factory=list)


class GraphValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("Invalid graph: " + "; ".join(errors))


# ─── Parsed / validated graph ────────────────────────────────────────────────
class ParsedGraph:
    def __init__(self, spec: GraphSpec, ports_by_node: dict[str, Ports]):
        self.spec = spec
        self.nodes: dict[str, NodeSpec] = {n.id: n for n in spec.nodes}
        self.edges: list[EdgeSpec] = list(spec.edges)
        self.ports: dict[str, Ports] = ports_by_node
        self._incoming: dict[str, list[EdgeSpec]] = defaultdict(list)
        self._outgoing: dict[str, list[EdgeSpec]] = defaultdict(list)
        for e in spec.edges:
            self._incoming[e.target].append(e)
            self._outgoing[e.source].append(e)

    def incoming_edges(self, node_id: str) -> list[EdgeSpec]:
        return self._incoming[node_id]

    def topological_order(self) -> list[NodeSpec]:
        """Kahn's algorithm. Ties broken by original node order for determinism.
        Raises GraphValidationError if the graph contains a cycle."""
        order_index = {n.id: i for i, n in enumerate(self.spec.nodes)}
        indeg: dict[str, int] = {n.id: 0 for n in self.spec.nodes}
        for e in self.edges:
            if e.target in indeg:
                indeg[e.target] += 1
        ready = sorted((nid for nid, d in indeg.items() if d == 0), key=lambda x: order_index[x])
        result: list[NodeSpec] = []
        while ready:
            nid = ready.pop(0)
            result.append(self.nodes[nid])
            for e in self._outgoing[nid]:
                indeg[e.target] -= 1
                if indeg[e.target] == 0:
                    # insert keeping deterministic order
                    ready.append(e.target)
                    ready.sort(key=lambda x: order_index[x])
        if len(result) != len(self.spec.nodes):
            raise GraphValidationError(["graph contains a cycle (engine requires a DAG)"])
        return result


# ─── Validation ──────────────────────────────────────────────────────────────
def validate_graph(spec_like: GraphSpec | dict) -> list[str]:
    """Return a list of human-readable validation errors. Empty == valid.
    Never raises on a *content* problem (used by the /validate endpoint)."""
    try:
        spec = spec_like if isinstance(spec_like, GraphSpec) else GraphSpec.model_validate(spec_like)
    except Exception as e:  # malformed JSON shape
        return [f"malformed graph spec: {e}"]

    errors: list[str] = []

    # node ids unique
    ids = [n.id for n in spec.nodes]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        errors.append(f"duplicate node ids: {sorted(dupes)}")
    if not spec.nodes:
        errors.append("graph has no nodes")

    # resolve ports per node (also surfaces unknown types / bad config)
    ports_by_node: dict[str, Ports] = {}
    for n in spec.nodes:
        try:
            ports_by_node[n.id] = get_node(n.type).declare_ports(n.config)
        except Exception as e:  # noqa: BLE001 — surface any config error as a graph error
            errors.append(f"node {n.id!r} ({n.type}): {e}")

    # exactly one terminal Output node (v1)
    output_nodes = [n for n in spec.nodes if n.type == "output"]
    if len(output_nodes) == 0:
        errors.append("graph must have exactly one terminal `output` node (found 0)")
    elif len(output_nodes) > 1:
        errors.append(f"graph must have exactly one terminal `output` node (found {len(output_nodes)})")

    node_ids = set(ids)
    incoming_per_port: dict[tuple[str, str], int] = defaultdict(int)
    structural_ok = not dupes  # safe to topo-sort only if node refs are sound

    # edge-level checks
    for e in spec.edges:
        if e.source not in node_ids:
            errors.append(f"edge {e.id}: source node {e.source!r} does not exist")
            structural_ok = False
            continue
        if e.target not in node_ids:
            errors.append(f"edge {e.id}: target node {e.target!r} does not exist")
            structural_ok = False
            continue
        src_ports = ports_by_node.get(e.source)
        dst_ports = ports_by_node.get(e.target)
        if src_ports is None or dst_ports is None:
            continue  # already reported a config error above
        sp = src_ports.output(e.source_port)
        dp = dst_ports.input(e.target_port)
        if sp is None:
            errors.append(f"edge {e.id}: {e.source} has no output port {e.source_port!r}")
            continue
        if dp is None:
            errors.append(f"edge {e.id}: {e.target} has no input port {e.target_port!r}")
            continue
        if not types_compatible(sp.type, dp.type):
            errors.append(
                f"edge {e.id}: type mismatch {sp.type} -> {dp.type} "
                f"({e.source}.{e.source_port} → {e.target}.{e.target_port})"
            )
        incoming_per_port[(e.target, e.target_port)] += 1

    # every required input has exactly one incoming edge; no port over-connected
    for nid, ports in ports_by_node.items():
        for p in ports.inputs:
            count = incoming_per_port.get((nid, p.name), 0)
            if p.required and count == 0:
                errors.append(f"node {nid}: required input port {p.name!r} has no incoming edge")
            if count > 1:
                errors.append(f"node {nid}: input port {p.name!r} has {count} incoming edges (max 1)")

    # cycle check — independent of port/type errors, but needs sound node refs
    if structural_ok:
        try:
            ParsedGraph(spec, ports_by_node).topological_order()
        except GraphValidationError as e:
            errors.extend(e.errors)

    return errors


def parse_and_validate(spec_like: GraphSpec | dict) -> ParsedGraph:
    """Validate and return a ParsedGraph, or raise GraphValidationError."""
    spec = spec_like if isinstance(spec_like, GraphSpec) else GraphSpec.model_validate(spec_like)
    errors = validate_graph(spec)
    if errors:
        raise GraphValidationError(errors)
    ports_by_node = {n.id: get_node(n.type).declare_ports(n.config) for n in spec.nodes}
    return ParsedGraph(spec, ports_by_node)
