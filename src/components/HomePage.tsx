/**
 * Home page: contains the parts list view + import view (or nest view when nesting).
 * Replaces the #home .page section from index.html
 */
import { useRef, useCallback } from "preact/hooks";
import {
  isNesting,
  nests,
  nestsVersion,
  parts,
  partsVersion,
  imports,
  importsVersion,
  importBusy,
  deepNestRef,
  configServiceRef,
  selectedParts,
  sheetParts,
  touchParts,
  touchImports,
  touchNests,
  sheetDialogOpen,
  showMessage,
  nestProgress,
  config,
} from "../store/index.ts";
import { TopNav } from "./TopNav.tsx";
import { PartsTable } from "./PartsTable.tsx";
import { ImportPreview } from "./ImportPreview.tsx";
import { SheetDialog } from "./SheetDialog.tsx";
import { NestView } from "./NestView.tsx";
import { ProgressBar } from "./ProgressBar.tsx";

export function HomePage() {
  const showNestView = isNesting.value || nests.value.length > 0;

  const handleImport = useCallback(async () => {
    // Will be wired to ImportService in boot.ts
    const win = window as any;
    if (win._importService) {
      importBusy.value = true;
      try {
        await win._importService.showImportDialog();
        touchParts();
        touchImports();
      } finally {
        importBusy.value = false;
      }
    }
  }, []);

  const handleStartNest = useCallback(() => {
    const dn = deepNestRef.value;
    const win = window as any;
    if (dn && win._nestingService) {
      isNesting.value = true;
      win._nestingService.startNest();
    }
  }, []);

  const handleStopNest = useCallback(() => {
    const win = window as any;
    if (win._nestingService) {
      win._nestingService.stopNest();
      isNesting.value = false;
    }
  }, []);

  const handleBack = useCallback(() => {
    isNesting.value = false;
    nests.value = [];
    touchNests();
  }, []);

  const handleExportSvg = useCallback(() => {
    const win = window as any;
    win._exportService?.exportToSvg();
  }, []);

  const handleExportDxf = useCallback(async () => {
    const win = window as any;
    await win._exportService?.exportToDxf();
  }, []);

  const handleExportJson = useCallback(() => {
    const win = window as any;
    win._exportService?.exportToJson();
  }, []);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <TopNav
        onImport={handleImport}
        onStartNest={handleStartNest}
        onStopNest={handleStopNest}
        onBack={handleBack}
        onExportSvg={handleExportSvg}
        onExportDxf={handleExportDxf}
        onExportJson={handleExportJson}
        showNestView={showNestView}
      />

      {/* Progress bar */}
      {isNesting.value && <ProgressBar />}

      {showNestView ? (
        <NestView />
      ) : (
        <div class="flex flex-1 overflow-hidden">
          {/* Left panel: parts table */}
          <div class="flex w-[320px] min-w-[200px] flex-col border-r border-dn-border dark:border-[#404040]">
            <PartsTable />

            {/* Bottom tools */}
            <div class="flex items-center gap-2 border-t border-dn-border bg-white p-2 dark:border-[#404040] dark:bg-[#2d2d2d]">
              <button
                onClick={() => (sheetDialogOpen.value = true)}
                class="rounded bg-dn-primary px-3 py-1 text-xs font-bold text-white hover:bg-dn-primary-hover"
                title="Add Sheet"
              >
                + Sheet
              </button>
              <button
                onClick={() => {
                  const dn = deepNestRef.value;
                  if (!dn) return;
                  const toDelete = dn.parts.filter((p) => p.selected);
                  toDelete.forEach((p) => {
                    p.svgelements.forEach((el) => el.parentNode?.removeChild(el));
                    const idx = dn.parts.indexOf(p);
                    if (idx !== -1) dn.parts.splice(idx, 1);
                  });
                  parts.value = dn.parts;
                  touchParts();
                  touchImports();
                }}
                disabled={selectedParts.value.length === 0}
                class={`rounded px-3 py-1 text-xs font-bold text-white
                  ${selectedParts.value.length > 0 ? "bg-dn-danger hover:brightness-110" : "cursor-not-allowed bg-gray-300"}`}
              >
                Delete
              </button>
              <button
                onClick={() => {
                  const dn = deepNestRef.value;
                  if (!dn) return;
                  const allSelected = dn.parts.every((p) => p.selected);
                  dn.parts.forEach((p) => (p.selected = !allSelected));
                  touchParts();
                }}
                disabled={parts.value.length === 0}
                class="rounded bg-dn-dark px-3 py-1 text-xs font-bold text-white hover:bg-[#53575e]"
              >
                {selectedParts.value.length === parts.value.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>

            {/* Sheet dialog overlay */}
            {sheetDialogOpen.value && <SheetDialog />}
          </div>

          {/* Right panel: import SVG previews */}
          <div class="flex flex-1 flex-col overflow-hidden">
            <ImportPreview />
          </div>
        </div>
      )}
    </div>
  );
}
