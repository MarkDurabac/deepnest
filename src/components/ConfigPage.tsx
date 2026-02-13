/**
 * Configuration page component.
 * Replaces the #config section from index.html and config form logic from index.ts.
 */
import { useCallback } from "preact/hooks";
import {
  configServiceRef,
  deepNestRef,
  showMessage,
  presetModalOpen,
} from "../store/index.ts";
import type { UIConfig } from "../types/index.ts";
import { PresetModal } from "./PresetModal.tsx";

/** Boolean config keys that use checkboxes */
const BOOLEAN_KEYS: (keyof UIConfig)[] = [
  "mergeLines",
  "simplify",
  "useSvgPreProcessor",
  "useQuantityFromFileName",
  "exportWithSheetBoundboarders",
  "exportWithSheetsSpace",
];

/** Config item definition for rendering the form */
interface ConfigField {
  key: keyof UIConfig;
  label: string;
  type: "number" | "checkbox" | "select" | "radio";
  helpId?: string;
  options?: { value: string; label: string }[];
  conversion?: boolean; // Distance field — multiply by scale
  min?: number;
  max?: number;
  step?: number | string;
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "units",
    label: "Units",
    type: "radio",
    options: [
      { value: "inch", label: "Inches" },
      { value: "mm", label: "Millimeters" },
    ],
    helpId: "units",
  },
  { key: "spacing", label: "Spacing", type: "number", conversion: true, min: 0, step: "any", helpId: "spacing" },
  { key: "scale", label: "SVG import scale", type: "number", min: 1, step: "any", helpId: "scale" },
  { key: "curveTolerance", label: "Curve tolerance", type: "number", conversion: true, min: 0, step: "any", helpId: "curveTolerance" },
  { key: "endpointTolerance", label: "Endpoint tolerance", type: "number", conversion: true, min: 0, step: "any", helpId: "endpointTolerance" },
  { key: "simplify", label: "Use rough approximation", type: "checkbox", helpId: "simplify" },
  { key: "rotations", label: "Rotations", type: "number", min: 1, max: 360, step: 1, helpId: "rotations" },
  {
    key: "placementType",
    label: "Placement type",
    type: "select",
    options: [
      { value: "gravity", label: "1. Gravity" },
      { value: "box", label: "2. Bounding Box" },
      { value: "convexhull", label: "3. Squeeze" },
    ],
    helpId: "placementType",
  },
  { key: "threads", label: "CPU Cores", type: "number", min: 1, max: 32, step: 1, helpId: "threads" },
  { key: "mergeLines", label: "Merge common lines", type: "checkbox", helpId: "mergeLines" },
  { key: "timeRatio", label: "Optimization ratio", type: "number", min: 0, max: 1, step: 0.01, helpId: "timeRatio" },
  { key: "populationSize", label: "Population size", type: "number", min: 2, max: 100, step: 1, helpId: "populationSize" },
  { key: "mutationRate", label: "Mutation rate", type: "number", min: 1, max: 100, step: 1 },
  { key: "dxfImportScale", label: "DXF import scale", type: "number", min: 0.01, step: "any" },
  { key: "dxfExportScale", label: "DXF export scale", type: "number", min: 0.01, step: "any" },
  { key: "useSvgPreProcessor", label: "SVG pre-processor", type: "checkbox" },
  { key: "useQuantityFromFileName", label: "Quantity from filename", type: "checkbox" },
  { key: "exportWithSheetBoundboarders", label: "Export with sheet borders", type: "checkbox" },
  { key: "exportWithSheetsSpace", label: "Add sheet spacing in export", type: "checkbox" },
  { key: "exportWithSheetsSpaceValue", label: "Sheet spacing value", type: "number", conversion: true, min: 0, step: "any" },
];

function getDisplayValue(cfg: any, key: keyof UIConfig, conversion: boolean): string | number | boolean {
  const raw = cfg.getSync(key);
  if (BOOLEAN_KEYS.includes(key)) return raw;
  if (key === "scale") {
    return cfg.getSync("units") === "mm" ? Number(raw) / 25.4 : Number(raw);
  }
  if (conversion) {
    let scale = cfg.getSync("scale");
    if (cfg.getSync("units") === "mm") scale /= 25.4;
    return Number(raw) / scale;
  }
  return raw;
}

export function ConfigPage() {
  const cfg = configServiceRef.value;
  const dn = deepNestRef.value;

  const handleChange = useCallback(
    (key: keyof UIConfig, value: string | number | boolean, conversion?: boolean) => {
      if (!cfg || !dn) return;

      let finalValue: any = value;

      if (key === "scale") {
        if (cfg.getSync("units") === "mm") {
          finalValue = Number(finalValue) * 25.4;
        }
      }

      if (BOOLEAN_KEYS.includes(key)) {
        finalValue = Boolean(value);
      }

      if (conversion) {
        let scale = cfg.getSync("scale");
        if (cfg.getSync("units") === "mm") scale /= 25.4;
        finalValue = Number(finalValue) * scale;
      }

      cfg.setSync(key, finalValue);
      dn.config(cfg.getSync() as any);
    },
    [cfg, dn]
  );

  const handleReset = useCallback(() => {
    if (!cfg || !dn) return;
    const accessToken = cfg.getSync("access_token");
    const idToken = cfg.getSync("id_token");
    cfg.resetToDefaultsSync();
    if (accessToken) cfg.setSync("access_token", accessToken);
    if (idToken) cfg.setSync("id_token", idToken);
    dn.config(cfg.getSync() as any);
    showMessage("Configuration reset to defaults");
  }, [cfg, dn]);

  if (!cfg) {
    return (
      <div class="flex h-full items-center justify-center text-dn-text-muted">
        Loading configuration…
      </div>
    );
  }

  return (
    <div class="flex h-full overflow-hidden">
      {/* Form */}
      <div class="flex-1 overflow-y-auto p-6">
        <div class="mx-auto max-w-[600px]">
          <div class="mb-4 flex items-center justify-between">
            <h1 class="text-xl font-light text-dn-text-muted dark:text-gray-400">
              Configuration
            </h1>
            <div class="flex gap-2">
              <button
                onClick={() => (presetModalOpen.value = true)}
                class="rounded bg-dn-primary px-3 py-1 text-xs font-bold text-white hover:bg-dn-primary-hover"
              >
                Presets
              </button>
              <button
                onClick={handleReset}
                class="rounded bg-dn-dark px-3 py-1 text-xs font-bold text-white hover:bg-[#53575e]"
              >
                Reset defaults
              </button>
            </div>
          </div>
          <p class="mb-4 text-xs text-dn-text-muted">
            Tips: values are applied instantly. Use presets to switch quickly between machines/material profiles.
          </p>

          <div class="space-y-4">
            {CONFIG_FIELDS.map((field) => (
              <ConfigRow
                key={field.key}
                field={field}
                cfg={cfg}
                onChange={handleChange}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Help panel */}
      <div class="hidden w-[380px] overflow-y-auto border-l border-dn-border/80 bg-white/85 p-6 text-sm text-dn-text-muted backdrop-blur lg:block dark:border-white/10 dark:bg-[#2d2d2d]/85">
        <p class="text-base font-medium">
          Hover over a setting on the left to see its explanation here.
        </p>
        <div class="mt-4 rounded-lg border border-dn-border/80 bg-dn-light/70 p-4 text-xs leading-relaxed dark:border-white/10 dark:bg-black/20 dark:text-gray-300">
          Pro workflow:
          <br />
          1. Configure units + spacing.
          <br />
          2. Save preset by material thickness.
          <br />
          3. Reuse presets for repeat jobs.
        </div>
      </div>

      {/* Preset modal */}
      {presetModalOpen.value && <PresetModal />}
    </div>
  );
}

/** Individual config row */
function ConfigRow({
  field,
  cfg,
  onChange,
}: {
  field: ConfigField;
  cfg: any;
  onChange: (key: keyof UIConfig, value: any, conversion?: boolean) => void;
}) {
  const displayValue = getDisplayValue(cfg, field.key, !!field.conversion);

  if (field.type === "radio" && field.options) {
    return (
      <div class="flex items-center justify-between rounded-xl border border-dn-border/70 bg-white/85 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#2d2d2d]/85">
        <label class="text-sm font-medium">{field.label}</label>
        <div class="flex gap-4">
          {field.options.map((opt) => (
            <label key={opt.value} class="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={field.key}
                value={opt.value}
                checked={displayValue === opt.value}
                onChange={() => onChange(field.key, opt.value)}
                class="accent-dn-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div class="flex items-center justify-between rounded-xl border border-dn-border/70 bg-white/85 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#2d2d2d]/85">
        <label class="text-sm font-medium">{field.label}</label>
        <input
          type="checkbox"
          checked={!!displayValue}
          onChange={(e) => onChange(field.key, (e.target as HTMLInputElement).checked)}
          class="h-4 w-4 accent-dn-primary"
        />
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div class="flex items-center justify-between rounded-xl border border-dn-border/70 bg-white/85 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#2d2d2d]/85">
        <label class="text-sm font-medium">{field.label}</label>
        <select
          value={String(displayValue)}
          onChange={(e) => onChange(field.key, (e.target as HTMLSelectElement).value)}
          class="rounded border border-dn-input-border bg-dn-input-bg px-2 py-1 text-sm
            dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Default: number input
  return (
    <div class="flex items-center justify-between rounded-xl border border-dn-border/70 bg-white/85 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#2d2d2d]/85">
      <label class="text-sm font-medium">
        {field.label}
        {field.conversion && (
          <span class="ml-1 text-xs text-dn-text-muted">
            ({cfg.getSync("units") === "mm" ? "mm" : "in"})
          </span>
        )}
      </label>
      <input
        type="number"
        value={typeof displayValue === "number" ? displayValue : Number(displayValue)}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(e) => onChange(field.key, Number((e.target as HTMLInputElement).value), field.conversion)}
        class="w-24 rounded border border-dn-input-border bg-dn-input-bg px-2 py-1 text-right text-sm
          dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
      />
    </div>
  );
}
