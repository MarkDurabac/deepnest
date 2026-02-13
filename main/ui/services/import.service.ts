/**
 * Import Service
 * Handles SVG/DXF/DWG/ASM/PSM file import with conversion APIs
 * Manages file selection, reading, and conversion workflow
 */

import type {
  UIConfig,
  Part,
  DeepNestInstance,
  RactiveInstance,
  PartsViewData,
} from "../types/index.js";
import { DEFAULT_CONVERSION_SERVER } from "../types/index.js";
import { message } from "../utils/ui-helpers.js";

/**
 * File filter options for the open dialog
 */
interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Open dialog options
 */
interface OpenDialogOptions {
  filters: FileFilter[];
  properties: ("openFile" | "multiSelections")[];
}

/**
 * Open dialog result
 */
interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

/**
 * Dialog interface for Electron's dialog module
 */
interface ElectronDialog {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>;
}

/**
 * Remote interface for Electron's remote module
 */
interface ElectronRemote {
  getGlobal(name: string): string | undefined;
}

/**
 * File system interface for Node.js fs module
 */
interface FileSystem {
  readFileSync(path: string): Buffer;
  readFile(
    path: string,
    encoding: string,
    callback: (err: Error | null, data: string) => void
  ): void;
  readdirSync(path: string): string[];
  existsSync(path: string): boolean;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

/**
 * Path module interface
 */
interface PathModule {
  extname(path: string): string;
  basename(path: string): string;
  dirname(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
}

/**
 * Child process execution error
 */
interface ExecFileError extends Error {
  code?: number | string;
}

/**
 * Child process module interface
 */
interface ChildProcessModule {
  execFile(
    file: string,
    args: string[],
    options: { windowsHide: boolean; maxBuffer: number },
    callback: (
      error: ExecFileError | null,
      stdout: string,
      stderr: string
    ) => void
  ): void;
}

/**
 * OS module interface
 */
interface OsModule {
  tmpdir(): string;
}

/**
 * DuraCLI manifest output
 */
interface DuraCliManifest {
  parts?: Array<{
    svgPath?: string;
  }>;
  failedParts?: Array<{
    partNumber?: string;
    sourceFile?: string;
    error?: string;
  }>;
  warnings?: string[];
  errors?: string[];
}

/**
 * Axios-like HTTP client interface
 */
interface HttpClient {
  post(
    url: string,
    data: Buffer,
    options: { headers: Record<string, string>; responseType: string }
  ): Promise<{ data: string }>;
}

/**
 * FormData-like interface for file upload
 */
interface FormDataLike {
  append(
    name: string,
    value: Buffer | string,
    options?: { filename?: string; contentType?: string }
  ): void;
  getBuffer(): Buffer;
  getHeaders(): Record<string, string>;
}

/**
 * FormData constructor interface
 */
interface FormDataConstructor {
  new (): FormDataLike;
}

/**
 * SVG Pre-processor result
 */
interface SvgPreProcessorResult {
  success: boolean;
  result: string;
}

/**
 * SVG Pre-processor interface
 */
interface SvgPreProcessor {
  loadSvgString(svgString: string, scale: number): SvgPreProcessorResult;
}

/**
 * Config getter interface
 */
interface ConfigGetter {
  getSync<K extends keyof UIConfig>(key?: K): K extends keyof UIConfig ? UIConfig[K] : UIConfig;
}

/**
 * Supported file extensions for import
 */
const SUPPORTED_EXTENSIONS = {
  SVG: [".svg"],
  NEEDS_DURA_CLI: [".asm", ".psm"],
  NEEDS_CONVERSION: [".ps", ".eps", ".dxf", ".dwg"],
} as const;

/**
 * File filters for the open dialog
 */
const FILE_FILTERS: FileFilter[] = [
  {
    name: "CAD formats",
    extensions: ["svg", "ps", "eps", "dxf", "dwg", "asm", "psm"],
  },
  { name: "Solid Edge (via duraCLI)", extensions: ["asm", "psm"] },
  { name: "SVG/EPS/PS", extensions: ["svg", "eps", "ps"] },
  { name: "DXF/DWG", extensions: ["dxf", "dwg"] },
];

const DURA_CLI_DEFAULT_PATH = "duracli.exe";
const DURA_CLI_OUTPUT_PREFIX = "deepnest-duracli-";
const DURA_CLI_COMMAND = "setodeepnest";
const DURA_CLI_MANIFEST_ENV_PREFIX = "DEEPNEST_MANIFEST=";
const DURA_CLI_DEBUG_ENV = "DEEPNEST_DURACLI_DEBUG";
const DURA_CLI_RUN_LOG = "duracli-run.log";
const DURA_CLI_LAST_RUN_LOG = "duracli-last-run.log";

/**
 * Import Service class
 * Handles file import operations with support for SVG and conversion of other formats
 * Follows the pattern from main/deepnest.js ES6 class structure
 */
export class ImportService {
  /** Electron dialog for file selection */
  private dialog: ElectronDialog | null = null;

  /** Electron remote for accessing global variables */
  private remote: ElectronRemote | null = null;

  /** Node.js file system module */
  private fs: FileSystem | null = null;

  /** Node.js path module */
  private path: PathModule | null = null;

  /** HTTP client for conversion requests */
  private httpClient: HttpClient | null = null;

  /** FormData constructor for file upload */
  private FormData: FormDataConstructor | null = null;

  /** Child process module for duraCLI execution */
  private childProcess: ChildProcessModule | null = null;

  /** OS module for temp directory handling */
  private os: OsModule | null = null;

  /** SVG pre-processor for cleaning input */
  private svgPreProcessor: SvgPreProcessor | null = null;

  /** Configuration getter */
  private config: ConfigGetter | null = null;

  /** DeepNest instance for importing parts */
  private deepNest: DeepNestInstance | null = null;

  /** Ractive instance for updating UI */
  private ractive: RactiveInstance<PartsViewData> | null = null;

  /** Callback for attaching sort behavior after import */
  private attachSortCallback: (() => void) | null = null;

  /** Callback for applying zoom after import */
  private applyZoomCallback: (() => void) | null = null;

  /** Callback for resizing parts view after import */
  private resizeCallback: (() => void) | null = null;

  /** Flag to track if import button is busy */
  private isImporting = false;

  /**
   * Log import progress for debugging complex .asm/.psm conversion flows
   * @param step - Step name
   * @param details - Optional structured details
   */
  private logProgress(step: string, details?: Record<string, unknown>): void {
    const stamp = new Date().toISOString();
    if (details) {
      console.info(`[ImportService][${stamp}] ${step}`, details);
      return;
    }
    console.info(`[ImportService][${stamp}] ${step}`);
  }

  /**
   * Create a new ImportService instance
   * Dependencies are injected for testability
   */
  constructor(options?: {
    dialog?: ElectronDialog;
    remote?: ElectronRemote;
    fs?: FileSystem;
    path?: PathModule;
    httpClient?: HttpClient;
    FormData?: FormDataConstructor;
    childProcess?: ChildProcessModule;
    os?: OsModule;
    svgPreProcessor?: SvgPreProcessor;
    config?: ConfigGetter;
    deepNest?: DeepNestInstance;
    ractive?: RactiveInstance<PartsViewData>;
    attachSortCallback?: () => void;
    applyZoomCallback?: () => void;
    resizeCallback?: () => void;
  }) {
    if (options) {
      this.dialog = options.dialog || null;
      this.remote = options.remote || null;
      this.fs = options.fs || null;
      this.path = options.path || null;
      this.httpClient = options.httpClient || null;
      this.FormData = options.FormData || null;
      this.childProcess = options.childProcess || null;
      this.os = options.os || null;
      this.svgPreProcessor = options.svgPreProcessor || null;
      this.config = options.config || null;
      this.deepNest = options.deepNest || null;
      this.ractive = options.ractive || null;
      this.attachSortCallback = options.attachSortCallback || null;
      this.applyZoomCallback = options.applyZoomCallback || null;
      this.resizeCallback = options.resizeCallback || null;
    }
  }

  /**
   * Set the dialog module for file selection
   * @param dialog - Electron dialog module
   */
  setDialog(dialog: ElectronDialog): void {
    this.dialog = dialog;
  }

  /**
   * Set the remote module for accessing globals
   * @param remote - Electron remote module
   */
  setRemote(remote: ElectronRemote): void {
    this.remote = remote;
  }

  /**
   * Set the file system module
   * @param fs - Node.js fs module
   */
  setFileSystem(fs: FileSystem): void {
    this.fs = fs;
  }

  /**
   * Set the path module
   * @param path - Node.js path module
   */
  setPath(path: PathModule): void {
    this.path = path;
  }

  /**
   * Set the HTTP client for conversion requests
   * @param httpClient - HTTP client (e.g., axios)
   */
  setHttpClient(httpClient: HttpClient): void {
    this.httpClient = httpClient;
  }

  /**
   * Set the FormData constructor
   * @param FormData - FormData constructor
   */
  setFormDataConstructor(FormData: FormDataConstructor): void {
    this.FormData = FormData;
  }

  /**
   * Set the child process module
   * @param childProcess - Node.js child_process module
   */
  setChildProcess(childProcess: ChildProcessModule): void {
    this.childProcess = childProcess;
  }

  /**
   * Set the OS module
   * @param os - Node.js os module
   */
  setOsModule(os: OsModule): void {
    this.os = os;
  }

  /**
   * Set the SVG pre-processor
   * @param svgPreProcessor - SVG pre-processor instance
   */
  setSvgPreProcessor(svgPreProcessor: SvgPreProcessor): void {
    this.svgPreProcessor = svgPreProcessor;
  }

  /**
   * Set the configuration getter
   * @param config - Configuration object with getSync method
   */
  setConfig(config: ConfigGetter): void {
    this.config = config;
  }

  /**
   * Set the DeepNest instance
   * @param deepNest - DeepNest instance for importing parts
   */
  setDeepNest(deepNest: DeepNestInstance): void {
    this.deepNest = deepNest;
  }

  /**
   * Set the Ractive instance for UI updates
   * @param ractive - Ractive instance
   */
  setRactive(ractive: RactiveInstance<PartsViewData>): void {
    this.ractive = ractive;
  }

  /**
   * Set callbacks for post-import actions
   * @param callbacks - Object containing callback functions
   */
  setCallbacks(callbacks: {
    attachSort?: () => void;
    applyZoom?: () => void;
    resize?: () => void;
  }): void {
    if (callbacks.attachSort) {
      this.attachSortCallback = callbacks.attachSort;
    }
    if (callbacks.applyZoom) {
      this.applyZoomCallback = callbacks.applyZoom;
    }
    if (callbacks.resize) {
      this.resizeCallback = callbacks.resize;
    }
  }

  /**
   * Get the conversion server URL from config or use default
   * @returns Conversion server URL
   */
  private getConversionServerUrl(): string {
    if (!this.config) {
      return DEFAULT_CONVERSION_SERVER;
    }

    const configUrl = this.config.getSync("conversionServer");
    return configUrl || DEFAULT_CONVERSION_SERVER;
  }

  /**
   * Check if a file extension requires conversion
   * @param extension - File extension (with leading dot)
   * @returns True if the file needs conversion
   */
  private needsConversion(extension: string): boolean {
    const lowerExt = extension.toLowerCase();
    return SUPPORTED_EXTENSIONS.NEEDS_CONVERSION.some(
      (ext) => ext === lowerExt
    );
  }

  /**
   * Check if a file extension requires duraCLI conversion
   * @param extension - File extension (with leading dot)
   * @returns True if the file needs duraCLI conversion
   */
  private needsDuraCliConversion(extension: string): boolean {
    const lowerExt = extension.toLowerCase();
    return SUPPORTED_EXTENSIONS.NEEDS_DURA_CLI.some((ext) => ext === lowerExt);
  }

  /**
   * Check if a file extension is a DXF file
   * @param extension - File extension (with leading dot)
   * @returns True if the file is a DXF
   */
  private isDxf(extension: string): boolean {
    return extension.toLowerCase() === ".dxf";
  }

  /**
   * Resolve duraCLI executable path.
   * Priority:
   * 1. DURA_CLI_PATH env var
   * 2. main/vendor/duracli/duracli.exe
   * 3. ./duracli.exe
   * 4. PATH lookup with "duracli.exe"
   * @returns Executable path or name
   */
  private resolveDuraCliPath(): string {
    if (!this.fs || !this.path) {
      return DURA_CLI_DEFAULT_PATH;
    }

    const envPath = process.env.DURA_CLI_PATH?.trim();
    if (envPath) {
      const envCandidates = this.path.isAbsolute(envPath)
        ? [envPath]
        : [this.path.join(process.cwd(), envPath), envPath];

      for (const candidate of envCandidates) {
        if (this.fs.existsSync(candidate)) {
          return candidate;
        }
      }

      // Return the configured path even when missing, so exec errors remain explicit.
      return envPath;
    }

    const bundledPath = this.path.join(
      process.cwd(),
      "main",
      "vendor",
      "duracli",
      DURA_CLI_DEFAULT_PATH
    );
    if (this.fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    const rootPath = this.path.join(process.cwd(), DURA_CLI_DEFAULT_PATH);
    if (this.fs.existsSync(rootPath)) {
      return rootPath;
    }

    return DURA_CLI_DEFAULT_PATH;
  }

  /**
   * Execute duraCLI and return process output for both success and business-level failures.
   * Reject only when execution itself fails (missing executable, spawn error, etc.).
   * @param executable - duraCLI executable path
   * @param args - duraCLI arguments
   * @returns stdout, stderr and exit code
   */
  private async runDuraCli(
    executable: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.childProcess) {
      throw new Error("Child process module not available");
    }

    return new Promise((resolve, reject) => {
      this.childProcess!.execFile(
        executable,
        args,
        { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const code = typeof error?.code === "number" ? error.code : 0;
          // Non-zero numeric exit codes are business results from duraCLI (e.g. 3 partial, 4 failed).
          // Reject only for execution-level errors (ENOENT, EACCES, spawn issues, ...).
          if (error && typeof error?.code !== "number") {
            reject(
              new Error(
                stderr.trim() || stdout.trim() || error.message || "Unknown duraCLI error"
              )
            );
            return;
          }
          resolve({ stdout, stderr, exitCode: code });
        }
      );
    });
  }

  /**
   * Extract manifest path from duraCLI stdout.
   * @param stdout - duraCLI stdout
   * @returns Manifest file path if found
   */
  private extractManifestPathFromOutput(stdout: string): string | null {
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith(DURA_CLI_MANIFEST_ENV_PREFIX)) {
        const manifestPath = line
          .slice(DURA_CLI_MANIFEST_ENV_PREFIX.length)
          .trim();
        if (manifestPath.length > 0) {
          return manifestPath;
        }
      }
    }
    return null;
  }

  /**
   * Collect generated SVG files from duraCLI output.
   * @param outputDirectory - Temp output directory used for run
   * @param stdout - duraCLI stdout
   * @returns Sorted list of SVG paths
   */
  private collectDuraCliSvgPaths(
    outputDirectory: string,
    stdout: string
  ): string[] {
    if (!this.fs || !this.path) {
      return [];
    }

    const candidates = new Set<string>();
    const stdoutManifestPath = this.extractManifestPathFromOutput(stdout);
    const defaultManifestPath = this.path.join(outputDirectory, "deepnest_manifest.json");
    const legacyManifestPath = this.path.join(outputDirectory, "deepnest-manifest.json");

    const manifestPaths = [stdoutManifestPath, defaultManifestPath, legacyManifestPath]
      .filter((value): value is string => !!value);

    for (const manifestPath of manifestPaths) {
      if (!this.fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifestRaw = this.fs.readFileSync(manifestPath).toString();
        const manifest = JSON.parse(manifestRaw) as DuraCliManifest;

        if (!manifest.parts) {
          continue;
        }

        for (const part of manifest.parts) {
          if (!part.svgPath) {
            continue;
          }
          const svgPath = this.path.isAbsolute(part.svgPath)
            ? part.svgPath
            : this.path.join(this.path.dirname(manifestPath), part.svgPath);
          if (this.fs.existsSync(svgPath)) {
            candidates.add(svgPath);
          }
        }
      } catch {
        // Ignore malformed manifests and fall back to directory scan
      }
    }

    if (candidates.size > 0) {
      return Array.from(candidates)
        .filter((svgPath) => this.svgHasShapeElements(svgPath))
        .sort();
    }

    try {
      const files = this.fs.readdirSync(outputDirectory);
      return files
        .filter((file) => this.path!.extname(file).toLowerCase() === ".svg")
        .map((file) => this.path!.join(outputDirectory, file))
        .filter((svgPath) => this.svgHasShapeElements(svgPath))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Collect DXF files generated by duraCLI.
   * @param outputDirectory - Temp output directory used for run
   * @returns Sorted list of DXF paths
   */
  private collectDuraCliDxfPaths(outputDirectory: string): string[] {
    if (!this.fs || !this.path) {
      return [];
    }

    try {
      const files = this.fs.readdirSync(outputDirectory);
      return files
        .filter((file) => this.path!.extname(file).toLowerCase() === ".dxf")
        .filter((file) => !file.toLowerCase().endsWith("_fail.dxf"))
        .map((file) => this.path!.join(outputDirectory, file))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Return current imported parts count.
   * @returns Number of parts currently known by DeepNest
   */
  private getImportedPartCount(): number {
    return this.deepNest?.parts?.length ?? 0;
  }

  /**
   * Import all SVG paths and return how many files produced new parts.
   * @param svgPaths - Full SVG paths
   * @returns Number of SVG files that produced at least one part
   */
  private async importDuraCliSvgPaths(svgPaths: string[]): Promise<number> {
    this.logProgress("duraCLI SVG import batch start", { total: svgPaths.length });
    let importedSvgFiles = 0;

    for (let i = 0; i < svgPaths.length; i++) {
      const svgPath = svgPaths[i];
      this.logProgress("duraCLI SVG import file start", {
        index: i + 1,
        total: svgPaths.length,
        svgPath,
      });
      const before = this.getImportedPartCount();
      await this.readSvgFile(svgPath);
      const after = this.getImportedPartCount();
      if (after > before) {
        importedSvgFiles++;
      }
      this.logProgress("duraCLI SVG import file done", {
        index: i + 1,
        total: svgPaths.length,
        importedPartsDelta: after - before,
        importedSvgFilesSoFar: importedSvgFiles,
      });
    }

    this.logProgress("duraCLI SVG import batch done", {
      importedSvgFiles,
      total: svgPaths.length,
    });
    return importedSvgFiles;
  }

  /**
   * Fallback path: convert duraCLI DXF outputs using DeepNest converter.
   * @param dxfPaths - Full DXF paths
   * @returns Number of DXF files that produced at least one part
   */
  private async importDuraCliDxfFallback(dxfPaths: string[]): Promise<number> {
    if (!this.path) {
      return 0;
    }

    let importedDxfFiles = 0;
    for (const dxfPath of dxfPaths) {
      const filename = this.path.basename(dxfPath);
      const before = this.getImportedPartCount();
      await this.convertAndImport(dxfPath, filename, ".dxf");
      const after = this.getImportedPartCount();
      if (after > before) {
        importedDxfFiles++;
      }
    }

    return importedDxfFiles;
  }

  /**
   * Basic SVG geometry check used to ignore empty converter outputs.
   * @param svgPath - Full path to SVG file
   * @returns True if known shape elements are present
   */
  private svgHasShapeElements(svgPath: string): boolean {
    if (!this.fs) {
      return false;
    }

    try {
      const svgRaw = this.fs.readFileSync(svgPath).toString();
      return /<(path|polygon|polyline|rect|circle|ellipse|line)\b/i.test(svgRaw);
    } catch {
      return false;
    }
  }

  /**
   * Check whether a DXF has an empty ENTITIES section.
   * @param dxfPath - Full path to DXF file
   * @returns True when ENTITIES is immediately followed by ENDSEC
   */
  private dxfHasEmptyEntities(dxfPath: string): boolean {
    if (!this.fs) {
      return false;
    }

    try {
      const dxfRaw = this.fs.readFileSync(dxfPath).toString();
      return /ENTITIES\s*\r?\n\s*0\s*\r?\nENDSEC/i.test(dxfRaw);
    } catch {
      return false;
    }
  }

  /**
   * Build diagnostics from duraCLI output folder contents.
   * @param outputDirectory - Temp output directory used for conversion
   * @param manifestPath - Requested manifest path
   * @returns Human-readable diagnostics
   */
  private collectDuraCliDiagnostics(
    outputDirectory: string,
    manifestPath: string
  ): string[] {
    if (!this.fs || !this.path) {
      return [];
    }

    const diagnostics: string[] = [];
    const legacyManifestPath = this.path.join(outputDirectory, "deepnest-manifest.json");
    if (!this.fs.existsSync(manifestPath) && !this.fs.existsSync(legacyManifestPath)) {
      diagnostics.push("Manifest file was not generated by duraCLI.");
    }

    try {
      const files = this.fs.readdirSync(outputDirectory);
      const dxfPaths = files
        .filter((file) => this.path!.extname(file).toLowerCase() === ".dxf")
        .map((file) => this.path!.join(outputDirectory, file));
      const svgPaths = files
        .filter((file) => this.path!.extname(file).toLowerCase() === ".svg")
        .map((file) => this.path!.join(outputDirectory, file));

      if (dxfPaths.length > 0) {
        const emptyEntityCount = dxfPaths.filter((file) => this.dxfHasEmptyEntities(file)).length;
        if (emptyEntityCount === dxfPaths.length) {
          diagnostics.push(`All ${dxfPaths.length} DXF files have an empty ENTITIES section.`);
        }
      }

      if (svgPaths.length > 0) {
        const svgWithShapesCount = svgPaths.filter((file) => this.svgHasShapeElements(file)).length;
        if (svgWithShapesCount === 0) {
          diagnostics.push(`All ${svgPaths.length} SVG files are empty (no path/polyline geometry).`);
        }
      }
    } catch {
      // Ignore diagnostics gathering failures
    }

    return diagnostics;
  }

  /**
   * Write a durable log file for duraCLI runs.
   * @param outputDirectory - Temporary or debug output folder
   * @param executable - duraCLI executable used
   * @param args - duraCLI arguments
   * @param stdout - stdout content
   * @param stderr - stderr content
   * @param manifest - Parsed manifest, if available
   */
  private writeDuraCliRunLog(
    outputDirectory: string,
    executable: string,
    args: string[],
    stdout: string,
    stderr: string,
    manifest: DuraCliManifest | null
  ): void {
    if (!this.fs || !this.path) {
      return;
    }

    const commandPreview = [executable, ...args.map((a) => `"${a}"`)].join(" ");
    const manifestSummary = manifest
      ? JSON.stringify(
        {
          parts: manifest.parts?.length ?? 0,
          failedParts: manifest.failedParts?.length ?? 0,
          warnings: manifest.warnings?.length ?? 0,
          errors: manifest.errors?.length ?? 0,
        },
        null,
        2
      )
      : "null";

    const content = [
      `command=${commandPreview}`,
      "",
      `manifestSummary=${manifestSummary}`,
      "",
      "stdout:",
      stdout || "<empty>",
      "",
      "stderr:",
      stderr || "<empty>",
    ].join("\n");

    const logPath = this.path.join(outputDirectory, DURA_CLI_RUN_LOG);
    this.fs.writeFileSync(logPath, content);

    // Keep a stable "last run" log in the bundled duraCLI folder for quick troubleshooting.
    try {
      const stableLogPath = this.path.join(
        process.cwd(),
        "main",
        "vendor",
        "duracli",
        DURA_CLI_LAST_RUN_LOG
      );
      this.fs.writeFileSync(stableLogPath, content);
    } catch {
      // Ignore when bundled path is unavailable; temp-folder log is still written.
    }
  }

  /**
   * Read and parse duraCLI manifest if available.
   * @param manifestPath - Full path to manifest JSON file
   * @returns Parsed manifest or null
   */
  private readDuraCliManifest(manifestPath: string): DuraCliManifest | null {
    if (!this.fs) {
      return null;
    }

    if (!this.fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifestRaw = this.fs.readFileSync(manifestPath).toString();
      return JSON.parse(manifestRaw) as DuraCliManifest;
    } catch {
      return null;
    }
  }

  /**
   * Convert Solid Edge files to SVG using duraCLI and import all generated SVG files.
   * @param filePath - Full path to the selected assembly/part
   * @param ext - File extension
   */
  private async convertWithDuraCli(filePath: string): Promise<void> {
    if (!this.fs || !this.path || !this.childProcess || !this.os) {
      message("Required modules not available for Solid Edge conversion", true);
      return;
    }

    const duracliPath = this.resolveDuraCliPath();
    const outputDirectory = this.fs.mkdtempSync(
      this.path.join(this.os.tmpdir(), DURA_CLI_OUTPUT_PREFIX)
    );
    const manifestPath = this.path.join(outputDirectory, "deepnest_manifest.json");
    const units = this.config?.getSync("units") === "inch" ? "inch" : "mm";
    const args = [
      DURA_CLI_COMMAND,
      filePath,
      "--out",
      outputDirectory,
      "--manifest",
      manifestPath,
      "--units",
      units,
    ];
    this.logProgress("duraCLI conversion start", {
      filePath,
      duracliPath,
      outputDirectory,
      units,
    });
    let keepOutput = process.env[DURA_CLI_DEBUG_ENV] === "1";

    try {
      const runResult = await this.runDuraCli(duracliPath, args);
      this.logProgress("duraCLI process completed", {
        exitCode: runResult.exitCode,
        stdoutLength: runResult.stdout.length,
        stderrLength: runResult.stderr.length,
      });
      const manifest = this.readDuraCliManifest(manifestPath);
      this.writeDuraCliRunLog(
        outputDirectory,
        duracliPath,
        args,
        runResult.stdout,
        runResult.stderr,
        manifest
      );
      const svgPaths = this.collectDuraCliSvgPaths(outputDirectory, runResult.stdout);
      const dxfPaths = this.collectDuraCliDxfPaths(outputDirectory);
      const failedPartsCount = manifest?.failedParts?.length ?? 0;
      const warningCount = manifest?.warnings?.length ?? 0;
      const errorCount = manifest?.errors?.length ?? 0;
      let importedSvgFiles = 0;
      let importedDxfFiles = 0;

      if (svgPaths.length > 0) {
        importedSvgFiles = await this.importDuraCliSvgPaths(svgPaths);
      }

      // Optional fallback requested for "DXF-only" duraCLI pipelines.
      if (importedSvgFiles === 0 && dxfPaths.length > 0) {
        importedDxfFiles = await this.importDuraCliDxfFallback(dxfPaths);
      }

      this.logProgress("duraCLI conversion import summary", {
        svgCandidates: svgPaths.length,
        dxfCandidates: dxfPaths.length,
        importedSvgFiles,
        importedDxfFiles,
        failedPartsCount,
        warningCount,
        errorCount,
      });

      const importedFiles = importedSvgFiles + importedDxfFiles;
      if (importedFiles === 0) {
        let issueDetail = "";
        const firstIssue = manifest?.errors?.[0]
          || manifest?.warnings?.[0]
          || manifest?.failedParts?.[0]?.error;
        if (firstIssue) {
          issueDetail = `<br>duraCLI: ${firstIssue}`;
        }
        const diagnostics = this.collectDuraCliDiagnostics(outputDirectory, manifestPath);
        if (diagnostics.length > 0) {
          issueDetail += `<br>${diagnostics.join("<br>")}`;
        }
        issueDetail += `<br>Exit code: ${runResult.exitCode}; imported SVG: ${importedSvgFiles}; imported DXF fallback: ${importedDxfFiles}; failed parts: ${failedPartsCount}; warnings: ${warningCount}; errors: ${errorCount}`;
        keepOutput = true;
        message(
          `duraCLI completed without usable SVG output.${issueDetail}<br>Debug folder: ${outputDirectory}`,
          true
        );
        this.logProgress("duraCLI conversion ended without importable geometry", {
          outputDirectory,
          exitCode: runResult.exitCode,
        });
        return;
      }

      const hasPartialIssues =
        failedPartsCount > 0 ||
        warningCount > 0 ||
        errorCount > 0 ||
        runResult.exitCode !== 0;

      if (hasPartialIssues) {
        keepOutput = true;
        message(
          `duraCLI partial conversion: imported ${importedFiles} file(s) (SVG ${importedSvgFiles}, DXF fallback ${importedDxfFiles}), failed ${failedPartsCount}, warnings ${warningCount}, errors ${errorCount}.<br>Debug folder: ${outputDirectory}`,
          true
        );
      }
      this.logProgress("duraCLI conversion done", {
        importedFiles,
        keepOutput,
        outputDirectory,
      });
    } catch (err) {
      const error = err as Error;
      keepOutput = true;
      const bundledPath = this.path.join(
        process.cwd(),
        "main",
        "vendor",
        "duracli",
        DURA_CLI_DEFAULT_PATH
      );
      message(
        `Could not execute duraCLI conversion: ${error.message}<br>Resolved executable: ${duracliPath}<br>Expected command: ${DURA_CLI_DEFAULT_PATH} ${DURA_CLI_COMMAND} &lt;asmOrPsmPath&gt; --out ... --manifest ... --units mm|inch<br>Set DURA_CLI_PATH or place duraCLI in: ${bundledPath}<br>Debug folder: ${outputDirectory}`,
        true
      );
      this.logProgress("duraCLI conversion failed to execute", {
        message: error.message,
        duracliPath,
        outputDirectory,
      });
    } finally {
      if (!keepOutput) {
        this.fs.rmSync(outputDirectory, { recursive: true, force: true });
        this.logProgress("duraCLI debug folder removed", { outputDirectory });
      } else {
        this.logProgress("duraCLI debug folder kept", { outputDirectory });
      }
    }
  }

  /**
   * Load files from the nest directory on startup
   * @returns Promise that resolves when all files are loaded
   */
  async loadNestDirectoryFiles(): Promise<void> {
    if (!this.remote || !this.fs) {
      return;
    }

    const nestDirectory = this.remote.getGlobal("NEST_DIRECTORY");
    if (!nestDirectory) {
      return;
    }

    try {
      const files = this.fs.readdirSync(nestDirectory);
      const svgFiles = files
        .filter((file) => file.includes(".svg"))
        .sort();

      for (const file of svgFiles) {
        await this.processFile(nestDirectory + file);
      }
    } catch {
      // Directory may not exist, silently continue
    }
  }

  /**
   * Show the file open dialog and import selected files
   * @returns Promise that resolves when import is complete
   */
  async showImportDialog(): Promise<void> {
    if (!this.dialog) {
      message("Dialog module not available", true);
      return;
    }

    if (this.isImporting) {
      this.logProgress("showImportDialog skipped (already importing)");
      return;
    }

    this.isImporting = true;
    this.logProgress("showImportDialog opened");

    try {
      const result = await this.dialog.showOpenDialog({
        filters: FILE_FILTERS,
        properties: ["openFile", "multiSelections"],
      });

      if (result.canceled) {
        this.logProgress("showImportDialog canceled by user");
        return;
      }

      this.logProgress("showImportDialog selection", {
        count: result.filePaths.length,
        files: result.filePaths,
      });

      for (const filePath of result.filePaths) {
        await this.processFile(filePath);
      }
      this.logProgress("showImportDialog completed");
    } finally {
      this.isImporting = false;
      this.logProgress("showImportDialog import flag reset");
    }
  }

  /**
   * Process a file for import
   * Routes to appropriate handler based on file extension
   * @param filePath - Full path to the file
   */
  async processFile(filePath: string): Promise<void> {
    if (!this.path) {
      message("Path module not available", true);
      return;
    }

    const ext = this.path.extname(filePath);
    const filename = this.path.basename(filePath);
    this.logProgress("processFile start", { filePath, filename, ext });

    if (ext.toLowerCase() === ".svg") {
      await this.readSvgFile(filePath);
    } else if (this.needsDuraCliConversion(ext)) {
      await this.convertWithDuraCli(filePath);
    } else if (this.needsConversion(ext)) {
      await this.convertAndImport(filePath, filename, ext);
    } else {
      this.logProgress("processFile ignored unsupported extension", { filePath, ext });
    }

    this.logProgress("processFile done", { filePath, ext });
  }

  /**
   * Read and import an SVG file directly
   * @param filePath - Full path to the SVG file
   */
  private async readSvgFile(filePath: string): Promise<void> {
    if (!this.fs || !this.path) {
      message("File system modules not available", true);
      return;
    }

    this.logProgress("readSvgFile start", { filePath });
    return new Promise<void>((resolve) => {
      this.fs!.readFile(filePath, "utf-8", (err, data) => {
        try {
          if (err) {
            message("An error occurred reading the file: " + err.message, true);
            this.logProgress("readSvgFile read error", {
              filePath,
              message: err.message,
            });
            return;
          }

          const filename = this.path!.basename(filePath);
          const dirpath = this.path!.dirname(filePath);
          this.logProgress("readSvgFile read success", {
            filePath,
            filename,
            size: data.length,
          });

          this.processSvgData(data, filename, dirpath);
        } catch (e) {
          const error = e as Error;
          message(`An error occurred while importing ${filePath}: ${error.message}`, true);
          this.logProgress("readSvgFile processing error", {
            filePath,
            message: error.message,
          });
        } finally {
          this.logProgress("readSvgFile done", { filePath });
          resolve();
        }
      });
    });
  }

  /**
   * Convert a non-SVG file to SVG using the conversion server
   * @param filePath - Full path to the file
   * @param filename - Base filename
   * @param ext - File extension
   */
  private async convertAndImport(
    filePath: string,
    filename: string,
    ext: string
  ): Promise<void> {
    if (!this.fs || !this.httpClient || !this.FormData) {
      message("Required modules not available for conversion", true);
      return;
    }

    const url = this.getConversionServerUrl();
    this.logProgress("convertAndImport start", { filePath, filename, ext, url });

    try {
      const fileBuffer = this.fs.readFileSync(filePath);
      const formData = new this.FormData();

      formData.append("fileUpload", fileBuffer, {
        filename: filename,
        contentType: "application/dxf",
      });
      formData.append("format", "svg");

      const response = await this.httpClient.post(url, formData.getBuffer(), {
        headers: formData.getHeaders(),
        responseType: "text",
      });

      const body = response.data;
      this.logProgress("convertAndImport response received", {
        filename,
        ext,
        responseLength: body.length,
      });

      // Check for error responses
      if (body.substring(0, 5) === "error") {
        message(body, true);
        return;
      }

      if (body.includes('"error"') && body.includes('"error_id"')) {
        const jsonErr = JSON.parse(body) as { error_id: string };
        message(
          `There was an Error while converting: ${jsonErr.error_id}<br>Please use this code to open an issue on github.com/deepnest-next/deepnest`,
          true
        );
        return;
      }

      // Calculate scaling factor for DXF files
      let scalingFactor: number | null = null;
      let dxfFlag = false;

      if (this.isDxf(ext)) {
        scalingFactor = Number(this.config?.getSync("dxfImportScale")) || 1;
        dxfFlag = true;
      }

      // Process the converted SVG
      // Note: dirpath is null for converted files as they won't have embedded images
      this.processSvgData(body, filename, null, scalingFactor, dxfFlag);
      this.logProgress("convertAndImport done", { filename, ext });
    } catch (err) {
      const error = err as { response?: { data: string }; message: string };
      const errorData = error.response?.data || error.message;

      if (
        typeof errorData === "string" &&
        errorData.includes('"error"') &&
        errorData.includes('"error_id"')
      ) {
        const jsonErr = JSON.parse(errorData) as { error_id: string };
        message(
          `There was an Error while converting: ${jsonErr.error_id}<br>Please use this code to open an issue on github.com/deepnest-next/deepnest`,
          true
        );
      } else {
        message(
          `Could not contact file conversion server: ${JSON.stringify(err)}<br>Please use this code to open an issue on github.com/deepnest-next/deepnest`,
          true
        );
      }
      this.logProgress("convertAndImport failed", {
        filename,
        ext,
        error: JSON.stringify(err),
      });
    }
  }

  /**
   * Process SVG data (either from file or conversion)
   * Optionally runs through SVG pre-processor
   * @param data - SVG content as string
   * @param filename - Original filename
   * @param dirpath - Directory path for resolving relative paths (null for converted files)
   * @param scalingFactor - Optional scaling factor
   * @param dxfFlag - Whether this is a converted DXF file
   */
  private processSvgData(
    data: string,
    filename: string,
    dirpath: string | null,
    scalingFactor: number | null = null,
    dxfFlag = false
  ): void {
    this.logProgress("processSvgData start", {
      filename,
      dirpath,
      scalingFactor,
      dxfFlag,
      inputLength: data.length,
    });
    const useSvgPreProcessor = this.config?.getSync("useSvgPreProcessor");

    if (useSvgPreProcessor && this.svgPreProcessor) {
      try {
        const scale = Number(this.config?.getSync("scale")) || 72;
        const svgResult = this.svgPreProcessor.loadSvgString(data, scale);

        if (!svgResult.success) {
          message(svgResult.result, true);
          this.logProgress("processSvgData preprocessor failed", { filename });
          return;
        }

        this.importData(svgResult.result, filename, dirpath, scalingFactor, dxfFlag);
      } catch (e) {
        const error = e as Error;
        message("Error processing SVG: " + error.message, true);
        this.logProgress("processSvgData preprocessor error", {
          filename,
          message: error.message,
        });
      }
    } else {
      this.importData(data, filename, dirpath, scalingFactor, dxfFlag);
    }
  }

  /**
   * Import SVG data into DeepNest and update the UI
   * @param data - SVG content as string
   * @param filename - Original filename
   * @param dirpath - Directory path for resolving relative paths
   * @param scalingFactor - Optional scaling factor
   * @param dxfFlag - Whether this is a converted DXF file
   */
  private importData(
    data: string,
    filename: string,
    dirpath: string | null,
    scalingFactor: number | null = null,
    dxfFlag = false
  ): void {
    if (!this.deepNest) {
      message("DeepNest instance not available", true);
      return;
    }
    const beforeParts = this.deepNest.parts?.length ?? 0;

    const importedParts = this.deepNest.importsvg(
      filename,
      dirpath,
      data,
      scalingFactor,
      dxfFlag
    );

    if (!importedParts || importedParts.length === 0) {
      message(
        `No closed contours were detected in ${filename}. The file was loaded but produced no nestable parts.`,
        true
      );
    }
    const afterParts = this.deepNest.parts?.length ?? beforeParts;
    this.logProgress("importData result", {
      filename,
      importedParts: importedParts?.length ?? 0,
      partsDelta: afterParts - beforeParts,
      totalParts: afterParts,
    });

    // Deselect all previous imports
    this.deepNest.imports.forEach((im) => {
      im.selected = false;
    });

    // Select the newly imported file
    if (this.deepNest.imports.length > 0) {
      this.deepNest.imports[this.deepNest.imports.length - 1].selected = true;
    }

    // Update Ractive views
    this.updateViews();
  }

  /**
   * Update Ractive views and trigger post-import callbacks
   */
  private updateViews(): void {
    if (this.ractive) {
      this.ractive.update("imports");
      this.ractive.update("parts");
    }

    if (this.attachSortCallback) {
      this.attachSortCallback();
    }

    if (this.applyZoomCallback) {
      this.applyZoomCallback();
    }

    if (this.resizeCallback) {
      this.resizeCallback();
    }
  }

  /**
   * Import SVG data directly (for programmatic use)
   * @param svgString - SVG content as string
   * @param filename - Filename to associate with the import
   * @param options - Optional import options
   * @returns Array of parts created from the import
   */
  importSvgString(
    svgString: string,
    filename: string,
    options?: {
      dirpath?: string | null;
      scalingFactor?: number | null;
      dxfFlag?: boolean;
      usePreProcessor?: boolean;
    }
  ): Part[] | null {
    if (!this.deepNest) {
      message("DeepNest instance not available", true);
      return null;
    }

    const dirpath = options?.dirpath ?? null;
    const scalingFactor = options?.scalingFactor ?? null;
    const dxfFlag = options?.dxfFlag ?? false;
    const usePreProcessor = options?.usePreProcessor ?? false;

    let processedData = svgString;

    if (usePreProcessor && this.svgPreProcessor) {
      try {
        const scale = Number(this.config?.getSync("scale")) || 72;
        const svgResult = this.svgPreProcessor.loadSvgString(svgString, scale);

        if (!svgResult.success) {
          message(svgResult.result, true);
          return null;
        }

        processedData = svgResult.result;
      } catch (e) {
        const error = e as Error;
        message("Error processing SVG: " + error.message, true);
        return null;
      }
    }

    const parts = this.deepNest.importsvg(
      filename,
      dirpath,
      processedData,
      scalingFactor,
      dxfFlag
    );

    // Deselect all previous imports
    this.deepNest.imports.forEach((im) => {
      im.selected = false;
    });

    // Select the newly imported file
    if (this.deepNest.imports.length > 0) {
      this.deepNest.imports[this.deepNest.imports.length - 1].selected = true;
    }

    // Update views
    this.updateViews();

    return parts;
  }

  /**
   * Check if import is currently in progress
   * @returns True if importing
   */
  isImportInProgress(): boolean {
    return this.isImporting;
  }

  /**
   * Get the file filters used for the import dialog
   * @returns Array of file filters
   */
  static getFileFilters(): FileFilter[] {
    return [...FILE_FILTERS];
  }

  /**
   * Get the supported file extensions
   * @returns Object with SVG and conversion extension arrays
   */
  static getSupportedExtensions(): typeof SUPPORTED_EXTENSIONS {
    return SUPPORTED_EXTENSIONS;
  }

  /**
   * Create and return a new ImportService instance
   * @param options - Optional configuration options
   * @returns New ImportService instance
   */
  static create(options?: ConstructorParameters<typeof ImportService>[0]): ImportService {
    return new ImportService(options);
  }
}

/**
 * Factory function to create an import service
 * @param options - Optional configuration options
 * @returns New ImportService instance
 */
export function createImportService(
  options?: ConstructorParameters<typeof ImportService>[0]
): ImportService {
  return ImportService.create(options);
}
