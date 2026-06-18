"use strict";

import { state } from "./state.js";
import { els, icon } from "./dom.js";
import { configured } from "./firebase.js";
import { renderList } from "./views/list.js";
import { renderHistory } from "./views/history.js";
import { renderSettings } from "./views/settings.js";

// ── Glavni render ──────────────────────────────────────────────
export function render() {
  els.viewList.classList.toggle("hidden", state.view !== "list" || !configured);
  els.viewHistory.classList.toggle("hidden", state.view !== "history");
  els.viewSettings.classList.toggle("hidden", state.view !== "settings");
  els.viewToggle.innerHTML = state.view === "list" ? icon("clock") : icon("cart");
  els.appTitle.textContent =
    state.view === "settings" ? "Postavke"
      : state.view === "history" ? "Povijest"
      : "Lista za kupovinu";
  if (state.view === "list") renderList();
  else if (state.view === "history") renderHistory();
  else renderSettings();
}
