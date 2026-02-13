/**
 * Top navigation bar shown on the Home page.
 * Contains Import, Start Nest, Stop, Export, Back buttons.
 */
import {
  isNesting,
  sheetParts,
  nests,
  nestsVersion,
  importBusy,
  deepNestRef,
  activePage,
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

  if (showNestView) {
    // Nest view top nav
    return (
      <ul class="flex h-[calc(var(--nav-width)-0.625em)] items-center gap-0 border-b-2
        border-dn-border bg-white px-0 electron-drag dark:border-[#404040] dark:bg-[#2d2d2d]">
        <li>
          <button
            onClick={onStopNest}
            class="electron-no-drag cursor-pointer bg-dn-danger px-5 py-2 text-sm font-bold
              uppercase text-white hover:brightness-110"
          >
            Stop nest
          </button>
        </li>

        {/* Export dropdown */}
        <li class="electron-no-drag group relative">
          <button
            class={`cursor-pointer px-5 py-2 text-sm font-bold uppercase
              ${hasNests ? "bg-dn-primary text-white hover:bg-dn-primary-hover" : "cursor-not-allowed bg-gray-300 text-gray-500"}`}
            disabled={!hasNests}
          >
            Export
          </button>
          {hasNests && (
            <ul class="invisible absolute left-0 top-full z-50 min-w-[120px] border border-dn-border
              bg-white shadow-lg group-hover:visible dark:border-[#404040] dark:bg-[#2d2d2d]">
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
            class="electron-no-drag cursor-pointer bg-dn-dark px-5 py-2 text-sm font-bold
              uppercase text-white hover:bg-[#53575e]"
          >
            Back
          </button>
        </li>

        {/* Progress spinner */}
        {nesting && (
          <li class="ml-4">
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
        )}
      </ul>
    );
  }

  // Parts view top nav
  return (
    <ul class="flex h-[calc(var(--nav-width)-0.625em)] items-center gap-0 border-b-2
      border-dn-border bg-white px-0 electron-drag dark:border-[#404040] dark:bg-[#2d2d2d]">
      <li>
        <button
          onClick={onImport}
          disabled={busy}
          class={`electron-no-drag cursor-pointer px-5 py-2 text-sm font-bold uppercase
            ${busy ? "animate-pulse bg-gray-400 text-gray-200" : "bg-dn-primary text-white hover:bg-dn-primary-hover"}`}
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </li>
      <li>
        <button
          onClick={onStartNest}
          disabled={!hasSheets}
          class={`electron-no-drag cursor-pointer px-5 py-2 text-sm font-bold uppercase
            ${hasSheets ? "bg-dn-success text-white hover:brightness-110" : "cursor-not-allowed bg-gray-300 text-gray-500"}`}
        >
          Start nest
        </button>
      </li>
    </ul>
  );
}
