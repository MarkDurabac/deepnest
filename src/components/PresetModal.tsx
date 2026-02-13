/**
 * Preset modal for saving/loading/deleting presets.
 */
import { useCallback, useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import {
  presetModalOpen,
  configServiceRef,
  deepNestRef,
  showMessage,
} from "../store/index.ts";

declare function require(module: string): any;

function getIpc() {
  return require("electron").ipcRenderer;
}

const presets = signal<Record<string, string>>({});
const selectedPreset = signal("");
const newPresetName = signal("");

async function loadPresets() {
  try {
    presets.value = (await getIpc().invoke("load-presets")) ?? {};
  } catch {
    presets.value = {};
  }
}

export function PresetModal() {
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    const cfg = configServiceRef.value;
    if (!cfg) return;
    const name = newPresetName.value.trim();
    if (!name) {
      showMessage("Please enter a preset name", true);
      return;
    }
    try {
      const cfgData = cfg.getSync();
      await getIpc().invoke("save-preset", name, JSON.stringify(cfgData));
      await loadPresets();
      selectedPreset.value = name;
      newPresetName.value = "";
      showMessage("Preset saved!");
    } catch {
      showMessage("Error saving preset", true);
    }
  }, []);

  const handleLoad = useCallback(async () => {
    const cfg = configServiceRef.value;
    const dn = deepNestRef.value;
    if (!cfg || !dn) return;
    const name = selectedPreset.value;
    if (!name) {
      showMessage("Select a preset to load", true);
      return;
    }
    try {
      const all = presets.value;
      const data = all[name];
      if (!data) return;
      const parsed = JSON.parse(data);
      // Preserve auth
      const accessToken = cfg.getSync("access_token");
      const idToken = cfg.getSync("id_token");
      cfg.setSync(parsed);
      if (accessToken) cfg.setSync("access_token", accessToken);
      if (idToken) cfg.setSync("id_token", idToken);
      dn.config(cfg.getSync() as any);
      showMessage("Preset loaded!");
      presetModalOpen.value = false;
    } catch {
      showMessage("Error loading preset", true);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    const name = selectedPreset.value;
    if (!name) return;
    if (!confirm(`Delete preset "${name}"?`)) return;
    try {
      await getIpc().invoke("delete-preset", name);
      await loadPresets();
      selectedPreset.value = "";
      showMessage("Preset deleted");
    } catch {
      showMessage("Error deleting preset", true);
    }
  }, []);

  useEffect(() => {
    loadPresets();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        presetModalOpen.value = false;
      }
      if (ev.key === "Enter" && newPresetName.value.trim()) {
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const presetNames = Object.keys(presets.value);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) presetModalOpen.value = false;
      }}
    >
      <div class="w-[420px] rounded-2xl border border-dn-border/80 bg-white/95 p-6 shadow-xl dark:border-white/10 dark:bg-[#2d2d2d]/95">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-bold dark:text-white">Presets</h2>
          <button
            onClick={() => (presetModalOpen.value = false)}
            class="text-xl font-bold text-dn-text-muted hover:text-dn-text"
          >
            ×
          </button>
        </div>
        <p class="mb-3 text-xs text-dn-text-muted">
          Save machine/material profiles and switch setup in one click.
        </p>

        {/* Load/Delete section */}
        <div class="mb-4 rounded-xl border border-dn-border/80 bg-dn-light/60 p-3 dark:border-white/10 dark:bg-black/25">
          <label class="mb-2 block text-xs font-bold uppercase text-dn-text-muted">
            Load existing preset
          </label>
          <select
            value={selectedPreset.value}
            onChange={(e) => (selectedPreset.value = (e.target as HTMLSelectElement).value)}
            class="mb-2 w-full rounded border border-dn-input-border bg-dn-input-bg px-3 py-2 text-sm
              dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
          >
            <option value="">— Select preset —</option>
            {presetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div class="flex gap-2">
            <button
              onClick={handleLoad}
              disabled={!selectedPreset.value}
              class={`flex-1 rounded px-3 py-1.5 text-sm font-bold text-white
                ${selectedPreset.value ? "bg-dn-primary hover:bg-dn-primary-hover" : "cursor-not-allowed bg-gray-300"}`}
            >
              Load
            </button>
            <button
              onClick={handleDelete}
              disabled={!selectedPreset.value}
              class={`rounded px-3 py-1.5 text-sm font-bold text-white
                ${selectedPreset.value ? "bg-dn-danger hover:brightness-110" : "cursor-not-allowed bg-gray-300"}`}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Save section */}
        <div class="rounded-xl border border-dn-border/80 bg-dn-light/60 p-3 dark:border-white/10 dark:bg-black/25">
          <label class="mb-2 block text-xs font-bold uppercase text-dn-text-muted">
            Save current config as preset
          </label>
          <input
            ref={nameRef}
            type="text"
            placeholder="Preset name…"
            value={newPresetName.value}
            onInput={(e) => (newPresetName.value = (e.target as HTMLInputElement).value)}
            class="mb-2 w-full rounded border border-dn-input-border bg-dn-input-bg px-3 py-2 text-sm
              dark:border-[#505050] dark:bg-[#3d3d3d] dark:text-white"
          />
          <button
            onClick={handleSave}
            disabled={!newPresetName.value.trim()}
            class={`w-full rounded px-3 py-1.5 text-sm font-bold text-white
              ${newPresetName.value.trim() ? "bg-dn-success hover:brightness-110" : "cursor-not-allowed bg-gray-300"}`}
          >
            Save preset
          </button>
        </div>
      </div>
    </div>
  );
}
