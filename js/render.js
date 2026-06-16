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
  els.appTitle.innerHTML =
    state.view === "settings" ? `${icon("gear")} Postavke`
      : state.view === "history" ? `${icon("clock")} Povijest`
      : `${icon("cart")} Lista za kupovinu`;
  if (state.view === "list") renderList();
  else if (state.view === "history") renderHistory();
  else renderSettings();
}
