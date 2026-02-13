/**
 * Sheet dialog component.
 * Replaces the sheet creation form from the old UI.
 */
import { useRef, useCallback, useEffect } from "preact/hooks";
import {
  sheetDialogOpen,
  deepNestRef,
  configServiceRef,
  touchParts,
  showMessage,
} from "../store/index.ts";

const INCHES_TO_MM = 25.4;

export function SheetDialog() {
  const widthRef = useRef<HTMLInputElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    const dn = deepNestRef.value;
    const cfg = configServiceRef.value;
    if (!dn || !cfg) return;

    const width = Number(widthRef.current?.value);
    const height = Number(heightRef.current?.value);

    if (!width || width <= 0 || !height || height <= 0) {
      showMessage("Please enter valid sheet dimensions", true);
      return;
    }

    const units = cfg.getSync("units");
    let conversion = cfg.getSync("scale");
    if (units === "mm") {
      conversion /= INCHES_TO_MM;
    }

    const svgWidth = width * conversion;
    const svgHeight = height * conversion;

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" class="sheet"/></svg>`;
    const newParts = dn.importsvg(null, null, svgString);
    if (newParts.length > 0) {
      newParts[0].sheet = true;
    }

    touchParts();
    sheetDialogOpen.value = false;
    showMessage("Sheet added");
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        sheetDialogOpen.value = false;
      }
      if (ev.key === "Enter") {
        handleConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleConfirm]);

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div class="w-[320px] rounded-2xl border border-dn-border/80 bg-white/95 p-5 shadow-xl dark:border-white/10 dark:bg-[#2d2d2d]/95">
        <h3 class="mb-1 text-base font-bold text-dn-text dark:text-white">
          Add Sheet
        </h3>
        <p class="mb-4 text-xs text-dn-text-muted">Tip: press Enter to confirm, Esc to cancel.</p>

        <label class="mb-3 block">
          <span class="mb-1 block text-xs text-dn-text-muted">
            Width ({configServiceRef.value?.getSync("units") === "mm" ? "mm" : "inches"})
          </span>
          <input
            ref={widthRef}
            type="number"
            min="0"
            step="any"
            class="w-full rounded border border-dn-input-border bg-dn-input-bg px-3 py-2 text-sm
              dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
            autofocus
          />
        </label>

        <label class="mb-4 block">
          <span class="mb-1 block text-xs text-dn-text-muted">
            Height ({configServiceRef.value?.getSync("units") === "mm" ? "mm" : "inches"})
          </span>
          <input
            ref={heightRef}
            type="number"
            min="0"
            step="any"
            class="w-full rounded border border-dn-input-border bg-dn-input-bg px-3 py-2 text-sm
              dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
          />
        </label>

        <div class="flex gap-2">
          <button
            onClick={handleConfirm}
            class="flex-1 rounded-md bg-dn-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-dn-primary-hover"
          >
            Add
          </button>
          <button
            onClick={() => (sheetDialogOpen.value = false)}
            class="flex-1 rounded-md bg-dn-dark px-4 py-2 text-sm font-bold text-white transition hover:bg-[#53575e]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
