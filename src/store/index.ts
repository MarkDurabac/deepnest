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
export const messageText = signal<string | null>(null);
export const messageIsError = signal(false);

export function showMessage(text: string, isError = false): void {
  messageText.value = text;
  messageIsError.value = isError;
  setTimeout(() => {
    messageText.value = null;
  }, 4000);
}

export function clearMessage(): void {
  messageText.value = null;
}

// ─── Sheet dialog ────────────────────────────────────────
export const sheetDialogOpen = signal(false);

// ─── Global references (set once at boot) ────────────────
export const deepNestRef = signal<DeepNestInstance | null>(null);
export const svgParserRef = signal<SvgParserInstance | null>(null);
export const configServiceRef = signal<ConfigObject | null>(null);

// ─── Import busy state ──────────────────────────────────
export const importBusy = signal(false);

// ─── Preset modal ────────────────────────────────────────
export const presetModalOpen = signal(false);
