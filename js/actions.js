"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import {
  usualStoresFor, usualCategoryFor, sortStores, getStores, parsePrice,
  newTripId, tripKeyOf, toast, haptic, setSync, normKey, esc,
} from "./util.js";
import {
  db, itemsCol, purchasesCol, addDoc, updateDoc, deleteDoc, doc, writeBatch,
} from "./firebase.js";

// ── Akcije: lista ──────────────────────────────────────────────
export async function addItem(name, stores, qty, recurring, category) {
  let st = stores && stores.length ? stores : usualStoresFor(name);
  const cat = category || usualCategoryFor(name) || null;
  try {
    await addDoc(itemsCol, {
      name,
      stores: st || [],
      store: null,
      qty: qty || null,
      category: cat,
      bought: false,
      bought_at: null,
      price: null,
      urgent: false,
      recurring: !!recurring,
      added_by: state.userName || null,
      created_at: Date.now(),
    });
  } catch (e) { console.error(e); setSync(false); }
}

export async function toggleRecurring(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  haptic();
  try {
    await updateDoc(doc(db, "items", id), { recurring: !item.recurring });
  } catch (e) { console.error(e); setSync(false); }
}

export async function toggleBought(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  haptic();
  const next = !item.bought;
  try {
    await updateDoc(doc(db, "items", id), { bought: next, bought_at: next ? Date.now() : null });
  } catch (e) { console.error(e); setSync(false); }
}

export async function toggleStar(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  haptic();
  try {
    await updateDoc(doc(db, "items", id), { urgent: !item.urgent });
  } catch (e) { console.error(e); setSync(false); }
}

// Brisanje s mogućnošću poništavanja
export async function deleteItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const backup = { ...item };
  delete backup.id;
  try {
    await deleteDoc(doc(db, "items", id));
    toast(`Obrisano: ${item.name}`, "Poništi", async () => {
      try { await addDoc(itemsCol, backup); } catch (e) { console.error(e); }
    });
  } catch (e) { console.error(e); setSync(false); }
}

export function quickAdd(name, store) {
  addItem(name, store ? [store] : [], null);
}

// ── Dijalog: spremanje u povijest ──────────────────────────────
export function openArchiveModal() {
  const bought = state.items.filter((i) => i.bought);
  if (bought.length === 0) return;
  els.archiveRows.innerHTML = bought
    .map((it) => {
      const primary = sortStores(getStores(it))[0] || "";
      const chips = state.STORES.map(
        (s) =>
          `<button type="button" class="store-chip ${s === primary ? "selected" : ""}"
             data-act="archive-store" data-store="${esc(s)}">${esc(s)}</button>`
      ).join("");
      const priceVal = it.price != null ? esc(String(it.price)) : "";
      return `
        <div class="archive-row" data-id="${it.id}">
          <div class="item-name">${esc(it.name)}${it.qty ? ` ×${esc(it.qty)}` : ""}</div>
          <div class="store-picker single">${chips}</div>
          <input class="archive-price" type="text" inputmode="decimal"
                 placeholder="cijena (npr. 1,99)" value="${priceVal}" />
        </div>`;
    })
    .join("");
  els.archiveModal.classList.remove("hidden");
}
export function closeArchiveModal() {
  els.archiveModal.classList.add("hidden");
}
export async function confirmArchive() {
  const rows = [...els.archiveRows.querySelectorAll(".archive-row")];
  const tripId = newTripId();
  try {
    const batch = writeBatch(db);
    for (const row of rows) {
      const id = row.dataset.id;
      const it = state.items.find((i) => i.id === id);
      if (!it) continue;
      const selected = row.querySelector(".store-chip.selected");
      const store = selected ? selected.dataset.store : null;
      const price = parsePrice(row.querySelector(".archive-price").value);
      batch.set(doc(purchasesCol), {
        name: it.name,
        qty: it.qty || null,
        store,
        category: it.category || usualCategoryFor(it.name) || null,
        price,
        bought_by: state.userName || null,
        purchased_at: it.bought_at || Date.now(),
        trip_id: tripId,
      });
      if (it.recurring) {
        // Ponavljajuća stavka: vrati na listu umjesto brisanja
        batch.update(doc(db, "items", id), { bought: false, bought_at: null, price: null });
      } else {
        batch.delete(doc(db, "items", id));
      }
    }
    await batch.commit();
    closeArchiveModal();
  } catch (e) { console.error(e); setSync(false); }
}

export async function deleteHistory(id) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) return;
  const backup = { ...p };
  delete backup.id;
  try {
    await deleteDoc(doc(db, "purchases", id));
    toast(`Obrisano iz povijesti: ${p.name}`, "Poništi", async () => {
      try { await addDoc(purchasesCol, backup); } catch (e) { console.error(e); }
    });
  } catch (e) { console.error(e); setSync(false); }
}

// Ponovi kupovinu — dodaj na listu sve (jedinstvene) stavke iz prošle kupovine
export async function repeatTrip(key) {
  const trip = state.purchases.filter((p) => tripKeyOf(p) === key);
  if (trip.length === 0) return;
  const activeNames = new Set(state.items.filter((i) => !i.bought).map((i) => normKey(i.name)));
  const seen = new Set();
  let added = 0;
  for (const p of trip) {
    const nk = normKey(p.name);
    if (seen.has(nk) || activeNames.has(nk)) continue;
    seen.add(nk);
    await addItem(p.name, p.store ? [p.store] : [], p.qty || null, false, p.category || "");
    added++;
  }
  toast(added ? `Dodano na listu: ${added} stavki ✓` : "Sve stavke su već na listi");
}
