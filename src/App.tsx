import { lazy, Suspense } from "preact/compat";
import { useEffect } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { activePage, darkMode, setAppPhase, showMessage } from "./store/index.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { HomePage } from "./components/HomePage.tsx";
import { MessageToast } from "./components/MessageToast.tsx";
import { boot } from "./services/boot.ts";

const ConfigPage = lazy(async () => {
  const mod = await import("./components/ConfigPage.tsx");
  return { default: mod.ConfigPage };
});

const InfoPage = lazy(async () => {
  const mod = await import("./components/InfoPage.tsx");
  return { default: mod.InfoPage };
});

export function App() {
  useEffect(() => {
    boot().catch((err: unknown) => {
      setAppPhase("idle");
      console.error("Boot failed:", err);
      showMessage("Failed to initialize application", true);
    });
  }, []);

  // Sync dark class on <html>
  useSignalEffect(() => {
    if (darkMode.value) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  });

  const page = activePage.value;

  return (
    <div class="relative flex h-screen w-screen overflow-hidden bg-dn-light text-dn-text dark:bg-dn-darkest dark:text-white">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(36,199,237,0.16),transparent_48%),radial-gradient(circle_at_80%_85%,rgba(39,174,96,0.10),transparent_42%)]" />
      <Sidebar />
      <div class="relative z-10 flex flex-1 flex-col overflow-hidden">
        {page === "home" && <HomePage />}
        {page === "config" && (
          <Suspense fallback={<PageLoading label="Loading configuration..." />}>
            <ConfigPage />
          </Suspense>
        )}
        {page === "info" && (
          <Suspense fallback={<PageLoading label="Loading info..." />}>
            <InfoPage />
          </Suspense>
        )}
      </div>
      <MessageToast />
    </div>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div class="flex h-full items-center justify-center text-sm text-dn-text-muted dark:text-gray-300">
      {label}
    </div>
  );
}
