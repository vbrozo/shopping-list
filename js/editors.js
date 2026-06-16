"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import {
  parseQty, unitChipsHTML, getStores, sortStores, catChipsHTML,
  parsePrice, buildQty, msToDateInput, dateInputToMs, setSync, toast, esc,
} from "./util.js";
import { db, doc, updateDoc } from "./firebase.js";

// ── Prolazno stanje editora ────────────────────────────────────
export const edit = { id: null, unit: "kom", category: "" };
export const editStores = new Set();
export const hist = { id: null, unit: "kom", store: "", category: "" };

// ── Editor stavke (jedan bottom-sheet za sve) ──────────────────
export function openEditSheet(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  edit.id = id;
  els.editName.value = item.name;
  const { value, unit } = parseQty(item.qty || "");
  edit.unit = unit;
  els.editQtyValue.value = value;
  els.editQtyUnits.innerHTML = unitChipsHTML(edit.unit, "edit-qty-unit");
  editStores.clear();
  getStores(item).forEach((s) => editStores.add(s));
  renderEditStores();
  edit.category = state.CATEGORIES.includes(item.category) ? item.category : "";
  renderEditCats();
  els.editPrice.value = item.price != null ? String(item.price) : "";
  els.editSheet.classList.remove("hidden");
}
export function renderEditStores() {
  els.editStores.innerHTML = state.STORES
    .map((s) => `<button type="button" class="store-chip ${editStores.has(s) ? "selected" : ""}" data-act="edit-store" data-store="${esc(s)}">${esc(s)}</button>`)
    .join("");
}
export function renderEditCats() {
  els.editCats.innerHTML = catChipsHTML(edit.category, "edit-cat");
}
export function closeEditSheet() {
  els.editSheet.classList.add("hidden");
  edit.id = null;
}
export async function saveEdit() {
  if (!edit.id) return;
  const name = els.editName.value.trim();
  if (!name) { toast("Naziv ne može biti prazan"); return; }
  try {
    await updateDoc(doc(db, "items", edit.id), {
      name,
      qty: buildQty(els.editQtyValue.value, edit.unit) || null,
      stores: sortStores([...editStores]),
      store: null,
      category: edit.category || null,
      price: parsePrice(els.editPrice.value),
    });
    closeEditSheet();
  } catch (e) { console.error(e); setSync(false); }
}

// ── Editor zapisa povijesti ────────────────────────────────────
export function openHistSheet(id) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) return;
  hist.id = id;
  els.histName.value = p.name;
  const { value, unit } = parseQty(p.qty || "");
  hist.unit = unit;
  els.histQtyValue.value = value;
  els.histQtyUnits.innerHTML = unitChipsHTML(hist.unit, "hist-qty-unit");
  hist.store = p.store || "";
  renderHistStores();
  hist.category = state.CATEGORIES.includes(p.category) ? p.category : "";
  renderHistCats();
  els.histPrice.value = p.price != null ? String(p.price) : "";
  els.histDate.value = msToDateInput(p.purchased_at);
  els.histSheet.classList.remove("hidden");
}
export function renderHistStores() {
  els.histStores.innerHTML = state.STORES
    .map((s) => `<button type="button" class="store-chip ${s === hist.store ? "selected" : ""}" data-act="hist-store" data-store="${esc(s)}">${esc(s)}</button>`)
    .join("");
}
export function renderHistCats() {
  els.histCats.innerHTML = catChipsHTML(hist.category, "hist-cat");
}
export function closeHistSheet() {
  els.histSheet.classList.add("hidden");
  hist.id = null;
}
export async function saveHist() {
  if (!hist.id) return;
  const name = els.histName.value.trim();
  if (!name) { toast("Naziv ne može biti prazan"); return; }
  const p = state.purchases.find((x) => x.id === hist.id);
  try {
    await updateDoc(doc(db, "purchases", hist.id), {
      name,
      qty: buildQty(els.histQtyValue.value, hist.unit) || null,
      store: hist.store || null,
      category: hist.category || null,
      price: parsePrice(els.histPrice.value),
      purchased_at: dateInputToMs(els.histDate.value, p ? p.purchased_at : Date.now()),
    });
    closeHistSheet();
  } catch (e) { console.error(e); setSync(false); }
}
