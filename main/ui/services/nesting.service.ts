/**
 * Nesting Service
 * Handles nesting start/stop/display control for the nesting workflow
 * Manages the transition between main view and nest view, and controls
 * the nesting process lifecycle
 */

import type {
  DeepNestInstance,
  SelectableNestingResult,
  RactiveInstance,
  NestViewData,
} from "../types/index.js";
import { IPC_CHANNELS } from "../types/index.js";
import { message } from "../utils/ui-helpers.js";

/**
 * File system interface for cache operations
 */
interface FileSystem {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  lstatSync(path: string): { isDirectory(): boolean };
  unlinkSync(path: string): void;
  rmdirSync(path: string): void;
}

/**
 * IPC renderer interface for Electron communication
 */
interface IpcRenderer {
  send(channel: string, ...args: unknown[]): void;
}

/**
 * Display callback function type
 */
export type DisplayCallback = () => void;

/**
 * Progress callback function type
 */
export type ProgressCallback = ((progress: { index: number; progress: number }) => void) | null;

/**
 * Display nest function type
 * Called to render a specific nesting result in the UI
 */
export type DisplayNestFunction = (nest: SelectableNestingResult) => void;

/**
 * Save JSON function type
 * Called to save the current nesting result to JSON file
 */
export type SaveJsonFunction = () => void;

/**
 * Stop/start button states used by UI integrations
 */
export type StopButtonState = "stop" | "stop-disabled" | "start";

/**
 * UI bridge so this service can drive a modern UI without direct DOM manipulation.
 * Legacy visual controls are intentionally removed from this service.
 */
export interface NestingUiBridge {
  setViewMode?(mode: "main" | "nest"): void;
  setExportEnabled?(enabled: boolean): void;
  clearProgressIndicators?(): void;
  setStopButtonState?(state: StopButtonState): void;
  clearNestDisplay?(): void;
}

/**
 * Cache directory path for NFP (No-Fit Polygon) calculations
 */
const NFP_CACHE_PATH = "./nfpcache";

/**
 * Nesting Service class
 * Manages the nesting workflow including start, stop, and display operations
 * Follows the pattern from main/deepnest.js ES6 class structure
 */
export class NestingService {
  /** File system module for cache operations */
  private fs: FileSystem | null = null;

  /** IPC renderer for background process communication */
  private ipcRenderer: IpcRenderer | null = null;

  /** DeepNest instance for nesting operations */
  private deepNest: DeepNestInstance | null = null;

  /** Ractive instance for nest view UI updates */
  private nestRactive: RactiveInstance<NestViewData> | null = null;

  /** Function to display a specific nesting result */
  private displayNestFn: DisplayNestFunction | null = null;

  /** Function to save current result to JSON */
  private saveJsonFn: SaveJsonFunction | null = null;

  /** Bridge for UI state updates (Preact/signals, etc.) */
  private uiBridge: NestingUiBridge | null = null;

  /** Flag indicating if nesting is being started */
  private isStarting = false;

  /** Flag indicating if nesting is being stopped */
  private isStopping = false;

  /**
   * Create a new NestingService instance
   * Dependencies are injected for testability
   */
  constructor(options?: {
    fs?: FileSystem;
    ipcRenderer?: IpcRenderer;
    deepNest?: DeepNestInstance;
    nestRactive?: RactiveInstance<NestViewData>;
    displayNestFn?: DisplayNestFunction;
    saveJsonFn?: SaveJsonFunction;
    uiBridge?: NestingUiBridge;
  }) {
    if (options) {
      this.fs = options.fs || null;
      this.ipcRenderer = options.ipcRenderer || null;
      this.deepNest = options.deepNest || null;
      this.nestRactive = options.nestRactive || null;
      this.displayNestFn = options.displayNestFn || null;
      this.saveJsonFn = options.saveJsonFn || null;
      this.uiBridge = options.uiBridge || null;
    }
  }

  /**
   * Set the file system module for cache operations
   * @param fs - Node.js fs module
   */
  setFileSystem(fs: FileSystem): void {
    this.fs = fs;
  }

  /**
   * Set the IPC renderer for background process communication
   * @param ipcRenderer - Electron IPC renderer
   */
  setIpcRenderer(ipcRenderer: IpcRenderer): void {
    this.ipcRenderer = ipcRenderer;
  }

  /**
   * Set the DeepNest instance
   * @param deepNest - DeepNest instance for nesting operations
   */
  setDeepNest(deepNest: DeepNestInstance): void {
    this.deepNest = deepNest;
  }

  /**
   * Set the Ractive instance for nest view UI updates
   * @param nestRactive - Ractive instance
   */
  setNestRactive(nestRactive: RactiveInstance<NestViewData>): void {
    this.nestRactive = nestRactive;
  }

  /**
   * Set the function to display a specific nesting result
   * @param displayNestFn - Display function
   */
  setDisplayNestFunction(displayNestFn: DisplayNestFunction): void {
    this.displayNestFn = displayNestFn;
  }

  /**
   * Set the function to save results to JSON
   * @param saveJsonFn - Save JSON function
   */
  setSaveJsonFunction(saveJsonFn: SaveJsonFunction): void {
    this.saveJsonFn = saveJsonFn;
  }

  /**
   * Set UI bridge callbacks for framework integrations (Preact/signals, etc.)
   * @param uiBridge - UI bridge implementation
   */
  setUiBridge(uiBridge: NestingUiBridge): void {
    this.uiBridge = uiBridge;
  }

  /**
   * Delete the NFP cache directory contents
   * This clears cached no-fit polygon calculations
   */
  deleteCache(): void {
    if (!this.fs) {
      return;
    }

    const path = NFP_CACHE_PATH;

    if (this.fs.existsSync(path)) {
      try {
        const files = this.fs.readdirSync(path);
        files.forEach((file) => {
          const curPath = path + "/" + file;
          try {
            if (this.fs!.lstatSync(curPath).isDirectory()) {
              // Recursively delete subdirectories
              this.deleteFolderRecursive(curPath);
            } else {
              // Delete file
              this.fs!.unlinkSync(curPath);
            }
          } catch {
            // Ignore individual file errors, continue with others
          }
        });
      } catch {
        // Ignore errors if directory cannot be read
      }
    }
  }

  /**
   * Recursively delete a folder and its contents
   * @param path - Path to the folder to delete
   */
  private deleteFolderRecursive(path: string): void {
    if (!this.fs || !this.fs.existsSync(path)) {
      return;
    }

    try {
      const files = this.fs.readdirSync(path);
      files.forEach((file) => {
        const curPath = path + "/" + file;
        try {
          if (this.fs!.lstatSync(curPath).isDirectory()) {
            this.deleteFolderRecursive(curPath);
          } else {
            this.fs!.unlinkSync(curPath);
          }
        } catch {
          // Ignore individual file errors
        }
      });
      this.fs.rmdirSync(path);
    } catch {
      // Ignore errors if folder cannot be deleted
    }
  }

  /**
   * Check if there is at least one sheet in the parts list
   * @returns True if at least one part is marked as a sheet
   */
  hasSheet(): boolean {
    if (!this.deepNest) {
      return false;
    }

    return this.deepNest.parts.some((part) => part.sheet);
  }

  /**
   * Check if there are any parts to nest
   * @returns True if there are parts in the list
   */
  hasParts(): boolean {
    if (!this.deepNest) {
      return false;
    }

    return this.deepNest.parts.length > 0;
  }

  /**
   * Check if nesting is currently running
   * @returns True if nesting is in progress
   */
  isWorking(): boolean {
    return this.deepNest?.working || false;
  }

  /**
   * Switch the UI to the nest view
   */
  private switchToNestView(): void {
    this.uiBridge?.setViewMode?.("nest");
  }

  /**
   * Switch the UI back to the main view
   */
  private switchToMainView(): void {
    this.uiBridge?.setViewMode?.("main");
  }

  /**
   * Enable the export button
   */
  private enableExportButton(): void {
    this.uiBridge?.setExportEnabled?.(true);
  }

  /**
   * Disable the export button
   */
  private disableExportButton(): void {
    this.uiBridge?.setExportEnabled?.(false);
  }

  /**
   * Clear progress indicators in the UI
   */
  private clearProgressIndicators(): void {
    this.uiBridge?.clearProgressIndicators?.();
  }

  /**
   * Update the stop/start button state
   * @param state - Button state: "stop", "stop-disabled", or "start"
   */
  private updateStopButton(state: StopButtonState): void {
    this.uiBridge?.setStopButtonState?.(state);
  }

  /**
   * Create the display callback for nesting results
   * This callback is called when a new nesting result is available
   * @returns Display callback function bound to this service
   */
  private createDisplayCallback(): DisplayCallback {
    return () => {
      if (!this.deepNest || !this.nestRactive) {
        return;
      }

      // Get currently selected nests
      const selected = this.deepNest.nests.filter((n) => n.selected);

      // Only change focus if latest nest is selected or none selected
      // This preserves user selection when they're viewing a specific result
      if (
        selected.length === 0 ||
        (this.deepNest.nests.length > 1 && this.deepNest.nests[1].selected)
      ) {
        // Deselect all nests
        this.deepNest.nests.forEach((n) => {
          n.selected = false;
        });

        // Select and display the latest (first) nest
        if (this.deepNest.nests.length > 0) {
          const latestNest = this.deepNest.nests[0];
          latestNest.selected = true;

          if (this.displayNestFn) {
            this.displayNestFn(latestNest);
          }
        }
      }

      // Update the Ractive nests list
      this.nestRactive.update("nests");

      // Enable the export button
      this.enableExportButton();
    };
  }

  /**
   * Start the nesting process
   * @param progressCallback - Optional callback for progress updates
   * @param trigger - Source of the start request
   * @returns True if nesting was started successfully
   */
  startNesting(
    progressCallback?: ProgressCallback,
    trigger: "user" | "system" = "system"
  ): boolean {
    if (trigger !== "user") {
      message("Nesting start is restricted to explicit user action.", true);
      return false;
    }

    if (!this.deepNest) {
      message("DeepNest instance not available", true);
      return false;
    }

    if (this.isStarting) {
      return false;
    }

    // Check prerequisites
    if (!this.hasParts()) {
      message("Please import some parts first");
      return false;
    }

    if (!this.hasSheet()) {
      message("Please mark at least one part as the sheet");
      return false;
    }

    this.isStarting = true;

    try {
      // Switch to nest view
      this.switchToNestView();

      // Clear the cache
      this.deleteCache();

      // Create the display callback
      const displayCallback = this.createDisplayCallback();

      // Start the nesting process
      this.deepNest.start(progressCallback || null, displayCallback);

      return true;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the nesting process
   * @returns True if nesting was stopped successfully
   */
  stopNesting(): boolean {
    if (!this.deepNest) {
      return false;
    }

    if (this.isStopping) {
      return false;
    }

    this.isStopping = true;

    try {
      // Send stop signal to background process
      if (this.ipcRenderer) {
        this.ipcRenderer.send(IPC_CHANNELS.BACKGROUND_STOP);
      }

      // Stop the DeepNest instance
      this.deepNest.stop();

      // Clear progress indicators
      this.clearProgressIndicators();

      // Update stop button to disabled state
      this.updateStopButton("stop-disabled");

      // Save the current result to JSON
      if (this.saveJsonFn) {
        this.saveJsonFn();
      }

      // After a delay, switch button to start state
      setTimeout(() => {
        this.updateStopButton("start");
      }, 3000);

      return true;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Handle the stop/start toggle button click
   * Toggles between stop and start states
   */
  handleStopStartToggle(): void {
    if (this.isWorking()) {
      // Currently showing stop button - stop nesting
      this.stopNesting();
    } else {
      // Currently showing start button - start nesting
      this.updateStopButton("stop-disabled");

      // After a delay, switch to stop state and start nesting
      setTimeout(() => {
        this.updateStopButton("stop");
        this.startNesting(undefined, "user");
      }, 1000);
    }
    // If disabled, do nothing
  }

  /**
   * Go back to the main view
   * Stops any running nesting and resets the state
   */
  goBack(): void {
    // Switch to main view immediately
    this.switchToMainView();

    // Stop nesting if it's running
    if (this.isWorking()) {
      if (this.ipcRenderer) {
        this.ipcRenderer.send(IPC_CHANNELS.BACKGROUND_STOP);
      }

      if (this.deepNest) {
        this.deepNest.stop();
      }

      this.clearProgressIndicators();
    }

    // Reset DeepNest state
    if (this.deepNest) {
      this.deepNest.reset();
    }

    // Delete the cache
    this.deleteCache();

    // Update the nest view
    if (this.nestRactive) {
      this.nestRactive.update("nests");
    }

    // Notify UI to clear visual nest display
    this.uiBridge?.clearNestDisplay?.();

    // Reset the stop button
    this.updateStopButton("start");

    // Disable export button
    this.disableExportButton();
  }

  /**
   * Get the current nesting results
   * @returns Array of nesting results
   */
  getNests(): SelectableNestingResult[] {
    return this.deepNest?.nests || [];
  }

  /**
   * Get the currently selected nesting result
   * @returns Selected nesting result or null
   */
  getSelectedNest(): SelectableNestingResult | null {
    if (!this.deepNest) {
      return null;
    }

    const selected = this.deepNest.nests.filter((n) => n.selected);
    return selected.length > 0 ? selected[selected.length - 1] : null;
  }

  /**
   * Select a specific nesting result and display it
   * @param nest - The nesting result to select
   */
  selectNest(nest: SelectableNestingResult): void {
    if (!this.deepNest) {
      return;
    }

    // Deselect all nests
    this.deepNest.nests.forEach((n) => {
      n.selected = false;
    });

    // Select the specified nest
    nest.selected = true;

    // Display it
    if (this.displayNestFn) {
      this.displayNestFn(nest);
    }

    // Update the UI
    if (this.nestRactive) {
      this.nestRactive.update("nests");
    }
  }

  /**
   * Bind event handlers to DOM elements
   * Call this after the DOM is ready
   */
  bindEventHandlers(): void {
    // Intentionally a no-op: visual event binding is owned by the Preact UI.
  }

  /**
   * Create and return a new NestingService instance
   * @param options - Optional configuration options
   * @returns New NestingService instance
   */
  static create(
    options?: ConstructorParameters<typeof NestingService>[0]
  ): NestingService {
    return new NestingService(options);
  }
}

/**
 * Factory function to create a nesting service
 * @param options - Optional configuration options
 * @returns New NestingService instance
 */
export function createNestingService(
  options?: ConstructorParameters<typeof NestingService>[0]
): NestingService {
  return NestingService.create(options);
}
