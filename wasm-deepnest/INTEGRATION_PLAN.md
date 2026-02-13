# Integration Plan (Deepnest)

## Goal

Replace heavy geometry workload in JS (`clipper.js` + `geometryutil.js` hot path) with Rust/WASM while preserving behavior.

## Scope

Hot path targets in current codebase:

- `main/background.js:715` `getOuterNfp`
- `main/background.js:875` `getInnerNfp`
- `main/background.js:1409` NFP union + sheet difference
- `main/background.js:1800` and `main/background.js:2030` overlap/intersection checks
- `main/util/geometryutil.js:635` `polygonArea`
- `main/util/geometryutil.js:553` `getPolygonBounds`
- `main/deepnest.js:645` `pointInPolygon` (optional first wave)

## Phase 1 (backend + parity harness, 4-7 days)

1. Create backend adapter:
   - `main/geometry/backend.ts` (or equivalent)
   - methods mirroring current calls: `outerNfp`, `booleanOp`, `intersectionArea`, `polygonArea`, `polygonBounds`
2. Initialize WASM once on app startup (background process + worker if used).
3. Use feature flag:
   - `DEEPNEST_GEOM_BACKEND=wasm|js`
4. Keep full JS fallback path.
5. Add comparison mode:
   - compute both JS and WASM for sample jobs
   - log area/bounds deltas and polygon count differences
6. Prefer flat APIs in hot loops:
   - `boolean_op_flat`
   - `outer_nfp_flat`
   - `intersection_area_batch_flat`
   - `polygon_area_batch_flat`

## Phase 2 (replace placement hot loops, 5-10 days)

1. Wire WASM for:
   - outer NFP generation
   - union/difference pipeline
   - intersection checks used to reject overlaps
2. Keep cache keys unchanged:
   - `A/B/source/rotation` for NFP reuse
3. Batch operations where possible:
   - `outer_nfp_batch` for pair preprocessing
4. Move calls to worker boundary if main thread shows stalls.

## Phase 3 (inner NFP parity hardening, 4-7 days)

1. Validate parity for `inner_nfp` on arbitrary containers/holes/multi-regions (current WASM implementation already supports this path).
2. Validate on:
   - rectangular sheets
   - sheets with holes
   - part-in-hole scenarios
3. Add tolerances and deterministic rounding policy matching legacy `clipperScale`.

## Phase 4 (perf hardening + rollout, 3-5 days)

1. Add micro-benchmarks:
   - NFP pair throughput
   - boolean op throughput
   - overlap rejection throughput
2. Add macro benchmarks:
   - full nest run time on large SVG sets
3. Tune:
   - batch size
   - flat buffer chunking and allocation reuse
4. Enable WASM by default when parity threshold is satisfied.

## Recommended contracts

Geometry adapter contract:

- `outerNfp(aOrShape, bOrShape, inside, scale, fillRule?)`
- `outerNfpBatch(jobs, scale, fillRule?)`
- `booleanOp(subjectPaths, clipPaths, op, fillRule, scale)`
- `intersectionArea(a, b, fillRule, scale)`
- `polygonArea(path)`
- `polygonBounds(path)`
- `pointInPolygon(point, path, scale)`
- `innerNfp(containerOrShape, partOrShape, holes, fillRule, scale)`
- `booleanOpFlat(subjectCoords, subjectOffsets, clipCoords, clipOffsets, op, fillRule, scale)`
- `outerNfpFlat(aCoords, bCoords, inside, scale, fillRule?)`
- `intersectionAreaBatchFlat(aCoords, aOffsets, bCoords, bOffsets, fillRule, scale)`

## Risks and mitigations

- Risk: subtle geometry parity deltas.
  - Mitigation: dual-run compare mode + test corpus.
- Risk: serialization overhead.
  - Mitigation: use the existing flat API (`Float64Array` + `Uint32Array` offsets).
- Risk: large-path integer overflow at high scale.
  - Mitigation: range checks before conversion to `i64`.

## Done criteria

- No crash regressions.
- Same placed/unplaced behavior on reference jobs.
- Fitness trend non-regressive.
- Meaningful runtime gain on large imports (target 5-20x on geometry-heavy stages, not necessarily full end-to-end).
