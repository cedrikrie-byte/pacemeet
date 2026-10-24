import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Neue App-Version: einmal neu laden, sobald der neue Service Worker übernimmt.
// (Nicht beim allerersten Besuch, dort gibt es noch keine alte Version.)
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  // Installierte Apps bleiben lange offen: beim Zurückkehren nach Updates schauen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void navigator.serviceWorker.getRegistration().then((r) => r?.update());
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
