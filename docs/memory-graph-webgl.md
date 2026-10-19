# Large 3D memory graphs

The 3D view uses WebGL2 for nodes and edges, a bounded Canvas label overlay,
and a worker for fetching, decoding, atlas preparation and incremental layout.
The normal overview API still defaults to 2,000 nodes. An explicit admin
request may ask for `limit=50000`; the response is bounded to 50,000 nodes and
150,000 visible edges. Existing authentication, node redaction, edge redaction
and source filtering remain in the route.

## Renderer and interaction

- Nodes are instanced four-vertex signed-distance discs, with the existing atlas
  colors and source/core sizes. They establish GPU depth before the edge batch,
  allowing hidden line fragments to be rejected early.
- Edges are one vertex batch. Their endpoint positions come from a float
  texture, so a layout update uploads node coordinates rather than rebuilding
  150,000 line geometries. Camera rotation is a matrix uniform update.
- A screen-space spatial index is rebuilt on camera, geometry or focus changes.
  Pointer picking searches one cell and chooses the nearest matching depth;
  it does not scan all nodes or synchronously read GPU pixels on pointer moves.
  Rebuilding the index is O(nodes) per changed camera frame; it is not a CPU
  depth sort.
- Labels inspect at most 256 prepared candidates and measure at most 96 strings.
  Core/source labels are prioritized, focused nodes are considered first, and
  screen-space boxes suppress overlapping labels. Zoom controls label LOD.
- Above 10,000 nodes, graph primitives use at most one backing-store pixel per
  CSS pixel to limit integrated-GPU fill cost. Labels retain the native ratio
  up to 2. Smaller graphs retain the native graph ratio up to 2. Benchmark JSON
  reports graph, label and device ratios separately; report the measured ratio
  with any performance result.
- Arrow keys rotate, plus/minus zoom, and Enter opens the selected/core node.
  Pointer dragging, wheel zoom, pinch zoom and click selection remain available.

## Loading and layout

Large API JSON and schema checks run in the archive worker. Nodes, edges and
atlas metadata cross the worker boundary in bounded messages; render buffers,
CSR adjacency and immutable position frames use transferable typed arrays.
The first position frame is usable before convergence. The force solver emits
updates through step 180, with deterministic identity/edge ordering. Archives
above 2,000 nodes use centroid repulsion for dense cells and exact numeric cell
keys to bound allocation; small graphs retain their existing force law.

When WebGL2 is unavailable or a context is lost, the existing Canvas renderer
shows at most 2,000 nodes and 6,000 edges with a visible count notice. Restoring
the context reuploads the full current model. The canvas retains its accessible
name, keyboard focus, busy state, title flag, rotation and volume attributes.

## Reproduce in a browser

Use the contributor Node version and install/build prerequisites in
`CONTRIBUTING.md`. Start the web development server:

```sh
npm run dev -w @space/web -- --host 127.0.0.1
```

Open `/memory-graph-benchmark.html` on that server. This isolated, network-free
page uses the same production component, archive worker and synthetic generator
as the demo workspace. Select 2,000, 10,000 or 50,000 nodes. Each synthetic node
has three edges at those sizes. Wait for layout completion, then click
**Benchmark 3D (300 frames)**. The harness rotates and zooms for 60 warm-up
frames and records 300 real requestAnimationFrame intervals and indexed picks.
Keep the tab visible; hiding it cancels the run. The JSON includes the actual
GPU, browser, viewport, pixel ratios, P95/median/max intervals, CPU enqueue work,
picking latency and main-thread long tasks. CPU enqueue time is diagnostic,
not a substitute for frame intervals or GPU completion.

The demo workspace also has the same graph-size selector and benchmark under
its 3D Atlas view. **Lose WebGL context** and **Restore WebGL context** exercise
the actual browser extension and fallback path without changing browser flags.

## Validation status

Measured on an AMD Radeon 610M integrated laptop GPU, Windows 11, Chrome 155:

| Revision/configuration | Nodes / edges | Viewport | Graph ratio | Frame P95 | Pick P95 |
| --- | --- | --- | --- | --- | --- |
| Initial GPU readback picking | 50,000 / 150,000 | 1279.5 x 658.1 | 1.5 | 42.5 ms | 39.8 ms |
| Indexed picking, small graph | 2,000 / 6,000 | 1279.5 x 658.1 | 1.5 | 6.2 ms | <0.1 ms |
| Batched edges, before dense-graph ratio cap | 50,000 / 150,000 | 1666 x 697 | 1.5 | 36.4 ms | 0.1 ms |
| Dense graph ratio cap, development | 50,000 / 150,000 | 1666 x 697 | 1.0 | 24.3 ms | 0.1 ms |
| First production repeat, before node-first depth | 50,000 / 150,000 | 1666 x 697 | 1.0 | 36.6 ms | 0.1 ms |
| Node-first depth, four-vertex strips, production | 50,000 / 150,000 | 1666 x 697 | 1.0 | 18.3 ms | 0.1 ms |
| Same production configuration, independent repeat | 50,000 / 150,000 | 1666 x 697 | 1.0 | 18.3 ms | 0.1 ms |
| Small graph, final production | 2,000 / 6,000 | 1666 x 697 | 1.5 | 12.2 ms | <0.1 ms |

The final production large-graph runs, recorded at `2026-10-19T18:10:52.686Z`
and `2026-10-19T18:13:05.991Z`, meet the requested 33 ms frame P95 and 4 ms
picking P95 on this hardware. Neither observed load/layout or benchmark
main-thread long tasks. Their frame medians were 12.2 ms, maxima 48.6/30.4 ms,
CPU enqueue P95 6.4/5.8 ms, and picking maxima 0.2 ms. The final production
2,000-node run at `2026-10-19T18:24:10.703Z` measured 12.2 ms frame P95,
meeting the 16.7 ms small-graph target, with no observed long tasks.
The device and label ratios were both 1.5; only graph primitives used ratio 1.
The table retains unsuccessful configurations, including the failed production
repeat after the initial development pass, to make that tradeoff explicit.
Raw browser measurements must accompany a qualifying performance claim.

The synthetic 50,000-node/150,000-edge API response measured 31,289,411 UTF-8
bytes. Two Ubuntu CI test requests took 742.94 ms and 919.3 ms, respectively,
including Fastify injection, server filtering, redaction, validation and
serialization; these are server fixture timings, not end-to-end network latency.

The affected web suite has 58 passing tests, including worker transfer,
schema-valid synthetic data, indexed picking against a depth-aware reference,
and context loss/recovery. At commit `ea6cfb2`, the complete Linux architecture
and workspace typechecks, API/web regressions, all public test suites, all
workspace builds and repository hygiene passed in workflow run `39297420132`,
job `118218894701`. Final shader/reporting changes need the same checks on
their final commit. Earlier invalid fixture provenance/identity and incorrect
status expectations were corrected without relaxing production behavior.
