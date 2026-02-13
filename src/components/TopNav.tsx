/**
 * Top navigation bar shown on the Home page.
 * Contains Import, Start Nest, Stop, Export, Back buttons.
 */
import {
  isNesting,
  sheetParts,
  nests,
  importBusy,
  parts,
} from "../store/index.ts";

interface TopNavProps {
  onImport: () => void;
  onStartNest: () => void;
  onStopNest: () => void;
  onBack: () => void;
  onExportSvg: () => void;
  onExportDxf: () => void;
  onExportJson: () => void;
  showNestView: boolean;
}

export function TopNav({
  onImport,
  onStartNest,
  onStopNest,
  onBack,
  onExportSvg,
  onExportDxf,
  onExportJson,
  showNestView,
}: TopNavProps) {
  const nesting = isNesting.value;
  const hasSheets = sheetParts.value.length > 0;
  const busy = importBusy.value;
  const hasNests = nests.value.length > 0;
  const totalParts = parts.value.length;
  const sheetCount = sheetParts.value.length;

  if (showNestView) {
    // Nest view top nav
    return (
      <ul class="flex h-[calc(var(--nav-width)-0.625em)] items-center gap-2 border-b
        border-dn-border/80 bg-white/88 px-2 backdrop-blur electron-drag dark:border-white/10 dark:bg-[#242526]/92">
        <li>
          <button
            onClick={onStopNest}
            class="electron-no-drag cursor-pointer rounded-lg bg-dn-danger px-4 py-2 text-sm font-bold
              uppercase text-white transition hover:brightness-110"
          >
            Stop
          </button>
        </li>

        {/* Export dropdown */}
        <li class="electron-no-drag group relative">
          <button
            class={`cursor-pointer rounded-lg px-4 py-2 text-sm font-bold uppercase transition
              ${hasNests ? "bg-dn-primary text-white hover:bg-dn-primary-hover" : "cursor-not-allowed bg-gray-300 text-gray-500"}`}
            disabled={!hasNests}
          >
            Export
          </button>
          {hasNests && (
            <ul class="invisible absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-dn-border/80
              bg-white shadow-xl group-hover:visible dark:border-white/10 dark:bg-[#2d2d2d]">
              <li>
                <button onClick={onExportSvg} class="w-full px-4 py-2 text-left text-sm hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]">
                  SVG file
                </button>
              </li>
              <li>
                <button onClick={onExportDxf} class="w-full px-4 py-2 text-left text-sm hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]">
                  DXF file
                </button>
              </li>
              <li>
                <button onClick={onExportJson} class="w-full px-4 py-2 text-left text-sm hover:bg-dn-table-hover dark:hover:bg-[#3d3d3d]">
                  JSON file
                </button>
              </li>
            </ul>
          )}
        </li>

        <li>
          <button
            onClick={onBack}
            class="electron-no-drag cursor-pointer rounded-lg bg-dn-dark px-4 py-2 text-sm font-bold
              uppercase text-white transition hover:bg-[#53575e]"
          >
            Back
          </button>
        </li>

        <li class="ml-2 rounded-md border border-dn-border/80 bg-dn-light/80 px-2 py-1 text-xs text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
          Results: {nests.value.length}
        </li>

        {/* Progress spinner */}
        {nesting ? (
          <li class="ml-auto mr-2">
            <svg width="36" height="36" viewBox="0 0 48 48" class="progress-circle">
              <circle
                fill="none"
                stroke="#242526"
                stroke-width="6"
                cx="24"
                cy="24"
                r="17.666"
              />
              <circle
                class="bar"
                fill="none"
                stroke="#24C7ED"
                stroke-width="6"
                cx="24"
                cy="24"
                r="17.666"
              />
            </svg>
          </li>
        ) : (
          <li class="ml-auto mr-2 rounded-md border border-dn-border/80 bg-dn-light/80 px-2 py-1 text-xs text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
            Ready
          </li>
        )}
      </ul>
    );
  }

  // Parts view top nav
  return (
    <ul class="flex h-[calc(var(--nav-width)-0.625em)] items-center gap-2 border-b
      border-dn-border/80 bg-white/88 px-2 backdrop-blur electron-drag dark:border-white/10 dark:bg-[#242526]/92">
      <li>
        <button
          onClick={onImport}
          disabled={busy}
          class={`electron-no-drag cursor-pointer rounded-lg px-4 py-2 text-sm font-bold uppercase transition
            ${busy ? "animate-pulse bg-gray-400 text-gray-200" : "bg-dn-primary text-white hover:bg-dn-primary-hover"}`}
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </li>
      <li>
        <button
          onClick={onStartNest}
          disabled={!hasSheets}
          class={`electron-no-drag cursor-pointer rounded-lg px-4 py-2 text-sm font-bold uppercase transition
            ${hasSheets ? "bg-dn-success text-white hover:brightness-110" : "cursor-not-allowed bg-gray-300 text-gray-500"}`}
        >
          Start nest
        </button>
      </li>
      <li class="ml-2 rounded-md border border-dn-border/80 bg-dn-light/80 px-2 py-1 text-xs text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
        Parts: {totalParts}
      </li>
      <li class="rounded-md border border-dn-border/80 bg-dn-light/80 px-2 py-1 text-xs text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
        Sheets: {sheetCount}
      </li>
      <li class="ml-auto mr-2 rounded-md border border-dn-border/80 bg-dn-light/80 px-2 py-1 text-xs text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
        {hasSheets ? "Ready to nest" : "Add a sheet to start"}
      </li>
    </ul>
  );
}
