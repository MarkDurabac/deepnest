# wasm-deepnest

Rust/WASM geometry backend for Deepnest hot paths:

- `clipper.js` replacement for boolean ops and Minkowski
- `geometryutil.js` replacement for area, bounds, point-in-polygon, intersection area

## Why this crate exists

Deepnest spends most CPU time in:

- `getOuterNfp` (Minkowski / NFP)
- `getInnerNfp` (container/hole constraints)
- repeated boolean ops (`Union`, `Difference`, `Intersection`)
- geometry primitives (`polygonArea`, `getPolygonBounds`, `pointInPolygon`)

This crate moves those operations to Rust and exposes them through `wasm-bindgen`.

## Dependencies

- `clipper2-rust` `1.0.0` (pure Rust Clipper2 port, includes Minkowski + boolean ops)
- `wasm-bindgen` `0.2.108`
- `serde` `1.0.228` + `serde-wasm-bindgen` `0.6.5`
- `console_error_panic_hook` `0.1.7`
- `thiserror` `2.0.18`

Version check was done with `cargo info` (crates.io index) in this workspace.

## Build

From `D:\app\deepnest\wasm-deepnest`:

```powershell
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
wasm-pack build --target web --release --out-dir pkg
```

Output will be in `wasm-deepnest/pkg`.

An integration adapter example is available in:

- `wasm-deepnest/examples/backend-adapter.ts`

## Exported API (WASM)

JSON/object API (compat / simpler integration):

- `init()`
- `polygon_area({ polygon }) -> number` (signed area, `0` for degenerate/non-finite)
- `polygon_bounds({ polygon }) -> { x, y, width, height } | null`
- `point_in_polygon_test({ point, polygon, scale? }) -> 1|0|-1`
- `boolean_op({ subject_paths, clip_paths, op, fill_rule?, scale? }) -> paths`
- `intersection_area({ a, b, fill_rule?, scale? }) -> number`
- `outer_nfp(a, b, inside, scale?, fill_rule?) -> { nfp, regions, nfp_area, solution_count, scale }`
- `outer_nfp_batch(jobs, scale?, fill_rule?) -> batch results`
- `inner_nfp({ container, part, holes?, fill_rule?, scale? }) -> paths | null`

Flat/buffer API (perf-first, lower JS↔WASM overhead):

- `polygon_area_flat(coords)`
- `polygon_bounds_flat(coords)`
- `polygon_area_batch_flat(coords, offsets)`
- `polygon_bounds_batch_flat(coords, offsets)`
- `boolean_op_flat(subject_coords, subject_offsets, clip_coords, clip_offsets, op, fill_rule?, scale?)`
- `intersection_area_batch_flat(a_coords, a_offsets, b_coords, b_offsets, fill_rule?, scale?)`
- `outer_nfp_flat(a_coords, b_coords, inside, scale?, fill_rule?)`

## Important behavior notes

- `inner_nfp` supports non-rectangular containers, container `children` holes, explicit `holes`, and multi-region outputs.
- `fill_rule` is propagated through boolean/intersection and inner-hole subtraction paths (`nonzero` default, supports `evenodd`, `positive`, `negative`).
- point-in-polygon functions return stable fallback values (`0` / `false`) for invalid polygons instead of throwing.

## Data format

You can provide polygons as either:

1. raw path:

```json
[{ "x": 0, "y": 0 }, { "x": 10, "y": 0 }, { "x": 10, "y": 5 }, { "x": 0, "y": 5 }]
```

2. shape object with children (holes):

```json
{
  "points": [{ "x": 0, "y": 0 }, { "x": 10, "y": 0 }, { "x": 10, "y": 5 }, { "x": 0, "y": 5 }],
  "children": [
    [{ "x": 2, "y": 1 }, { "x": 4, "y": 1 }, { "x": 4, "y": 3 }, { "x": 2, "y": 3 }]
  ]
}
```

Multiple polygons are arrays of polygons.

Flat format:

- `coords`: `Float64Array | number[]` as `[x0, y0, x1, y1, ...]`
- `offsets`: `Uint32Array | number[]` path boundaries in point units, always `[0, ..., total_points]`

## Suggested integration in Deepnest

1. Add backend adapter in `main/background.js`:
   - `GEOM_BACKEND=wasm|js`
2. Route these functions first:
   - `getOuterNfp` (non-addon branch)
   - boolean blocks around union/difference/intersection
   - overlap/intersection area checks
3. Keep current JS fallback if WASM fails.
4. Add worker side loader for wasm module initialization.
5. Compare parity with existing outputs on known SVG sets.

For heavy runs, prefer flat APIs in hot loops (`boolean_op_flat`, `outer_nfp_flat`, batch functions).

## Validation checklist

- no crashes on big imports
- same placed/unplaced count as baseline
- same or better fitness trend
- lower time in NFP + boolean sections

## Primary references

- Clipper2 docs: https://www.angusj.com/clipper2/Docs/Overview.htm
- clipper2-rust crate: https://docs.rs/clipper2-rust/
- wasm-bindgen guide: https://rustwasm.github.io/docs/wasm-bindgen/
- wasm-pack docs: https://rustwasm.github.io/docs/wasm-pack/
