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
    <nav class="flex w-[var(--nav-width)] flex-col bg-dn-dark electron-drag">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => (activePage.value = tab.id)}
          class={`flex h-[var(--nav-width)] w-[var(--nav-width)] items-center justify-center
            electron-no-drag transition-colors
            ${
              activePage.value === tab.id
                ? "bg-black brightness-[0.6] invert"
                : "hover:bg-[#53575e]"
            }`}
          title={tab.label}
        >
          <img
            src={`../main/${tab.icon}`}
            alt={tab.label}
            class={tab.id === "home" ? "h-7 w-7" : "h-5 w-5"}
          />
        </button>
      ))}

      {/* Dark mode toggle at bottom */}
      <div class="mt-auto">
        <button
          onClick={toggleDarkMode}
          class="flex h-[var(--nav-width)] w-[var(--nav-width)] items-center justify-center
            electron-no-drag hover:bg-[#53575e]"
          title="Toggle dark mode"
        >
          <img
            src="../main/img/dark_mode.svg"
            alt="Dark mode"
            class="h-5 w-5"
          />
        </button>
      </div>
    </nav>
  );
}
