import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryGraph3D } from "../src/features/memory-workspace/MemoryGraph3D.js";
import { createSyntheticMemoryGraph } from "../src/demo/demo-memory-graph.js";

const renderer = vi.hoisted(() => ({ setModel: vi.fn(), setFocus: vi.fn(), updatePositions: vi.fn(), draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
vi.mock("../src/features/memory-workspace/memory-3d-webgl.js", () => ({ MemoryWebGLRenderer: class {
  setModel = renderer.setModel; setFocus = renderer.setFocus; updatePositions = renderer.updatePositions;
  draw = renderer.draw; resize = renderer.resize; dispose = renderer.dispose;
} }));

const graph = createSyntheticMemoryGraph(5000);
const props = { nodes: graph.nodes, edges: graph.edges, positions: new Map(), coordinates: new Map(), showTitles: true,
  selectedNodeId: null, onSelectNode: vi.fn(), loading: false, resetToken: 0 };

describe("3D memory graph context recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("caps the existing accessible Canvas renderer at 2k when WebGL2 is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<MemoryGraph3D {...props} />);
    const canvas = screen.getByRole("application");
    expect(canvas.parentElement?.getAttribute("data-renderer")).toBe("canvas2d");
    expect(canvas.parentElement?.getAttribute("data-node-count")).toBe("2000");
    expect(canvas.getAttribute("tabindex")).toBe("0");
    expect(canvas.getAttribute("aria-label")).toContain("arrow keys");
    expect(canvas.getAttribute("aria-busy")).toBe("false");
  });

  it("switches to the capped renderer on context loss and reuploads the full model on restore", () => {
    const gl = { getExtension: () => null, getParameter: () => "test GPU" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (type) { return type === "webgl2" ? gl as unknown as WebGL2RenderingContext : null; });
    render(<MemoryGraph3D {...props} />);
    const original = screen.getByRole("application");
    expect(renderer.setModel).toHaveBeenCalledWith(expect.objectContaining({ nodes: graph.nodes }));
    const uploadedBeforeLoss = renderer.setModel.mock.calls.length;
    const lost = new Event("webglcontextlost", { cancelable: true });
    act(() => { original.dispatchEvent(lost); });
    expect(lost.defaultPrevented).toBe(true);
    expect(screen.getByRole("application").parentElement?.getAttribute("data-node-count")).toBe("2000");
    act(() => { original.dispatchEvent(new Event("webglcontextrestored")); });
    expect(screen.getByRole("application")).toBe(original);
    expect(renderer.setModel).toHaveBeenCalledTimes(uploadedBeforeLoss + 1);
    expect(renderer.dispose).toHaveBeenCalled();
  });
});
