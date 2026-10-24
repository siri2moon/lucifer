import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Lineup } from "./scene/Lineup";
import "./styles.css";

const preview = new URLSearchParams(location.search).has("lineup");

createRoot(document.getElementById("root")!).render(<StrictMode>{preview ? <Lineup /> : <App />}</StrictMode>);
