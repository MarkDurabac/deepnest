import { useEffect } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { activePage, darkMode, showMessage } from "./store/index.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { HomePage } from "./components/HomePage.tsx";
import { ConfigPage } from "./components/ConfigPage.tsx";
import { InfoPage } from "./components/InfoPage.tsx";
import { MessageToast } from "./components/MessageToast.tsx";
import { boot } from "./services/boot.ts";

export function App() {
  useEffect(() => {
    boot().catch((err: unknown) => {
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
        {page === "config" && <ConfigPage />}
        {page === "info" && <InfoPage />}
      </div>
      <MessageToast />
    </div>
  );
}
