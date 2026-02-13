/**
 * Global application state using @preact/signals.
 *
 * Signals are mutable-by-design (like Ractive) but auto-track dependencies
 * (like React hooks). Components that read a signal re-render only when that
 * signal changes — no need for immutable updates or manual ractive.update().
 */
import { signal, computed } from "@preact/signals";
import type {
  Part,
  ImportedFile,
  SelectableNestingResult,
  UIConfig,
  PageId,
  SortState,
  NestingProgress,
  DeepNestInstance,
  SvgParserInstance,
  ConfigObject,
} from "../types/index.ts";

// ─── Navigation ──────────────────────────────────────────
export const activePage = signal<PageId>("home");
export const darkMode = signal<boolean>(
  localStorage.getItem("darkMode") === "true"
);

export type AppPhase =
  | "booting"
  | "idle"
  | "importing"
  | "nesting"
  | "exporting"
  | "busy";

export const appPhase = signal<AppPhase>("booting");

export function setAppPhase(phase: AppPhase): void {
  appPhase.value = phase;
}

/** Toggle dark mode and persist */
export function toggleDarkMode(): void {
  darkMode.value = !darkMode.value;
  localStorage.setItem("darkMode", String(darkMode.value));
  if (darkMode.value) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/** Initialise dark mode class on <html> */
export function initDarkMode(): void {
  if (darkMode.value) {
    document.documentElement.classList.add("dark");
  }
}

// ─── Parts & Sheets ──────────────────────────────────────
/** All parts (regular parts + sheets). Mutated in-place, bump version to notify. */
export const parts = signal<Part[]>([]);
/** Bump this to force re-render after in-place array mutations */
export const partsVersion = signal(0);

/** Imported files */
export const imports = signal<ImportedFile[]>([]);
export const importsVersion = signal(0);

/** Notify that parts array was mutated in-place */
export function touchParts(): void {
  partsVersion.value++;
}

/** Notify that imports array was mutated in-place */
export function touchImports(): void {
  importsVersion.value++;
}

// ─── Computed helpers (depend on version signals for tracking) ──
export const selectedParts = computed(() => {
  partsVersion.value; // subscribe to mutations
  return parts.value.filter((p) => p.selected);
});

export const sheetParts = computed(() => {
  partsVersion.value;
  return parts.value.filter((p) => p.sheet);
});

export const regularParts = computed(() => {
  partsVersion.value;
  return parts.value.filter((p) => !p.sheet);
});

// ─── Nesting ─────────────────────────────────────────────
export const nests = signal<SelectableNestingResult[]>([]);
export const nestsVersion = signal(0);
export const isNesting = signal(false);
export const nestProgress = signal<NestingProgress | null>(null);

export function touchNests(): void {
  nestsVersion.value++;
}

export const selectedNest = computed(() => {
  nestsVersion.value;
  return nests.value.find((n) => n.selected) ?? null;
});

// ─── Configuration ───────────────────────────────────────
export const config = signal<UIConfig | null>(null);

// ─── Sort state ──────────────────────────────────────────
export const sortState = signal<SortState>({ field: null, direction: null });

// ─── Message / toast ─────────────────────────────────────
export type ToastKind = "info" | "success" | "error";

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
  durationMs: number;
  createdAt: number;
}

const DEFAULT_TOAST_DURATION_MS = 4200;
let nextToastId = 1;

export const toasts = signal<ToastMessage[]>([]);

// Backward-compatible derived values used by legacy call sites.
export const messageText = computed<string | null>(() => toasts.value[0]?.text ?? null);
export const messageIsError = computed<boolean>(() => toasts.value[0]?.kind === "error");

export function showMessage(
  text: string,
  isError = false,
  durationMs = DEFAULT_TOAST_DURATION_MS
): number {
  const toast: ToastMessage = {
    id: nextToastId++,
    text,
    kind: isError ? "error" : "success",
    durationMs,
    createdAt: Date.now(),
  };

  toasts.value = [...toasts.value, toast];

  setTimeout(() => {
    clearMessage(toast.id);
  }, Math.max(1200, durationMs));

  return toast.id;
}

export function clearMessage(toastId?: number): void {
  if (toastId == null) {
    if (toasts.value.length === 0) return;
    toasts.value = toasts.value.slice(1);
    return;
  }
  toasts.value = toasts.value.filter((t) => t.id !== toastId);
}

// ─── Sheet dialog ────────────────────────────────────────
export const sheetDialogOpen = signal(false);

// ─── Global references (set once at boot) ────────────────
export const deepNestRef = signal<DeepNestInstance | null>(null);
export const svgParserRef = signal<SvgParserInstance | null>(null);
export const configServiceRef = signal<ConfigObject | null>(null);

// ─── Import busy state ──────────────────────────────────
export const importBusy = signal(false);
export const exportBusy = signal(false);

// ─── Preset modal ────────────────────────────────────────
export const presetModalOpen = signal(false);
export const commandPaletteOpen = signal(false);

// ─── Layout / resize ─────────────────────────────────────
const LEFT_PANEL_MIN = 260;
const LEFT_PANEL_MAX = 620;
const LEFT_PANEL_DEFAULT = 360;

function getStoredLeftPanelWidth(): number {
  try {
    const raw = localStorage.getItem("ui.leftPanelWidth");
    if (!raw) return LEFT_PANEL_DEFAULT;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return LEFT_PANEL_DEFAULT;
    return Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, parsed));
  } catch {
    return LEFT_PANEL_DEFAULT;
  }
}

export const leftPanelWidth = signal<number>(getStoredLeftPanelWidth());

export function setLeftPanelWidth(width: number): void {
  const clamped = Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, width));
  leftPanelWidth.value = clamped;
  try {
    localStorage.setItem("ui.leftPanelWidth", String(clamped));
  } catch {
    // Ignore storage errors
  }
}
