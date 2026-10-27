import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryWorkspace } from "../src/features/memory-workspace/MemoryWorkspace.js";
import { createMemoryAtlas } from "../src/features/memory-workspace/memory-atlas.js";
import { createMemoryRenderModel } from "../src/features/memory-workspace/memory-3d-model.js";

const controls = vi.hoisted(() => ({
  runtime: "live", mode: "webgl2" as "webgl2" | "fallback",
  overview: vi.fn(), detail: vi.fn(), archive: vi.fn()
}));
vi.mock("../src/api.js", () => ({ api: { memoryGraphOverview: controls.overview, memoryGraphNode: controls.detail } }));
vi.mock("../src/runtime/SpaceRuntime.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/runtime/SpaceRuntime.js")>(), getSpaceRuntimeKind: () => controls.runtime
}));
vi.mock("../src/features/memory-workspace/useMemoryArchive.js", () => ({ useMemoryArchive: (...args: unknown[]) => controls.archive(...args) }));
vi.mock("../src/features/memory-workspace/DesktopMemoryGraph.js", () => ({ default: () => <div>Sample map</div> }));
vi.mock("../src/features/memory-workspace/MemoryNodeDetail.js", () => ({ MemoryNodeDetail: ({ detail }: { detail: unknown }) =>
  <div aria-label="Memory node detail">{detail ? "Detail loaded" : "Loading detail"}</div> }));
vi.mock("../src/features/memory-workspace/MemoryGraph3D.js", () => ({ MemoryGraph3D: ({ onRendererModeChange, onSelectNode, totalNodes, truncated }: {
  onRendererModeChange?: (mode: "webgl2" | "fallback") => void; onSelectNode: (id: string) => void;
  totalNodes?: number; truncated?: boolean
}) => {
  useEffect(() => { onRendererModeChange?.(controls.mode); }, [onRendererModeChange]);
  return <div data-testid="graph-3d" data-total-nodes={totalNodes} data-truncated={truncated}>
    <button onClick={() => onSelectNode("memory:old")}>Open old node</button>
    <button onClick={() => onRendererModeChange?.("fallback")}>Simulate context loss</button>
    <button onClick={() => onRendererModeChange?.("webgl2")}>Simulate context restore</button>
  </div>;
} }));

const nodes = [{ id: "memory:old", type: "MEMORY" as const, label: "Old memory", recordId: "old", sourcePath: null }];
const graph = { data: { nodes, edges: [], truncated: true, totalMatchingNodes: 50000, totalMatchingEdges: 0 } };
const atlas = createMemoryAtlas(nodes, []);
const state = { graph, atlas, model: createMemoryRenderModel(nodes, [], atlas.positions, new Map()), complete: true };
const workspace = <MemoryWorkspace shellMode="desktop" activeRoomId={null} onClose={() => {}} initialMode="atlas" />;

beforeEach(() => {
  vi.clearAllMocks(); controls.runtime = "live"; controls.mode = "webgl2";
  controls.overview.mockResolvedValue(graph); controls.detail.mockResolvedValue({ node: nodes[0] });
  controls.archive.mockImplementation((enabled: boolean) => ({ state: enabled ? state : null, error: null }));
  vi.stubGlobal("Worker", class { onmessage = null; onerror = null; postMessage() {} terminate() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function open3D() {
  render(workspace);
  await waitFor(() => expect(controls.overview).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Toggle 3D memory view" }));
}
function loadFull() { fireEvent.click(screen.getByRole("button", { name: "Load full 3D graph (up to 50,000)" })); }

describe("Memory workspace archive transitions", () => {
  it("does not enable archive fetching or layout in Canvas-only browsers", async () => {
    controls.mode = "fallback";
    await open3D();
    expect(screen.getByTestId("graph-3d").getAttribute("data-total-nodes")).toBe("50000");
    expect(screen.getByTestId("graph-3d").getAttribute("data-truncated")).toBe("true");
    expect((screen.getByRole("button", { name: "Load full 3D graph (up to 50,000)" }) as HTMLButtonElement).disabled).toBe(true);
    loadFull();
    expect(controls.archive.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
  });

  it("stops full archive work on context loss and resumes only after restoration", async () => {
    await open3D(); loadFull();
    expect(controls.archive.mock.lastCall?.[0]).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Simulate context loss" }));
    expect(controls.archive.mock.lastCall?.[0]).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Simulate context restore" }));
    expect(controls.archive.mock.lastCall?.[0]).toBe(true);
  });

  it("closes previous details and ignores their pending response when entering full archive", async () => {
    let resolveDetail!: (value: unknown) => void;
    controls.detail.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    await open3D();
    fireEvent.click(screen.getByRole("button", { name: "Open old node" }));
    expect(screen.getByLabelText("Memory node detail")).toBeTruthy();
    loadFull();
    expect(screen.queryByLabelText("Memory node detail")).toBeNull();
    await act(async () => { resolveDetail({ node: nodes[0] }); });
    expect(screen.queryByLabelText("Memory node detail")).toBeNull();
  });

  it("closes details for a new archive search and a different demo graph size", async () => {
    controls.runtime = "demo";
    await open3D();
    fireEvent.change(screen.getByRole("combobox", { name: "Demo graph size" }), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Open old node" }));
    await screen.findByText("Detail loaded");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "different" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.queryByLabelText("Memory node detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open old node" }));
    await screen.findByText("Detail loaded");
    fireEvent.change(screen.getByRole("combobox", { name: "Demo graph size" }), { target: { value: "50000" } });
    expect(screen.queryByLabelText("Memory node detail")).toBeNull();
  });

  it("does not display an obsolete sample error over a successful demo archive", async () => {
    controls.runtime = "demo"; controls.overview.mockRejectedValue(new Error("Sample unavailable"));
    await open3D();
    await screen.findByText("Sample unavailable");
    fireEvent.change(screen.getByRole("combobox", { name: "Demo graph size" }), { target: { value: "2000" } });
    expect(controls.archive.mock.lastCall?.[0]).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Sample unavailable")).toBeNull();
  });
});
