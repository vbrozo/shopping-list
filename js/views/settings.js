"use strict";

import { state } from "../state.js";
import { els } from "../dom.js";
import { esc, toast, setSync } from "../util.js";
import { currentThemeChoice, currentAccent } from "../theme.js";
import { settingsDoc, setDoc } from "../firebase.js";

// Prolazno stanje uređivanja imena (kad je spremljeno, polje je zaključano)
export const settingsState = { nameEditing: false };

// ── Render: POSTAVKE ───────────────────────────────────────────
export function renderSettings() {
  // Tema — istakni odabir
  const choice = currentThemeChoice();
  [...els.themeOptions.querySelectorAll(".seg-btn")].forEach((b) =>
    b.classList.toggle("selected", b.dataset.theme === choice)
  );
  // Boja
  const accent = currentAccent();
  [...els.accentOptions.querySelectorAll(".accent-dot")].forEach((b) =>
    b.classList.toggle("selected", b.dataset.accent === accent)
  );
  // Dućani
  els.settingsStores.innerHTML = state.STORES.map(
    (s) =>
      `<li class="item"><div class="item-body"><div class="item-name">${esc(s)}</div></div>
         <button class="btn-del" data-act="store-del" data-store="${esc(s)}" aria-label="Obriši">×</button></li>`
  ).join("");
  // Kategorije
  els.settingsCats.innerHTML = state.CATEGORIES.map(
    (c) =>
      `<li class="item"><div class="item-body"><div class="item-name">${esc(c)}</div></div>
         <button class="btn-del" data-act="cat-del" data-cat="${esc(c)}" aria-label="Obriši">×</button></li>`
  ).join("");
  // Ime — kad je spremljeno, polje je zaključano, a gumb piše "Uredi"
  els.nameInput.value = state.userName;
  const locked = !!state.userName && !settingsState.nameEditing;
  els.nameInput.disabled = locked;
  els.nameSubmit.textContent = locked ? "Uredi" : "Spremi";
}

// Spremi listu dućana u Firestore (zajednički)
async function saveStores(list) {
  try {
    await setDoc(settingsDoc, { stores: list }, { merge: true });
  } catch (e) { console.error(e); setSync(false); }
}
export function addStore(name) {
  name = name.trim();
  if (!name) return;
  if (state.STORES.some((s) => s.toLowerCase() === name.toLowerCase())) { toast("Taj dućan već postoji"); return; }
  saveStores([...state.STORES, name]);
}
export function removeStore(name) {
  saveStores(state.STORES.filter((s) => s !== name));
}

// Spremi listu kategorija u Firestore (zajednički)
async function saveCategories(list) {
  try {
    await setDoc(settingsDoc, { categories: list }, { merge: true });
  } catch (e) { console.error(e); setSync(false); }
}
export function addCategory(name) {
  name = name.trim();
  if (!name) return;
  if (state.CATEGORIES.some((c) => c.toLowerCase() === name.toLowerCase())) { toast("Ta kategorija već postoji"); return; }
  saveCategories([...state.CATEGORIES, name]);
}
export function removeCategory(name) {
  saveCategories(state.CATEGORIES.filter((c) => c !== name));
}
