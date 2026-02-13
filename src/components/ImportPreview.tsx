/**
 * SVG import preview tabs + viewport.
 * Replaces the Ractive import tabs and SVG preview in the old UI.
 */
import { useEffect, useRef, useCallback, useMemo } from "preact/hooks";
import {
  imports,
  importsVersion,
  deepNestRef,
  touchImports,
} from "../store/index.ts";

declare function svgPanZoom(
  selector: string,
  options: Record<string, unknown>
): any;

export function ImportPreview() {
  const _v = importsVersion.value;
  const allImports = imports.value;
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIndex = allImports.findIndex((im) => im.selected);
  const selectedImport = selectedIndex >= 0 ? allImports[selectedIndex] : null;
  const selectedMarkup = useMemo(() => {
    if (!selectedImport) return "";
    return new XMLSerializer().serializeToString(selectedImport.svg);
  }, [selectedImport, _v]);

  const selectTab = useCallback(
    (index: number) => {
      const dn = deepNestRef.value;
      if (!dn) return;
      dn.imports.forEach((im, i) => {
        im.selected = i === index;
      });
      touchImports();
    },
    []
  );

  const deleteImport = useCallback(
    (index: number) => {
      const dn = deepNestRef.value;
      if (!dn) return;
      dn.imports.splice(index, 1);
      if (dn.imports.length > 0) {
        const newIdx = Math.min(index, dn.imports.length - 1);
        dn.imports[newIdx].selected = true;
      }
      imports.value = dn.imports;
      touchImports();
    },
    []
  );

  // Apply svgPanZoom when selected import changes
  useEffect(() => {
    if (selectedImport && containerRef.current) {
      const svgEl = containerRef.current.querySelector("svg");
      if (svgEl && typeof svgPanZoom === "function") {
        try {
          const instance = svgPanZoom(`#import-preview svg`, {
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: true,
            center: true,
            maxZoom: 500,
            minZoom: 0.01,
          });
          // Store for zoom controls
          selectedImport.zoom = instance;
        } catch {
          // svgPanZoom may fail on empty SVGs
        }
      }
    }
  }, [selectedIndex, _v]);

  if (allImports.length === 0) {
    return (
      <div class="flex flex-1 items-center justify-center p-8 text-dn-text-muted">
        <div class="rounded-xl border border-dn-border/80 bg-white/70 p-8 text-center shadow-sm dark:border-white/10 dark:bg-black/20">
          <div class="mb-4 text-6xl opacity-30">📐</div>
          <p class="text-lg font-medium">No files imported yet</p>
          <p class="mt-1 text-sm">Import SVG, DXF, DWG, ASM or PSM files to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Tabs */}
      <div class="flex items-center gap-0 border-b border-dn-border bg-white/85 pr-2 backdrop-blur dark:border-[#404040] dark:bg-[#2d2d2d]/90">
        {allImports.map((im, i) => (
          <div
            key={i}
            class={`group flex cursor-pointer items-center gap-1 border-r border-dn-border px-3 py-2 text-xs
              dark:border-[#404040]
              ${im.selected ? "bg-dn-primary text-white shadow-sm" : "hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]"}`}
            onClick={() => selectTab(i)}
          >
            <span class="max-w-[120px] truncate">{im.filename}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteImport(i);
              }}
              class={`ml-1 text-xs font-bold opacity-50 hover:opacity-100
                ${im.selected ? "text-white" : "text-dn-danger"}`}
            >
              ×
            </button>
          </div>
        ))}
        <span class="ml-auto rounded-md border border-dn-border/80 bg-dn-light/75 px-2 py-1 text-[11px] text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
          {allImports.length} file{allImports.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Preview area */}
      <div
        ref={containerRef}
        id="import-preview"
        class="relative flex-1 overflow-hidden bg-dn-light dark:bg-dn-darkest"
      >
        {selectedImport && (
          <div
            class="import-preview-canvas h-full w-full"
            dangerouslySetInnerHTML={{
              __html: selectedMarkup,
            }}
          />
        )}

        {/* Zoom controls */}
        {selectedImport && (
          <div class="absolute right-4 bottom-4 flex flex-col gap-1 rounded-lg border border-white/20 bg-black/35 p-1 backdrop-blur-sm">
            <button
              onClick={() => selectedImport.zoom?.zoomIn()}
              class="rounded bg-dn-dark/85 px-2 py-1 text-sm text-white transition hover:bg-dn-dark"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => selectedImport.zoom?.zoomOut()}
              class="rounded bg-dn-dark/85 px-2 py-1 text-sm text-white transition hover:bg-dn-dark"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={() => selectedImport.zoom?.resetZoom().resetPan()}
              class="rounded bg-dn-dark/85 px-2 py-1 text-sm text-white transition hover:bg-dn-dark"
              title="Reset view"
            >
              ⟲
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
