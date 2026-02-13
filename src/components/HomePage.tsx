/**
 * Home page: contains the parts list view + import view (or nest view when nesting).
 * Replaces the #home .page section from index.html
 */
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import {
  darkMode,
  isNesting,
  nests,
  parts,
  importBusy,
  exportBusy,
  deepNestRef,
  selectedParts,
  touchParts,
  touchImports,
  touchNests,
  sheetDialogOpen,
  leftPanelWidth,
  setLeftPanelWidth,
  setAppPhase,
  showMessage,
  sheetParts,
  toggleDarkMode,
  activePage,
  commandPaletteOpen,
} from "../store/index.ts";
import { TopNav } from "./TopNav.tsx";
import { PartsTable } from "./PartsTable.tsx";
import { ImportPreview } from "./ImportPreview.tsx";
import { SheetDialog } from "./SheetDialog.tsx";
import { NestView } from "./NestView.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { CommandPalette, type CommandItem } from "./CommandPalette.tsx";

export function HomePage() {
  const showNestView = isNesting.value || nests.value.length > 0;
  const panelWidth = leftPanelWidth.value;
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const ensureUiServices = useCallback(async () => {
    const win = window as any;
    if (typeof win._ensureUiServices === "function") {
      await win._ensureUiServices();
    }
  }, []);

  const handleImport = useCallback(async () => {
    await ensureUiServices();
    const win = window as any;

    if (!win._importService) {
      showMessage("Import service unavailable", true);
      return;
    }

    importBusy.value = true;
    setAppPhase("importing");
    try {
      await win._importService.showImportDialog();
      touchParts();
      touchImports();
    } finally {
      importBusy.value = false;
      setAppPhase(isNesting.value ? "nesting" : "idle");
    }
  }, [ensureUiServices]);

  const deleteSelectedParts = useCallback(() => {
    const dn = deepNestRef.value;
    if (!dn) return;

    const toDelete = dn.parts.filter((p) => p.selected);
    if (toDelete.length === 0) return;

    toDelete.forEach((p) => {
      p.svgelements.forEach((el) => el.parentNode?.removeChild(el));
      const idx = dn.parts.indexOf(p);
      if (idx !== -1) dn.parts.splice(idx, 1);
    });

    parts.value = dn.parts;
    touchParts();
    touchImports();
    showMessage(`${toDelete.length} part${toDelete.length > 1 ? "s" : ""} deleted`);
  }, []);

  const handleStartNest = useCallback(async () => {
    if (sheetParts.value.length === 0) {
      showMessage("Add at least one sheet before starting nest", true);
      return;
    }

    await ensureUiServices();
    const dn = deepNestRef.value;
    const win = window as any;
    if (dn && win._nestingService) {
      // NestingService.startNesting expects (progressCallback, trigger)
      const started = win._nestingService.startNesting(null, "user");
      if (!started) {
        isNesting.value = false;
        setAppPhase("idle");
      } else {
        isNesting.value = true;
        setAppPhase("nesting");
      }
    }
  }, [ensureUiServices]);

  const handleStopNest = useCallback(async () => {
    await ensureUiServices();
    const win = window as any;
    if (win._nestingService) {
      const stopped = win._nestingService.stopNesting();
      if (stopped) {
        isNesting.value = false;
        setAppPhase("idle");
      }
    }
  }, [ensureUiServices]);

  const handleBack = useCallback(async () => {
    await ensureUiServices();
    const win = window as any;
    if (win._nestingService) {
      win._nestingService.goBack();
      setAppPhase("idle");
      return;
    }
    isNesting.value = false;
    nests.value = [];
    touchNests();
    setAppPhase("idle");
  }, [ensureUiServices]);

  const handleExportSvg = useCallback(async () => {
    if (nests.value.length === 0) {
      showMessage("No nest result to export", true);
      return;
    }

    await ensureUiServices();
    const win = window as any;
    if (!win._exportService) {
      showMessage("Export service unavailable", true);
      return;
    }

    setAppPhase("exporting");
    exportBusy.value = true;
    try {
      win._exportService.exportToSvg();
    } finally {
      exportBusy.value = false;
      setAppPhase(isNesting.value ? "nesting" : "idle");
    }
  }, [ensureUiServices]);

  const handleExportDxf = useCallback(async () => {
    if (nests.value.length === 0) {
      showMessage("No nest result to export", true);
      return;
    }

    await ensureUiServices();
    const win = window as any;
    if (!win._exportService) {
      showMessage("Export service unavailable", true);
      return;
    }

    setAppPhase("exporting");
    exportBusy.value = true;
    try {
      await win._exportService.exportToDxf();
    } finally {
      exportBusy.value = false;
      setAppPhase(isNesting.value ? "nesting" : "idle");
    }
  }, [ensureUiServices]);

  const handleExportJson = useCallback(async () => {
    if (nests.value.length === 0) {
      showMessage("No nest result to export", true);
      return;
    }

    await ensureUiServices();
    const win = window as any;
    if (!win._exportService) {
      showMessage("Export service unavailable", true);
      return;
    }

    setAppPhase("exporting");
    exportBusy.value = true;
    try {
      win._exportService.exportToJson();
    } finally {
      exportBusy.value = false;
      setAppPhase(isNesting.value ? "nesting" : "idle");
    }
  }, [ensureUiServices]);

  const handleResizeMouseDown = useCallback((ev: MouseEvent) => {
    resizeStartRef.current = { startX: ev.clientX, startWidth: leftPanelWidth.value };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const delta = ev.clientX - resizeStartRef.current.startX;
      setLeftPanelWidth(resizeStartRef.current.startWidth + delta);
    };

    const onMouseUp = () => {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || (ev.target as HTMLElement | null)?.isContentEditable;
      if (inField) return;

      const ctrlOrCmd = ev.ctrlKey || ev.metaKey;
      const paletteOpen = commandPaletteOpen.value;

      if (ctrlOrCmd && ev.key.toLowerCase() === "k") {
        // handled by CommandPalette
        return;
      }

      if (paletteOpen) return;

      if (ctrlOrCmd && ev.key.toLowerCase() === "i") {
        ev.preventDefault();
        void handleImport();
        return;
      }

      if (ctrlOrCmd && ev.key === "Enter") {
        ev.preventDefault();
        if (sheetParts.value.length > 0) {
          void handleStartNest();
        } else {
          showMessage("Add at least one sheet before starting nest", true);
        }
        return;
      }

      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        deleteSelectedParts();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedParts, handleImport, handleStartNest]);

  const commandItems = useMemo<CommandItem[]>(
    () => [
      {
        id: "import",
        label: "Import files",
        hint: "Ctrl+I",
        keywords: ["svg", "dxf", "dwg", "asm", "psm", "import"],
        run: handleImport,
      },
      {
        id: "start-nest",
        label: "Start nest",
        hint: "Ctrl+Enter",
        keywords: ["nest", "start", "placement"],
        disabled: sheetParts.value.length === 0 || isNesting.value,
        run: handleStartNest,
      },
      {
        id: "stop-nest",
        label: "Stop nest",
        keywords: ["nest", "stop", "cancel"],
        disabled: !isNesting.value,
        run: handleStopNest,
      },
      {
        id: "export-svg",
        label: "Export SVG",
        keywords: ["export", "svg"],
        disabled: nests.value.length === 0,
        run: handleExportSvg,
      },
      {
        id: "export-dxf",
        label: "Export DXF",
        keywords: ["export", "dxf"],
        disabled: nests.value.length === 0,
        run: handleExportDxf,
      },
      {
        id: "export-json",
        label: "Export JSON",
        keywords: ["export", "json"],
        disabled: nests.value.length === 0,
        run: handleExportJson,
      },
      {
        id: "add-sheet",
        label: "Add sheet",
        keywords: ["sheet", "material", "panel"],
        disabled: showNestView,
        run: () => {
          sheetDialogOpen.value = true;
        },
      },
      {
        id: "delete-selected",
        label: "Delete selected parts",
        hint: "Del",
        keywords: ["delete", "selected", "parts"],
        disabled: selectedParts.value.length === 0 || showNestView,
        run: deleteSelectedParts,
      },
      {
        id: "go-home",
        label: "Go to Home",
        keywords: ["home", "navigation"],
        run: () => {
          activePage.value = "home";
        },
      },
      {
        id: "go-config",
        label: "Go to Configuration",
        keywords: ["config", "settings", "navigation"],
        run: () => {
          activePage.value = "config";
        },
      },
      {
        id: "go-info",
        label: "Go to Info",
        keywords: ["info", "about", "navigation"],
        run: () => {
          activePage.value = "info";
        },
      },
      {
        id: "toggle-theme",
        label: darkMode.value ? "Switch to Light theme" : "Switch to Dark theme",
        keywords: ["theme", "dark", "light", "ui"],
        run: () => {
          toggleDarkMode();
        },
      },
    ],
    [
      darkMode.value,
      deleteSelectedParts,
      handleExportDxf,
      handleExportJson,
      handleExportSvg,
      handleImport,
      handleStartNest,
      handleStopNest,
      isNesting.value,
      nests.value.length,
      selectedParts.value.length,
      sheetParts.value.length,
      showNestView,
    ]
  );

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <TopNav
        onImport={() => {
          void handleImport();
        }}
        onStartNest={() => {
          void handleStartNest();
        }}
        onStopNest={() => {
          void handleStopNest();
        }}
        onBack={() => {
          void handleBack();
        }}
        onExportSvg={() => {
          void handleExportSvg();
        }}
        onExportDxf={() => {
          void handleExportDxf();
        }}
        onExportJson={() => {
          void handleExportJson();
        }}
        showNestView={showNestView}
      />

      {/* Progress bar */}
      {isNesting.value && <ProgressBar />}

      {showNestView ? (
        <NestView />
      ) : (
        <div class="flex flex-1 overflow-hidden p-2">
          {/* Left panel: parts table */}
          <div
            class="flex shrink-0 flex-col overflow-hidden rounded-l-xl border border-dn-border/80 bg-white/88 shadow-sm dark:border-white/10 dark:bg-[#222427]/85"
            style={{ width: `${panelWidth}px` }}
          >
            <PartsTable />

            {/* Bottom tools */}
            <div class="flex flex-wrap items-center gap-2 border-t border-dn-border/80 bg-dn-light/70 p-2 dark:border-white/10 dark:bg-black/25">
              <button
                onClick={() => (sheetDialogOpen.value = true)}
                class="rounded-md bg-dn-primary px-3 py-1 text-xs font-bold text-white transition hover:bg-dn-primary-hover"
                title="Add Sheet"
              >
                + Sheet
              </button>
              <button
                onClick={deleteSelectedParts}
                disabled={selectedParts.value.length === 0}
                class={`rounded-md px-3 py-1 text-xs font-bold text-white transition
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
                class="rounded-md bg-dn-dark px-3 py-1 text-xs font-bold text-white transition hover:bg-[#53575e]"
              >
                {selectedParts.value.length === parts.value.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
              <span class="ml-auto rounded-md border border-dn-border/80 bg-white/80 px-2 py-1 text-[11px] text-dn-text-muted dark:border-white/10 dark:bg-black/30 dark:text-gray-300">
                Shortcuts: Ctrl+I import, Ctrl+Enter nest, Del delete
              </span>
            </div>

            {/* Sheet dialog overlay */}
            {sheetDialogOpen.value && <SheetDialog />}
          </div>

          {/* Resize handle */}
          <div
            class="group relative mx-1 w-1 cursor-col-resize rounded bg-transparent"
            onMouseDown={(e) => handleResizeMouseDown(e as unknown as MouseEvent)}
            role="separator"
            aria-label="Resize panels"
          >
            <div class="absolute inset-y-0 left-0 w-1 rounded bg-dn-border transition group-hover:bg-dn-primary dark:bg-white/12 dark:group-hover:bg-dn-primary" />
          </div>

          {/* Right panel: import SVG previews */}
          <div class="flex flex-1 flex-col overflow-hidden rounded-r-xl border border-dn-border/80 bg-white/88 shadow-sm dark:border-white/10 dark:bg-[#222427]/85">
            <ImportPreview />
          </div>
        </div>
      )}

      <CommandPalette commands={commandItems} />
    </div>
  );
}
