/**
 * Sidebar navigation component.
 * Replaces the #sidenav section from index.html + navigation.ts
 */
import { activePage, toggleDarkMode } from "../store/index.ts";
import type { PageId } from "../types/index.ts";

const tabs: { id: PageId; icon: string; label: string }[] = [
  { id: "home", icon: "img/logosmall.svg", label: "Home" },
  { id: "config", icon: "img/settings.svg", label: "Settings" },
  { id: "info", icon: "img/info.svg", label: "Info" },
];

export function Sidebar() {
  return (
    <nav class="relative z-20 flex w-[var(--nav-width)] flex-col border-r border-white/10 bg-dn-dark/95 electron-drag">
      <div class="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-dn-primary/40 to-transparent" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => (activePage.value = tab.id)}
          class={`flex h-[var(--nav-width)] w-[var(--nav-width)] items-center justify-center
            electron-no-drag group relative transition
            ${
              activePage.value === tab.id
                ? "bg-white/8"
                : "hover:bg-white/6"
            }`}
          title={tab.label}
        >
          {activePage.value === tab.id && (
            <span class="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r bg-dn-primary" />
          )}
          <img
            src={`../main/${tab.icon}`}
            alt={tab.label}
            class={tab.id === "home" ? "h-7 w-7 opacity-90 group-hover:opacity-100" : "h-5 w-5 opacity-75 group-hover:opacity-100"}
          />
          <span class="pointer-events-none absolute left-[calc(var(--nav-width)-0.4rem)] rounded bg-black/85 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
            {tab.label}
          </span>
        </button>
      ))}

      {/* Dark mode toggle at bottom */}
      <div class="mt-auto">
        <button
          onClick={toggleDarkMode}
          class="flex h-[var(--nav-width)] w-[var(--nav-width)] items-center justify-center
            electron-no-drag group hover:bg-white/6"
          title="Toggle dark mode"
        >
          <img
            src="../main/img/dark_mode.svg"
            alt="Dark mode"
            class="h-5 w-5 opacity-75 transition group-hover:opacity-100"
          />
        </button>
      </div>
    </nav>
  );
}
