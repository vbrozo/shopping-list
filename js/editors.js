"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import {
  html, parseQty, unitChipsHTML, getStores, sortStores, catChipsHTML,
  parsePrice, buildQty, msToDateInput, dateInputToMs, setSync, toast,
} from "./util.js";
import { db, doc, updateDoc } from "./firebase.js";

// ── Generički editor bottom-sheeta ──────────────────────────────
// Stavke imaju više dućana (multiStore) i nemaju datum; zapisi povijesti
// imaju jedan dućan i polje datuma. Sve ostalo (naziv/količina/kategorija/
// cijena, otvaranje/spremanje/zatvaranje) je identično pa je generalizirano
// jednom fabrikom umjesto dupliciranja po dva seta funkcija.
function createEditor({ collection, multiStore, storeAct, catAct, unitAct, findRecord, fields }) {
  const ed = { id: null, unit: "kom", category: "", store: "" };
  const stores = new Set();

  function renderStores() {
    fields.stores.innerHTML = state.STORES
      .map((s) => {
        const selected = multiStore ? stores.has(s) : s === ed.store;
        return html`<button type="button" class="store-chip ${selected ? "selected" : ""}" data-act="${storeAct}" data-store="${s}">${s}</button>`;
      })
      .join("");
  }
  function renderCats() {
    fields.cats.innerHTML = catChipsHTML(ed.category, catAct);
  }
  function toggleStore(store) {
    if (multiStore) stores.has(store) ? stores.delete(store) : stores.add(store);
    else ed.store = ed.store === store ? "" : store;
    renderStores();
  }
  function toggleCat(cat) {
    ed.category = ed.category === cat ? "" : cat;
    renderCats();
  }
  function toggleUnit(unit) {
    ed.unit = ed.unit === unit ? "" : unit;
    fields.qtyUnits.innerHTML = unitChipsHTML(ed.unit, unitAct);
  }
  function open(id) {
    const record = findRecord(id);
    if (!record) return;
    ed.id = id;
    fields.name.value = record.name;
    const { value, unit } = parseQty(record.qty || "");
    ed.unit = unit;
    fields.qtyValue.value = value;
    fields.qtyUnits.innerHTML = unitChipsHTML(ed.unit, unitAct);
    if (multiStore) {
      stores.clear();
      getStores(record).forEach((s) => stores.add(s));
    } else {
      ed.store = record.store || "";
    }
    renderStores();
    ed.category = state.CATEGORIES.includes(record.category) ? record.category : "";
    renderCats();
    fields.price.value = record.price != null ? String(record.price) : "";
    if (fields.date) fields.date.value = msToDateInput(record.purchased_at);
    fields.sheet.classList.remove("hidden");
  }
  function close() {
    fields.sheet.classList.add("hidden");
    ed.id = null;
  }
  async function save() {
    if (!ed.id) return;
    const name = fields.name.value.trim();
    if (!name) { toast("Naziv ne može biti prazan"); return; }
    const data = {
      name,
      qty: buildQty(fields.qtyValue.value, ed.unit) || null,
      category: ed.category || null,
      price: parsePrice(fields.price.value),
    };
    if (multiStore) {
      data.stores = sortStores([...stores]);
      data.store = null;
    } else {
      data.store = ed.store || null;
    }
    if (fields.date) {
      const record = findRecord(ed.id);
      data.purchased_at = dateInputToMs(fields.date.value, record ? record.purchased_at : Date.now());
    }
    try {
      await updateDoc(doc(db, collection, ed.id), data);
      close();
    } catch (e) { console.error(e); setSync(false); }
  }

  return { open, close, save, renderStores, renderCats, toggleStore, toggleCat, toggleUnit };
}

export const itemEditor = createEditor({
  collection: "items",
  multiStore: true,
  storeAct: "edit-store",
  catAct: "edit-cat",
  unitAct: "edit-qty-unit",
  findRecord: (id) => state.items.find((i) => i.id === id),
  fields: {
    name: els.editName, qtyValue: els.editQtyValue, qtyUnits: els.editQtyUnits,
    stores: els.editStores, cats: els.editCats, price: els.editPrice, sheet: els.editSheet,
  },
});

export const histEditor = createEditor({
  collection: "purchases",
  multiStore: false,
  storeAct: "hist-store",
  catAct: "hist-cat",
  unitAct: "hist-qty-unit",
  findRecord: (id) => state.purchases.find((p) => p.id === id),
  fields: {
    name: els.histName, qtyValue: els.histQtyValue, qtyUnits: els.histQtyUnits,
    stores: els.histStores, cats: els.histCats, price: els.histPrice, sheet: els.histSheet,
    date: els.histDate,
  },
});
