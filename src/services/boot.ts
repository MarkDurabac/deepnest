/**
 * Boot service — initialise the app on startup.
 *
 * Bridges the legacy deepnest.js / svgparser.js globals with the new
 * Preact UI by wiring up services then populating signals.
 *
 * Legacy services (ImportService, ExportService, NestingService) are loaded
 * from the existing build/ output. They are NOT re-implemented here; we only
 * construct them with the right injected dependencies and expose them on
 * `window` so Preact components can call them.
 */
import {
  deepNestRef,
  svgParserRef,
  configServiceRef,
  config,
  parts,
  imports,
  nests,
  touchParts,
  touchImports,
  touchNests,
  isNesting,
  nestProgress,
  exportBusy,
  setAppPhase,
  showMessage,
} from "../store/index.ts";

/* ------------------------------------------------------------------ */
/*  Electron / Node require — available because nodeIntegration: true  */
/* ------------------------------------------------------------------ */
declare function require(module: string): any;

/**
 * Boot the application:
 * 1. Wait for global DeepNest and SvgParser (set by <script type=module> in index.html).
 * 2. Initialise ConfigService (async – reads persisted settings via IPC).
 * 3. Instantiate business services with correct constructor options.
 * 4. Wire IPC listeners so nesting results flow into signals.
 */
export async function boot(): Promise<void> {
  const win = window as any;
  setAppPhase("booting");
  win.__deepnestShowMessage = (text: string, isError?: boolean) => {
    showMessage(text, Boolean(isError));
  };

  // ── 1. Require Electron / Node modules ────────────────
  const { ipcRenderer } = require("electron");
  const electronRemote = require("@electron/remote");
  const fs = require("graceful-fs");
  const path = require("path");
  const os = require("os");
  const childProcess = require("child_process");
  const FormData = require("form-data");
  const axios = require("axios");

  let svgPreProcessor: any = null;
  try {
    svgPreProcessor = require("@deepnest/svg-preprocessor");
  } catch {
    /* optional dep */
  }

  // ── 2. Bootstrap DeepNest & SvgParser if not already on window ──
  // In production build, the inline <script type="module"> for bootstrap
  // is stripped by Vite, so we dynamically import them here.
  if (!(window as any).SvgParser) {
    const { SvgParser } = await import(/* @vite-ignore */ "../../main/svgparser.js");
    (window as any).SvgParser = new SvgParser();
  }
  if (!(window as any).DeepNest) {
    const { DeepNest } = await import(/* @vite-ignore */ "../../main/deepnest.js");
    (window as any).DeepNest = new DeepNest(ipcRenderer);
  }

  const dn = (window as any).DeepNest;
  const sp = (window as any).SvgParser;

  deepNestRef.value = dn;
  svgParserRef.value = sp;

  // ── 3. ConfigService ──────────────────────────────────
  const { ConfigService } = await import(
    /* @vite-ignore */ "../../build/ui/services/config.service.js"
  );
  const cfgService = new ConfigService(ipcRenderer);
  await cfgService.initialize();
  configServiceRef.value = cfgService;

  // Expose on window — deepnest.js calls window.config.getSync() directly
  (window as any).config = cfgService;

  // Push config into engine
  const cfgValues = cfgService.getSync();
  dn.config(cfgValues);
  config.value = cfgValues;

  const { ImportService } = await import(
    /* @vite-ignore */ "../../build/ui/services/import.service.js"
  );
  const importService = new ImportService({
    dialog: electronRemote.dialog,
    remote: electronRemote,
    fs,
    path,
    httpClient: axios.default ?? axios,
    FormData,
    childProcess,
    os,
    svgPreProcessor,
    config: cfgService,
    deepNest: dn,
  });

  const { ExportService } = await import(
    /* @vite-ignore */ "../../build/ui/services/export.service.js"
  );
  const exportService = new ExportService({
    dialog: electronRemote.dialog,
    remote: electronRemote,
    fs,
    httpClient: axios.default ?? axios,
    FormData,
    config: cfgService,
    deepNest: dn,
    svgParser: sp,
    exportLoadingCallback: (loading: boolean) => {
      exportBusy.value = loading;
    },
  });

  const { NestingService } = await import(
    /* @vite-ignore */ "../../build/ui/services/nesting.service.js"
  );
  const nestingService = new NestingService({
    fs,
    ipcRenderer,
    deepNest: dn,
    nestRactive: {
      update: async () => {
        nests.value = dn.nests ?? [];
        touchNests();
      },
      get: () => dn.nests ?? [],
      set: async () => {},
      on: () => {},
    },
    displayNestFn: () => {
      nests.value = dn.nests ?? [];
      touchNests();
    },
    saveJsonFn: () => {
      try {
        exportService.exportToJson();
      } catch {
        // No result to export yet
      }
    },
    uiBridge: {
      setViewMode: (mode: "main" | "nest") => {
        if (mode === "main") {
          isNesting.value = false;
          nestProgress.value = null;
          return;
        }
        isNesting.value = true;
      },
      clearProgressIndicators: () => {
        nestProgress.value = null;
      },
      setStopButtonState: (state: "stop" | "stop-disabled" | "start") => {
        if (state === "stop") {
          isNesting.value = true;
          return;
        }
        if (state === "stop-disabled" || state === "start") {
          isNesting.value = false;
        }
      },
    },
  });

  win._importService = importService;
  win._exportService = exportService;
  win._nestingService = nestingService;
  win._ensureUiServices = async () => ({
    importService,
    exportService,
    nestingService,
  });

  // ── 7. Sync initial signals ───────────────────────────
  parts.value = dn.parts;
  imports.value = dn.imports ?? [];
  nests.value = dn.nests ?? [];

  // ── 8. Observe nesting results ─────────────────────────
  // DeepNest already listens to "background-response" via ipcRenderer
  // in its constructor and calls handleBackgroundResponse. We wrap that
  // method so we can sync signals after each result is processed.
  const origHandleBgResponse = dn.handleBackgroundResponse.bind(dn);
  dn.handleBackgroundResponse = (payload: any) => {
    origHandleBgResponse(payload);
    nests.value = dn.nests ?? [];
    touchNests();
    touchParts();
  };

  // Progress listener (not registered by DeepNest itself)
  ipcRenderer.on("background-progress", (_evt: any, payload: any) => {
    if (payload && typeof payload.progress === "number" && payload.progress < 0) {
      nestProgress.value = null;
      return;
    }
    nestProgress.value = payload;
  });

  // ── 9. Monkey-patch DeepNest.importsvg to sync signals ─
  const origImport = dn.importsvg.bind(dn);
  dn.importsvg = (...args: any[]) => {
    const result = origImport(...args);
    parts.value = dn.parts;
    imports.value = dn.imports ?? [];
    touchParts();
    touchImports();
    return result;
  };

  setAppPhase("idle");
  console.log("[Preact UI] Boot complete");
}
