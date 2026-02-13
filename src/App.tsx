import { useEffect } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
  activePage,
  darkMode,
  deepNestRef,
  svgParserRef,
  configServiceRef,
  config,
  parts,
  imports,
  nests,
  showMessage,
  touchParts,
} from "./store/index.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopNav } from "./components/TopNav.tsx";
import { HomePage } from "./components/HomePage.tsx";
import { ConfigPage } from "./components/ConfigPage.tsx";
import { InfoPage } from "./components/InfoPage.tsx";
import { NestView } from "./components/NestView.tsx";
import { MessageToast } from "./components/MessageToast.tsx";
import { boot } from "./services/boot.ts";

export function App() {
  useEffect(() => {
    boot().catch((err) => {
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
  const isNestPage = page === "home" && nests.value.length > 0;

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-dn-light text-dn-text dark:bg-dn-darkest dark:text-white">
      <Sidebar />
      <div class="flex flex-1 flex-col overflow-hidden">
        {page === "home" && <HomePage />}
        {page === "config" && <ConfigPage />}
        {page === "info" && <InfoPage />}
      </div>
      <MessageToast />
    </div>
  );
}
