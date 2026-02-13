/* Example adapter for Deepnest background integration.
   This file is intentionally standalone and not wired automatically. */

import initWasm, * as wasm from "../pkg/wasm_deepnest.js";

type Point = { x: number; y: number };
type Path = Point[];
type Paths = Path[];
type Shape = { points: Path; children?: Paths };
type PolygonLike = Path | Shape;

export class WasmGeometryBackend {
  private ready = false;

  async init() {
    if (this.ready) return;
    await initWasm();
    wasm.init();
    this.ready = true;
  }

  async polygonArea(polygon: Path) {
    await this.init();
    return wasm.polygon_area({ polygon });
  }

  async polygonAreaFlat(coords: Float64Array | number[]) {
    await this.init();
    return wasm.polygon_area_flat(coords);
  }

  async polygonBounds(polygon: Path) {
    await this.init();
    return wasm.polygon_bounds({ polygon }) as
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | null;
  }

  async pointInPolygon(point: Point, polygon: Path, scale = 1e7) {
    await this.init();
    return wasm.point_in_polygon_test({ point, polygon, scale }) as number;
  }

  async booleanOp(
    subject_paths: Paths,
    clip_paths: Paths,
    op: "intersection" | "union" | "difference" | "xor",
    fill_rule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero",
    scale = 1e7
  ) {
    await this.init();
    return wasm.boolean_op({
      subject_paths,
      clip_paths,
      op,
      fill_rule,
      scale,
    }) as Paths;
  }

  async booleanOpFlat(
    subjectCoords: Float64Array | number[],
    subjectOffsets: Uint32Array | number[],
    clipCoords: Float64Array | number[],
    clipOffsets: Uint32Array | number[],
    op: "intersection" | "union" | "difference" | "xor",
    fillRule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero",
    scale = 1e7
  ) {
    await this.init();
    return wasm.boolean_op_flat(
      subjectCoords,
      subjectOffsets,
      clipCoords,
      clipOffsets,
      op,
      fillRule,
      scale
    ) as { coords: number[]; offsets: number[] };
  }

  async intersectionArea(
    a: Path,
    b: Path,
    fill_rule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero",
    scale = 1e7
  ) {
    await this.init();
    return wasm.intersection_area({ a, b, fill_rule, scale }) as number;
  }

  async outerNfp(
    a: PolygonLike,
    b: PolygonLike,
    inside = false,
    scale = 1e7,
    fillRule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero"
  ) {
    await this.init();
    return wasm.outer_nfp(a, b, inside, scale, fillRule) as {
      nfp: Path;
      regions: Paths;
      nfp_area: number;
      solution_count: number;
      scale: number;
    };
  }

  async outerNfpFlat(
    aCoords: Float64Array | number[],
    bCoords: Float64Array | number[],
    inside = false,
    scale = 1e7,
    fillRule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero"
  ) {
    await this.init();
    return wasm.outer_nfp_flat(aCoords, bCoords, inside, scale, fillRule) as {
      nfp: Path;
      regions: Paths;
      nfp_area: number;
      solution_count: number;
      scale: number;
    };
  }

  async outerNfpBatch(
    jobs: Array<{
      id?: string;
      a: PolygonLike;
      b: PolygonLike;
      inside?: boolean;
      fill_rule?: "nonzero" | "evenodd" | "positive" | "negative";
      holes?: Paths;
    }>,
    scale = 1e7,
    fillRule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero"
  ) {
    await this.init();
    return wasm.outer_nfp_batch(jobs, scale, fillRule) as Array<{
      id?: string;
      ok: boolean;
      nfp?: Path;
      regions?: Paths;
      error?: string;
    }>;
  }

  async innerNfp(
    container: PolygonLike,
    part: PolygonLike,
    holes: Paths = [],
    fill_rule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero",
    scale = 1e7
  ) {
    await this.init();
    return wasm.inner_nfp({ container, part, holes, fill_rule, scale }) as Paths | null;
  }

  async intersectionAreaBatchFlat(
    aCoords: Float64Array | number[],
    aOffsets: Uint32Array | number[],
    bCoords: Float64Array | number[],
    bOffsets: Uint32Array | number[],
    fillRule: "nonzero" | "evenodd" | "positive" | "negative" = "nonzero",
    scale = 1e7
  ) {
    await this.init();
    return wasm.intersection_area_batch_flat(
      aCoords,
      aOffsets,
      bCoords,
      bOffsets,
      fillRule,
      scale
    ) as number[];
  }
}
