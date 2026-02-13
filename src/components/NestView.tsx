/**
 * Nest View component.
 * Displays nesting results with SVG rendering.
 * This is the most complex component — keeps imperative SVG manipulation
 * via refs, same as the legacy code, since SVG DOM construction is heavily
 * procedural (hatch patterns, transforms, z-ordering).
 */
import { useEffect, useRef, useCallback } from "preact/hooks";
import {
  nests,
  nestsVersion,
  deepNestRef,
  configServiceRef,
  touchNests,
  selectedNest,
} from "../store/index.ts";
import type { SelectableNestingResult, Part, Bounds, SheetPlacementWithMerged } from "../types/index.ts";

interface SheetPlacement {
  sheetid: number;
  sheet: number;
  sheetplacements: SheetPlacementWithMerged[];
}

function createSvgEl(tag: string): SVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement;
}

function millisToStr(millis: number): string {
  const seconds = Math.floor(millis / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function NestView() {
  const _v = nestsVersion.value;
  const allNests = nests.value;
  const selected = selectedNest.value;
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const dn = deepNestRef.value;
  const cfg = configServiceRef.value;

  const selectNest = useCallback((n: SelectableNestingResult) => {
    const dnInst = deepNestRef.value;
    if (!dnInst) return;
    dnInst.nests.forEach((nest) => (nest.selected = false));
    n.selected = true;
    touchNests();
  }, []);

  // Render selected nest into SVG
  useEffect(() => {
    if (!selected || !svgContainerRef.current || !dn) return;

    const container = svgContainerRef.current;

    // Clear previous
    container.innerHTML = "";

    const svg = createSvgEl("svg") as SVGSVGElement;
    svg.setAttribute("id", "nestsvg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    container.appendChild(svg);

    let svgWidth = 0;
    let svgHeight = 0;

    selected.placements.forEach((s: any) => {
      const sp = s as SheetPlacement;
      const group = createSvgEl("g");
      group.setAttribute("id", `sheet${sp.sheetid}`);

      // Clone sheet elements
      if (dn.parts[sp.sheet]) {
        dn.parts[sp.sheet].svgelements.forEach((e) => {
          const node = e.cloneNode(true) as SVGElement;
          node.setAttribute("stroke", "#ffffff");
          node.setAttribute("fill", "none");
          node.removeAttribute("style");
          group.appendChild(node);
        });
      }

      const sheetBounds: Bounds = dn.parts[sp.sheet]?.bounds ?? {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
      group.setAttribute(
        "transform",
        `translate(${-sheetBounds.x}, ${svgHeight - sheetBounds.y})`
      );
      group.setAttribute("class", "sheet active");
      svg.appendChild(group);

      if (svgWidth < sheetBounds.width) svgWidth = sheetBounds.width;

      // Place parts
      sp.sheetplacements.forEach((p) => {
        const part: Part = dn.parts[p.source];
        if (!part) return;

        const partGroup = createSvgEl("g");
        partGroup.setAttribute("id", `part${p.id}`);

        part.svgelements.forEach((e, index) => {
          const node = e.cloneNode(true) as SVGElement;
          if (index === 0) {
            node.setAttribute("fill", `url(#part${p.source}hatch)`);
            node.setAttribute("fill-opacity", "0.5");
          } else {
            node.setAttribute("fill", "#404247");
          }
          node.removeAttribute("style");
          node.setAttribute("stroke", "#ffffff");
          partGroup.appendChild(node);
        });

        partGroup.setAttribute("class", "part active");

        // Position with CSS transform
        const t = `translate(${p.x - sheetBounds.x}px, ${p.y + svgHeight - sheetBounds.y}px)`;
        const r = p.rotation ? ` rotate(${p.rotation}deg)` : "";
        partGroup.setAttribute("style", `transform: ${t}${r}`);

        svg.appendChild(partGroup);

        // Create hatch pattern
        if (!svg.querySelector(`#part${p.source}hatch`)) {
          const pattern = createSvgEl("pattern");
          pattern.setAttribute("id", `part${p.source}hatch`);
          pattern.setAttribute("patternUnits", "userSpaceOnUse");
          let psize = parseInt(String(sheetBounds.width / 120)) || 10;
          pattern.setAttribute("width", String(psize));
          pattern.setAttribute("height", String(psize));

          const path = createSvgEl("path");
          path.setAttribute(
            "d",
            `M-1,1 l2,-2 M0,${psize} l${psize},-${psize} M${psize - 1},${psize + 1} l2,-2`
          );
          const hue = 360 * (p.source / dn.parts.length);
          path.setAttribute(
            "style",
            `stroke: hsl(${hue}, 100%, 80%) !important; stroke-width:1`
          );
          pattern.appendChild(path);
          group.appendChild(pattern);
        }

        // Merged lines
        if (p.mergedSegments?.length) {
          for (const seg of p.mergedSegments) {
            const line = createSvgEl("line");
            line.setAttribute("class", "merged");
            line.setAttribute("x1", String(seg[0].x - sheetBounds.x));
            line.setAttribute("x2", String(seg[1].x - sheetBounds.x));
            line.setAttribute("y1", String(seg[0].y + svgHeight - sheetBounds.y));
            line.setAttribute("y2", String(seg[1].y + svgHeight - sheetBounds.y));
            svg.appendChild(line);
          }
        }
      });

      svgHeight += 1.1 * sheetBounds.height;
    });

    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    // Animate merged lines
    setTimeout(() => {
      container.querySelectorAll(".merged").forEach((el) => {
        el.setAttribute("class", "merged active");
      });
    }, 1500);
  }, [selected, _v]);

  // Compute stats for selected nest
  const stats = (() => {
    if (!selected || !dn) return null;
    let placed = 0;
    selected.placements.forEach((s: any) => {
      placed += (s as SheetPlacement).sheetplacements.length;
    });
    let total = 0;
    dn.parts.forEach((p) => {
      if (!p.sheet) total += p.quantity;
    });
    const utilisation = selected.utilisation?.toFixed(2) ?? "-";
    const scale = cfg?.getSync("scale") ?? 72;
    const lengthInches = (selected.mergedLength ?? 0) / scale;
    const seconds = lengthInches / 2;
    const timeSaved = millisToStr(seconds * 1000);
    return { placed, total, utilisation, timeSaved };
  })();

  return (
    <div class="flex flex-1 overflow-hidden">
      {/* Left: nest list */}
      <div class="w-[260px] min-w-[220px] overflow-y-auto border-r border-dn-border/80 bg-white/88 backdrop-blur dark:border-white/10 dark:bg-[#2d2d2d]/88">
        <div class="sticky top-0 z-10 border-b border-dn-border/80 bg-white/90 p-3 backdrop-blur dark:border-white/10 dark:bg-[#2d2d2d]/90">
          <h3 class="text-sm font-bold text-dn-text-muted">Nesting Results</h3>
          <p class="text-xs text-dn-text-muted/80">{allNests.length} candidate{allNests.length > 1 ? "s" : ""}</p>
        </div>
        {allNests.map((n, i) => (
          <div
            key={i}
            onClick={() => selectNest(n)}
            class={`cursor-pointer border-b border-dn-border/80 p-3 text-sm transition-colors dark:border-white/10
              ${n.selected ? "bg-dn-primary/20 font-bold shadow-inner" : "hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]"}`}
          >
            <div class="flex items-center gap-2">
              <span class="text-dn-primary">#{i + 1}</span>
              <span>Utilisation: {n.utilisation?.toFixed(1)}%</span>
            </div>
            {/* Color dots for nested parts */}
            <div class="mt-1 flex flex-wrap gap-0.5">
              {(() => {
                const sources: number[] = [];
                n.placements?.forEach((s: any) => {
                  (s as SheetPlacement).sheetplacements?.forEach((p) => {
                    if (!sources.includes(p.source)) sources.push(p.source);
                  });
                });
                return sources.map((src) => (
                  <span
                    key={src}
                    class="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: `hsl(${360 * (src / (dn?.parts.length ?? 1))}, 100%, 80%)`,
                    }}
                  />
                ));
              })()}
            </div>
          </div>
        ))}
        {allNests.length === 0 && (
          <div class="p-4 text-center text-sm text-dn-text-muted">
            Waiting for results…
          </div>
        )}
      </div>

      {/* Right: SVG display + stats */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {stats && (
          <div class="flex flex-wrap gap-2 border-b border-dn-border/80 bg-white/88 px-3 py-2 text-sm backdrop-blur dark:border-white/10 dark:bg-[#2d2d2d]/88">
            <span class="rounded-md border border-dn-border/80 bg-dn-light/70 px-2 py-1 dark:border-white/10 dark:bg-black/25">
              <strong>Parts placed:</strong> {stats.placed}/{stats.total}
            </span>
            <span class="rounded-md border border-dn-border/80 bg-dn-light/70 px-2 py-1 dark:border-white/10 dark:bg-black/25">
              <strong>Utilisation:</strong> {stats.utilisation}%
            </span>
            <span class="rounded-md border border-dn-border/80 bg-dn-light/70 px-2 py-1 dark:border-white/10 dark:bg-black/25">
              <strong>Time saved:</strong> {stats.timeSaved}
            </span>
          </div>
        )}
        <div
          ref={svgContainerRef}
          class="flex-1 overflow-hidden bg-dn-dark/95"
          id="nestdisplay"
        />
      </div>
    </div>
  );
}
