import type { MemoryGraphNode, MemoryGraphEdge, MemoryGraphOverviewPayload, MemoryGraphNodeDetail } from "@space/contracts";

export function syntheticMemoryNode(index: number): MemoryGraphNode {
  const source = index % 40 === 0;
  return { id: `demo:graph:${index}`, type: source ? "SOURCE" : "MEMORY", label: index === 0 ? "space.md" : source ? `source-${index / 40}.md` : `Synthetic memory ${index}`,
    sourcePath: `/demo/memory/source-${Math.floor(index / 40)}.md`, recordId: source ? null : `demo:record:${index}` };
}

/** Synthetic data only: stable identities, no providers, embeddings, accounts or backend. */
export function createSyntheticMemoryGraph(requestedCount: number): MemoryGraphOverviewPayload {
  const count = Math.max(1, Math.min(50000, Math.floor(Number.isFinite(requestedCount) ? requestedCount : 2000)));
  const nodes = Array.from({ length: count }, (_, i) => syntheticMemoryNode(i));
  const edges: MemoryGraphEdge[] = [];
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3 && count > 1; j++) {
      const target = (i + 1 + j * 997) % count;
      if (target === i) continue;
      edges.push({ id: `demo:edge:${i}:${j}`, source: nodes[i]!.id, target: nodes[target]!.id, type: j === 0 ? "DERIVED_FROM" : "SEMANTICALLY_RELATED" });
    }
  }
  const sourceCount = Math.ceil(count / 40);
  return { version: 2, generatedAt: "2026-10-16T00:00:00.000Z", sourceHash: "0".repeat(64), isStale: false,
    summary: { nodeCount: count, edgeCount: edges.length, sourceCount, recordCount: count - sourceCount, issueCount: 0 },
    nodes, edges, totalMatchingNodes: count, totalMatchingEdges: edges.length, truncated: false, months: [],
    filters: { q: null, nodeType: null, scope: null, roomId: null, sourcePath: null, lifecycleStatus: null, month: "all", relationMode: "RELATIONS" } };
}

export function syntheticMemoryNodeDetail(id: string): MemoryGraphNodeDetail | null {
  const match = /^demo:graph:(\d+)$/.exec(id);
  const index = match ? Number(match[1]) : -1;
  if (index < 0 || index >= 50000) return null;
  return { node: syntheticMemoryNode(index), record: null, relatedNodes: [], relatedEdges: [], issues: [] };
}
