"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Fiksna lista dućana ────────────────────────────────────────
const STORES = ["Konzum", "DM", "Lidl", "Tvornica Zdrave Hrane"];

// ── Konfiguracija / inicijalizacija ────────────────────────────
const cfg = (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig) || {};
const configured = cfg.apiKey && cfg.projectId;

const $ = (id) => document.getElementById(id);

const els = {
  setupNotice: $("setup-notice"),
  appTitle: $("app-title"),
  viewToggle: $("view-toggle"),
  viewList: $("view-list"),
  viewHistory: $("view-history"),
  form: $("add-form"),
  itemInput: $("item-input"),
  suggestions: $("suggestions"),
  storePicker: $("store-picker"),
  storeFilter: $("store-filter"),
  quickAddSection: $("quick-add-section"),
  quickAdd: $("quick-add"),
  activeList: $("active-list"),
  boughtList: $("bought-list"),
  boughtSection: $("bought-section"),
  emptyActive: $("empty-active"),
  activeCount: $("active-count"),
  boughtCount: $("bought-count"),
  clearBought: $("clear-bought"),
  syncDot: $("sync-dot"),
  historySearch: $("history-search"),
  priceList: $("price-list"),
  emptyHistory: $("empty-history"),
  timelineSection: $("timeline-section"),
  historyList: $("history-list"),
};

if (!configured) {
  els.setupNotice.classList.remove("hidden");
  els.viewList.classList.add("hidden");
}

const app = configured ? initializeApp(cfg) : null;
const db = configured ? getFirestore(app) : null;
const itemsCol = db ? collection(db, "items") : null;
const purchasesCol = db ? collection(db, "purchases") : null;

// Lokalne kopije (sinkronizirane preko onSnapshot)
let items = [];
let purchases = [];
let filterStore = "";
let view = "list"; // "list" | "history"
let historyQuery = "";
let editingStoresFor = null; // id stavke čiji se dućani trenutno uređuju
const newStores = new Set(); // odabrani dućani u formi za dodavanje

// ── Pomoćne ────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function setSync(ok) {
  els.syncDot.className = "sync-dot " + (ok ? "online" : "offline");
}
function fmtPrice(p) {
  return (typeof p === "number" && !isNaN(p)) ? p.toFixed(2) + " €" : null;
}
function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("hr-HR", { day: "numeric", month: "numeric", year: "numeric" });
}
function parsePrice(str) {
  if (str == null) return null;
  const n = parseFloat(String(str).replace(",", ".").replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}
// Dohvat dućana stavke kao polje (podržava i stari format `store`)
function getStores(item) {
  if (Array.isArray(item.stores)) return item.stores;
  if (item.store) return [item.store];
  return [];
}
// Poredaj dućane redoslijedom iz STORES, ostale na kraj
function sortStores(arr) {
  return [...arr].sort((a, b) => {
    const ia = STORES.indexOf(a), ib = STORES.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, "hr");
  });
}

// ── Glavni render ──────────────────────────────────────────────
function render() {
  els.viewList.classList.toggle("hidden", view !== "list" || !configured);
  els.viewHistory.classList.toggle("hidden", view !== "history");
  els.viewToggle.textContent = view === "list" ? "📜" : "🛒";
  els.viewToggle.setAttribute("aria-label", view === "list" ? "Povijest" : "Lista");
  els.appTitle.textContent = view === "list" ? "🛒 Lista za kupovinu" : "📜 Povijest";

  if (view === "list") renderList();
  else renderHistory();
}

function renderStorePicker() {
  els.storePicker.innerHTML = STORES.map(
    (s) =>
      `<button type="button" class="store-chip ${newStores.has(s) ? "selected" : ""}"
         data-act="toggle-new-store" data-store="${esc(s)}">${esc(s)}</button>`
  ).join("");
}

function renderList() {
  renderStorePicker();

  // Filter dućana — samo oni koji su u upotrebi
  const used = sortStores([...new Set(items.flatMap(getStores).filter(Boolean))]);
  const prevFilter = els.storeFilter.value;
  els.storeFilter.innerHTML =
    '<option value="">Svi</option>' +
    used.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  els.storeFilter.value = used.includes(prevFilter) ? prevFilter : "";
  filterStore = els.storeFilter.value;

  // Autocomplete imena (iz liste + povijesti)
  const allNames = [...new Set([...items.map((i) => i.name), ...purchases.map((p) => p.name)])].sort();
  els.suggestions.innerHTML = allNames.map((n) => `<option value="${esc(n)}">`).join("");

  renderQuickAdd();

  const visible = items.filter((i) => !filterStore || getStores(i).includes(filterStore));
  const active = visible.filter((i) => !i.bought);
  const bought = visible.filter((i) => i.bought);

  els.activeList.innerHTML = active.map(renderItem).join("");
  els.boughtList.innerHTML = bought.map(renderItem).join("");

  els.activeCount.textContent = active.length;
  els.boughtCount.textContent = bought.length;
  els.emptyActive.classList.toggle("hidden", active.length > 0);
  els.boughtSection.classList.toggle("hidden", bought.length === 0);
}

function renderItem(item) {
  const stores = sortStores(getStores(item));
  const storeBadges = stores
    .map((s) => `<span class="store-badge">📍 ${esc(s)}</span>`)
    .join("");
  const editBtn = `<button class="store-badge edit ${stores.length ? "" : "empty"}"
      data-act="edit-stores" data-id="${item.id}">${stores.length ? "✏️" : "+ dućan"}</button>`;

  // Inline uređivanje dućana
  const editor =
    editingStoresFor === item.id
      ? `<div class="store-editor">
           ${STORES.map(
             (s) =>
               `<button class="store-chip ${stores.includes(s) ? "selected" : ""}"
                  data-act="toggle-item-store" data-id="${item.id}" data-store="${esc(s)}">${esc(s)}</button>`
           ).join("")}
           <button class="btn-text done" data-act="close-store-edit">✓ gotovo</button>
         </div>`
      : "";

  // Cijena (samo za kupljene)
  const priceTxt = fmtPrice(item.price);
  const price = item.bought
    ? (priceTxt
        ? `<button class="price-badge" data-act="price" data-id="${item.id}">💰 ${priceTxt}</button>`
        : `<button class="price-badge empty" data-act="price" data-id="${item.id}">💰 cijena</button>`)
    : "";

  return `
    <li class="item ${item.bought ? "done" : ""}">
      <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
        ${item.bought ? "✓" : ""}
      </button>
      <div class="item-body">
        <div class="item-name">${esc(item.name)}</div>
        <div class="badges">${storeBadges}${editBtn}${price}</div>
        ${editor}
      </div>
      <button class="btn-del" data-act="del" data-id="${item.id}" aria-label="Obriši">×</button>
    </li>`;
}

function renderQuickAdd() {
  const stats = aggregateByName();
  const onList = new Set(items.map((i) => i.name.toLowerCase()));

  const top = Object.values(stats)
    .filter((s) => !onList.has(s.name.toLowerCase()))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, 10);

  els.quickAddSection.classList.toggle("hidden", top.length === 0);
  els.quickAdd.innerHTML = top
    .map(
      (s) =>
        `<button class="chip" data-act="quick" data-name="${esc(s.name)}" data-store="${esc(s.lastStore || "")}">
           ${esc(s.name)}${s.lastStore ? ` <span class="chip-store">${esc(s.lastStore)}</span>` : ""}
         </button>`
    )
    .join("");
}

function aggregateByName() {
  const map = {};
  for (const p of purchases) {
    const key = p.name.toLowerCase();
    if (!map[key]) {
      map[key] = { name: p.name, count: 0, lastAt: 0, lastStore: null, prices: [] };
    }
    const e = map[key];
    e.count++;
    if ((p.purchased_at || 0) > e.lastAt) {
      e.lastAt = p.purchased_at || 0;
      e.lastStore = p.store || null;
    }
    if (typeof p.price === "number" && !isNaN(p.price)) {
      e.prices.push({ price: p.price, store: p.store || "—", at: p.purchased_at || 0 });
    }
  }
  return map;
}

// ── Render: POVIJEST ───────────────────────────────────────────
function renderHistory() {
  const q = historyQuery.trim().toLowerCase();
  els.emptyHistory.classList.toggle("hidden", purchases.length > 0);

  const stats = Object.values(aggregateByName())
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "hr"));

  els.priceList.innerHTML = stats
    .map((s) => {
      if (s.prices.length === 0) {
        return `<li class="item"><div class="item-body"><div class="item-name">${esc(s.name)}</div>
                <div class="muted-line">još bez cijene · ${s.count}× kupljeno</div></div></li>`;
      }
      const min = [...s.prices].sort((a, b) => a.price - b.price)[0];
      const last = [...s.prices].sort((a, b) => b.at - a.at)[0];
      const cheapest = `Najjeftinije: <strong>${min.price.toFixed(2)} €</strong> (${esc(min.store)})`;
      const recent = `Zadnje: ${last.price.toFixed(2)} € (${esc(last.store)})`;
      return `<li class="item"><div class="item-body">
                <div class="item-name">${esc(s.name)}</div>
                <div class="muted-line">${cheapest} · ${recent}</div>
              </div></li>`;
    })
    .join("");

  const timeline = purchases
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => (b.purchased_at || 0) - (a.purchased_at || 0));

  els.timelineSection.classList.toggle("hidden", timeline.length === 0);
  els.historyList.innerHTML = timeline
    .map((p) => {
      const parts = [fmtDate(p.purchased_at)];
      if (p.store) parts.push(esc(p.store));
      const priceTxt = fmtPrice(p.price);
      if (priceTxt) parts.push(priceTxt);
      return `<li class="item">
                <div class="item-body">
                  <div class="item-name">${esc(p.name)}</div>
                  <div class="muted-line">${parts.join(" · ")}</div>
                </div>
                <button class="btn-del" data-act="del-hist" data-id="${p.id}" aria-label="Obriši">×</button>
              </li>`;
    })
    .join("");
}

// ── Akcije: lista ──────────────────────────────────────────────
async function addItem(name, stores) {
  try {
    await addDoc(itemsCol, {
      name,
      stores: stores || [],
      store: null,
      bought: false,
      bought_at: null,
      price: null,
      created_at: Date.now(),
    });
  } catch (e) { console.error(e); setSync(false); }
}

async function toggleBought(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = !item.bought;
  try {
    await updateDoc(doc(db, "items", id), { bought: next, bought_at: next ? Date.now() : null });
  } catch (e) { console.error(e); setSync(false); }
}

// Uključi/isključi dućan na postojećoj stavci
async function toggleItemStore(id, store) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const cur = new Set(getStores(item));
  cur.has(store) ? cur.delete(store) : cur.add(store);
  try {
    await updateDoc(doc(db, "items", id), { stores: [...cur], store: null });
  } catch (e) { console.error(e); setSync(false); }
}

async function editPrice(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const value = prompt("Cijena (npr. 1,99):", item.price != null ? String(item.price) : "");
  if (value === null) return;
  try {
    await updateDoc(doc(db, "items", id), { price: parsePrice(value) });
  } catch (e) { console.error(e); setSync(false); }
}

async function deleteItem(id) {
  try { await deleteDoc(doc(db, "items", id)); }
  catch (e) { console.error(e); setSync(false); }
}

function quickAdd(name, store) {
  addItem(name, store ? [store] : []);
}

// Arhiviraj kupljene stavke u povijest (jedan zapis po dućanu stavke)
async function archiveBought() {
  const bought = items.filter((i) => i.bought);
  if (bought.length === 0) return;
  if (!confirm(`Spremiti ${bought.length} kupljenih stavki u povijest?`)) return;
  try {
    const batch = writeBatch(db);
    for (const it of bought) {
      const sts = getStores(it);
      // Ako stavka ima više dućana, koristi prvi (po redu STORES) kao dućan kupnje
      const store = sts.length ? sortStores(sts)[0] : null;
      batch.set(doc(purchasesCol), {
        name: it.name,
        store,
        price: typeof it.price === "number" ? it.price : null,
        purchased_at: it.bought_at || Date.now(),
      });
      batch.delete(doc(db, "items", it.id));
    }
    await batch.commit();
  } catch (e) { console.error(e); setSync(false); }
}

async function deleteHistory(id) {
  if (!confirm("Obrisati ovaj zapis iz povijesti?")) return;
  try { await deleteDoc(doc(db, "purchases", id)); }
  catch (e) { console.error(e); setSync(false); }
}

// ── Event listeneri ────────────────────────────────────────────
if (configured) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.itemInput.value.trim();
    if (!name) return;
    addItem(name, sortStores([...newStores]));
    els.itemInput.value = "";
    newStores.clear();
    renderStorePicker();
    els.itemInput.focus();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, id, store } = btn.dataset;
    if (act === "toggle") toggleBought(id);
    else if (act === "edit-stores") { editingStoresFor = editingStoresFor === id ? null : id; render(); }
    else if (act === "toggle-item-store") toggleItemStore(id, store);
    else if (act === "close-store-edit") { editingStoresFor = null; render(); }
    else if (act === "toggle-new-store") {
      newStores.has(store) ? newStores.delete(store) : newStores.add(store);
      renderStorePicker();
    }
    else if (act === "price") editPrice(id);
    else if (act === "del") deleteItem(id);
    else if (act === "del-hist") deleteHistory(id);
    else if (act === "quick") quickAdd(btn.dataset.name, store);
  });

  els.storeFilter.addEventListener("change", render);
  els.clearBought.addEventListener("click", archiveBought);
  els.historySearch.addEventListener("input", (e) => {
    historyQuery = e.target.value;
    renderHistory();
  });
  els.viewToggle.addEventListener("click", () => {
    view = view === "list" ? "history" : "list";
    render();
  });

  // Sinkronizacija uživo: lista
  onSnapshot(
    itemsCol,
    (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      setSync(true);
      render();
    },
    (err) => { console.error(err); setSync(false); }
  );

  // Sinkronizacija uživo: povijest
  onSnapshot(
    purchasesCol,
    (snap) => {
      purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => { console.error(err); setSync(false); }
  );
}
