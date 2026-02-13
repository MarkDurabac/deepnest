/**
 * Parts table component.
 * Replaces the Ractive template-part-list table.
 */
import { useCallback } from "preact/hooks";
import {
  parts,
  partsVersion,
  importsVersion,
  deepNestRef,
  configServiceRef,
  touchParts,
  touchImports,
  sortState,
} from "../store/index.ts";
import type { Part, SortDirection } from "../types/index.ts";

const thumbnailCache = new WeakMap<Part, string>();

/** Render a small SVG preview for a part */
function partThumbnail(part: Part): string {
  const cached = thumbnailCache.get(part);
  if (cached) return cached;

  const b = part.bounds;
  const pad = 5;
  const viewBox = `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
  let inner = "";
  for (const el of part.svgelements) {
    inner += new XMLSerializer().serializeToString(el.cloneNode(false));
  }
  const svg = `<svg width="${b.width + 10}px" height="${b.height + 10}px" viewBox="${viewBox}">${inner}</svg>`;
  thumbnailCache.set(part, svg);
  return svg;
}

/** Format part dimensions */
function dimensionLabel(part: Part, units: string, scale: number): string {
  const w = part.bounds.width;
  const h = part.bounds.height;
  if (units === "mm") {
    return `${((25.4 * w) / scale).toFixed(1)}mm × ${((25.4 * h) / scale).toFixed(1)}mm`;
  }
  return `${(w / scale).toFixed(1)}in × ${(h / scale).toFixed(1)}in`;
}

export function PartsTable() {
  // Read version to subscribe to mutations
  const _pv = partsVersion.value;
  const _iv = importsVersion.value;
  const allParts = parts.value;
  const sort = sortState.value;

  const cfg = configServiceRef.value;
  const units = cfg?.getSync?.("units") ?? "inch";
  const scale = cfg?.getSync?.("scale") ?? 72;

  const handleSort = useCallback(
    (field: string) => {
      const current = sortState.value;
      const reverse = current.field === field && current.direction === "asc";
      const direction: SortDirection = reverse ? "desc" : "asc";

      const dn = deepNestRef.value;
      if (!dn) return;

      dn.parts.sort((a: any, b: any) => {
        const av = a[field];
        const bv = b[field];
        if (av == null || bv == null) return 0;
        if (av < bv) return reverse ? 1 : -1;
        if (av > bv) return reverse ? -1 : 1;
        return 0;
      });

      sortState.value = { field: field as any, direction };
      parts.value = dn.parts;
      touchParts();
    },
    []
  );

  const togglePart = useCallback((part: Part) => {
    part.selected = !part.selected;
    if (part.svgelements) {
      part.svgelements.forEach((el) => {
        if (part.selected) {
          el.setAttribute("class", "active");
        } else {
          el.removeAttribute("class");
        }
      });
    }
    touchParts();
    touchImports();
  }, []);

  return (
    <div class="flex-1 overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-[#2d2d2d]/95">
          <tr class="border-b border-dn-border text-left text-xs uppercase tracking-wider text-dn-text-muted dark:border-[#404040]">
            <th class="px-2 py-2">
              <span>Preview</span>
            </th>
            <th
              onClick={() => handleSort("area")}
              class="cursor-pointer px-2 py-2 hover:text-dn-primary"
            >
              <span>
                Size{" "}
                {sort.field === "area"
                  ? sort.direction === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </span>
            </th>
            <th
              onClick={() => handleSort("sheet")}
              class="cursor-pointer px-2 py-2 hover:text-dn-primary"
            >
              <span>
                Sheet{" "}
                {sort.field === "sheet"
                  ? sort.direction === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </span>
            </th>
            <th
              onClick={() => handleSort("quantity")}
              class="cursor-pointer px-2 py-2 hover:text-dn-primary"
            >
              <span>
                Quantity{" "}
                {sort.field === "quantity"
                  ? sort.direction === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {allParts.map((part, i) => (
            <tr
              key={i}
              onMouseDown={() => togglePart(part)}
              onMouseEnter={(e) => {
                if ((e as MouseEvent).buttons > 0) togglePart(part);
              }}
              class={`cursor-pointer border-b border-dn-border transition-colors dark:border-[#404040]
                ${part.selected ? "bg-dn-primary/20" : i % 2 === 0 ? "bg-transparent hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]" : "bg-black/[0.015] hover:bg-dn-table-hover dark:bg-white/[0.02] dark:hover:bg-[#3d3d3d]"}`}
            >
              <td class="px-2 py-1">
                <div
                  class="max-h-[40px] max-w-[60px] overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: partThumbnail(part) }}
                />
              </td>
              <td class="px-2 py-1 text-xs">
                {dimensionLabel(part, units, scale)}
              </td>
              <td class="px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={part.sheet}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    part.sheet = (e.target as HTMLInputElement).checked;
                    touchParts();
                  }}
                  class="accent-dn-primary"
                />
              </td>
              <td class="px-2 py-1">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={part.quantity}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onInput={(e) => {
                    part.quantity = Number((e.target as HTMLInputElement).value) || 1;
                    touchParts();
                  }}
                  class="w-14 rounded border border-dn-input-border bg-dn-input-bg px-1 py-0.5 text-center text-xs
                    dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
                />
              </td>
            </tr>
          ))}
          {allParts.length === 0 && (
            <tr>
              <td
                colSpan={4}
                class="px-4 py-8 text-center text-sm text-dn-text-muted"
              >
                No parts imported. Click <strong>Import</strong> to add SVG/DXF files.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
