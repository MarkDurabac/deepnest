/**
 * Type definitions shared between old and new UI.
 * Re-exports from the existing types and adds new ones for Preact components.
 */

// Re-export everything from legacy types
export type {
  DeepNestConfig,
  SheetPlacement,
  NestingResult,
  PlacementType,
  UnitType,
  Bounds,
  PolygonPoint,
  Polygon,
  Part,
} from "../../index.d.ts";

export type {
  UIConfig,
  SvgPanZoomInstance,
  ImportedFile,
  ConfigObject,
  NestingProgress,
  SelectableNestingResult,
  DeepNestInstance,
  PartsViewData,
  NestViewData,
  RactiveInstance,
  SheetPlacementWithMerged,
  MergedSegment,
  SvgParserInstance,
} from "../../main/ui/types/index.ts";

export { IPC_CHANNELS } from "../../main/ui/types/index.ts";

/** View/page identifiers */
export type PageId = "home" | "config" | "info";

/** Sort direction */
export type SortDirection = "asc" | "desc" | null;

/** Sort state for parts table */
export interface SortState {
  field: keyof import("../../index.d.ts").Part | null;
  direction: SortDirection;
}

/** Export format options */
export type ExportFormat = "svg" | "dxf" | "json";
