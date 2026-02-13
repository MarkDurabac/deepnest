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
import type { ConfigObject, UIConfig } from "../types/index.ts";

/* ------------------------------------------------------------------ */
/*  Electron / Node require — available because nodeIntegration: true  */
/* ------------------------------------------------------------------ */
declare function require(module: string): any;

type NodeRequireFn = (module: string) => any;

const BROWSER_DEFAULT_CONFIG: UIConfig = {
  units: "inch",
  scale: 72,
  spacing: 0,
  curveTolerance: 0.72,
  clipperScale: 10000000,
  rotations: 4,
  threads: 4,
  populationSize: 10,
  mutationRate: 10,
  placementType: "box",
  mergeLines: true,
  timeRatio: 0.5,
  simplify: false,
  dxfImportScale: 1,
  dxfExportScale: 1,
  endpointTolerance: 0.36,
  conversionServer: "https://converter.deepnest.app/convert",
  useSvgPreProcessor: false,
  useQuantityFromFileName: false,
  exportWithSheetBoundboarders: false,
  exportWithSheetsSpace: false,
  exportWithSheetsSpaceValue: 0.3937007874015748,
};

function getRuntimeRequire(): NodeRequireFn | null {
  const win = window as any;
  if (typeof win.require === "function") {
    return win.require.bind(win);
  }

  const req = (globalThis as any).require;
  if (typeof req === "function") {
    return req;
  }

  return null;
}

function createInMemoryConfigService(
  initialConfig: UIConfig
): ConfigObject & { initialize: () => Promise<void> } {
  let current = { ...initialConfig };

  const service: any = {
    ...current,
    async initialize() {},
    getSync(key?: keyof UIConfig) {
      if (!key) {
        return { ...current };
      }
      return current[key];
    },
    setSync(keyOrObject: keyof UIConfig | Partial<UIConfig>, value?: unknown) {
      if (typeof keyOrObject === "string") {
        current = {
          ...current,
          [keyOrObject]: value,
        } as UIConfig;
      } else {
        current = { ...current, ...keyOrObject };
      }
      Object.assign(service, current);
    },
    resetToDefaultsSync() {
      current = { ...initialConfig };
      Object.assign(service, current);
    },
  };

  return service;
}

async function bootBrowserFallback(win: any): Promise<void> {
  const cfgService = createInMemoryConfigService(BROWSER_DEFAULT_CONFIG);
  await cfgService.initialize();
  configServiceRef.value = cfgService;
  config.value = cfgService.getSync();
  (window as any).config = cfgService;

  const deepNestStub: any = {
    imports: [],
    parts: [],
    nests: [],
    working: false,
    importsvg: () => [],
    config: (next?: Partial<UIConfig>) => {
      if (next) {
        cfgService.setSync(next);
      }
      return cfgService.getSync();
    },
    start: () => {},
    stop: () => {},
    reset() {
      this.imports = [];
      this.parts = [];
      this.nests = [];
      this.working = false;
    },
  };

  deepNestRef.value = deepNestStub;
  svgParserRef.value = null;
  win.DeepNest = deepNestStub;

  const onlyElectron = (action: string) => {
    showMessage(`${action} is available in the Electron app only.`, true);
  };

  win._importService = {
    showImportDialog: async () => onlyElectron("Import"),
  };
  win._exportService = {
    exportToSvg: () => onlyElectron("SVG export"),
    exportToDxf: async () => onlyElectron("DXF export"),
    exportToJson: () => onlyElectron("JSON export"),
  };
  win._nestingService = {
    startNesting: () => {
      onlyElectron("Nesting");
      return false;
    },
    stopNesting: () => false,
    goBack: () => {},
  };

  win._ensureUiServices = async () => ({
    importService: win._importService,
    exportService: win._exportService,
    nestingService: win._nestingService,
  });

  parts.value = [];
  imports.value = [];
  nests.value = [];
  touchParts();
  touchImports();
  touchNests();
  setAppPhase("idle");
  console.info("[Preact UI] Booted in browser-safe fallback mode");
}

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

  const runtimeRequire = getRuntimeRequire();
  if (!runtimeRequire) {
    await bootBrowserFallback(win);
    return;
  }

  // ── 1. Require Electron / Node modules ────────────────
  const { ipcRenderer } = runtimeRequire("electron");
  const electronRemote = runtimeRequire("@electron/remote");
  const fs = runtimeRequire("graceful-fs");
  const path = runtimeRequire("path");
  const os = runtimeRequire("os");
  const childProcess = runtimeRequire("child_process");
  const FormData = runtimeRequire("form-data");
  const axios = runtimeRequire("axios");

  let svgPreProcessor: any = null;
  try {
    svgPreProcessor = runtimeRequire("@deepnest/svg-preprocessor");
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

  let uiServicesPromise:
    | Promise<{
        importService: any;
        exportService: any;
        nestingService: any;
      }>
    | null = null;

  const createUiServices = async () => {
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

    return {
      importService,
      exportService,
      nestingService,
    };
  };

  win._ensureUiServices = async () => {
    if (win._importService && win._exportService && win._nestingService) {
      return {
        importService: win._importService,
        exportService: win._exportService,
        nestingService: win._nestingService,
      };
    }

    if (!uiServicesPromise) {
      uiServicesPromise = createUiServices().catch((error: unknown) => {
        uiServicesPromise = null;
        throw error;
      });
    }

    return uiServicesPromise;
  };

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
