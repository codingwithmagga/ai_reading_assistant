import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./style.css";

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new Event("pwa-update-available"));
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App updateServiceWorker={() => updateServiceWorker(true)} />
  </React.StrictMode>,
);
