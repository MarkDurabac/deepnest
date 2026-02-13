import { render } from "preact";
import { App } from "./App.tsx";
import "./index.css";
import { initDarkMode } from "./store/index.ts";

// Initialise dark mode before first paint
initDarkMode();

render(<App />, document.getElementById("app")!);
