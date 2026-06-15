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

// ── Konfiguracija / inicijalizacija ────────────────────────────
const cfg = (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig) || {};
const configured = cfg.apiKey && cfg.projectId;

const $ = (id) => document.getElementById(id);

const els = {
  setupNotice: $("setup-notice"),
  form: $("add-form"),
  itemInput: $("item-input"),
  storeInput: $("store-input"),
  suggestions: $("suggestions"),
  storeSuggestions: $("store-suggestions"),
  storeFilter: $("store-filter"),
  activeList: $("active-list"),
  boughtList: $("bought-list"),
  boughtSection: $("bought-section"),
  emptyActive: $("empty-active"),
  activeCount: $("active-count"),
  boughtCount: $("bought-count"),
  clearBought: $("clear-bought"),
  syncDot: $("sync-dot"),
};

if (!configured) {
  els.setupNotice.classList.remove("hidden");
  els.form.classList.add("hidden");
}

const app = configured ? initializeApp(cfg) : null;
const db = configured ? getFirestore(app) : null;
const itemsCol = db ? collection(db, "items") : null;

// Lokalna kopija stavki (sinkronizirana s bazom preko onSnapshot)
let items = [];
let filterStore = "";

// ── Prikaz ─────────────────────────────────────────────────────
function render() {
  // Popuni filter dućana
  const stores = [...new Set(items.map((i) => i.store).filter(Boolean))].sort();
  const prevFilter = els.storeFilter.value;
  els.storeFilter.innerHTML =
    '<option value="">Svi</option>' +
    stores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  els.storeFilter.value = stores.includes(prevFilter) ? prevFilter : "";
  filterStore = els.storeFilter.value;

  // Prijedlozi za autocomplete (iz prošlih unosa)
  const names = [...new Set(items.map((i) => i.name))].sort();
  els.suggestions.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
  els.storeSuggestions.innerHTML = stores.map((s) => `<option value="${esc(s)}">`).join("");

  const visible = items.filter((i) => !filterStore || i.store === filterStore);
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
  const store = item.store
    ? `<button class="store-badge" data-act="store" data-id="${item.id}">📍 ${esc(item.store)}</button>`
    : `<button class="store-badge empty" data-act="store" data-id="${item.id}">+ dućan</button>`;
  return `
    <li class="item ${item.bought ? "done" : ""}">
      <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
        ${item.bought ? "✓" : ""}
      </button>
      <div class="item-body">
        <div class="item-name">${esc(item.name)}</div>
        ${store}
      </div>
      <button class="btn-del" data-act="del" data-id="${item.id}" aria-label="Obriši">×</button>
    </li>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function setSync(ok) {
  els.syncDot.className = "sync-dot " + (ok ? "online" : "offline");
}

// ── Akcije ─────────────────────────────────────────────────────
async function addItem(name, store) {
  try {
    await addDoc(itemsCol, {
      name,
      store: store || null,
      bought: false,
      bought_at: null,
      created_at: Date.now(),
    });
  } catch (e) {
    console.error(e);
    setSync(false);
  }
}

async function toggleBought(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = !item.bought;
  try {
    await updateDoc(doc(db, "items", id), {
      bought: next,
      bought_at: next ? Date.now() : null,
    });
  } catch (e) {
    console.error(e);
    setSync(false);
  }
}

async function editStore(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const value = prompt("U kojem dućanu se kupuje?", item.store || "");
  if (value === null) return; // odustao
  try {
    await updateDoc(doc(db, "items", id), { store: value.trim() || null });
  } catch (e) {
    console.error(e);
    setSync(false);
  }
}

async function deleteItem(id) {
  try {
    await deleteDoc(doc(db, "items", id));
  } catch (e) {
    console.error(e);
    setSync(false);
  }
}

async function clearBought() {
  if (!confirm("Obrisati sve kupljene stavke?")) return;
  try {
    const snap = await getDocs(query(itemsCol, where("bought", "==", true)));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error(e);
    setSync(false);
  }
}

// ── Event listeneri ────────────────────────────────────────────
if (configured) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.itemInput.value.trim();
    if (!name) return;
    addItem(name, els.storeInput.value.trim());
    els.itemInput.value = "";
    els.storeInput.value = "";
    els.itemInput.focus();
  });

  // Delegirani klikovi na listama
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === "toggle") toggleBought(id);
    else if (act === "store") editStore(id);
    else if (act === "del") deleteItem(id);
  });

  els.storeFilter.addEventListener("change", render);
  els.clearBought.addEventListener("click", clearBought);

  // Sinkronizacija uživo između uređaja
  onSnapshot(
    itemsCol,
    (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      setSync(true);
      render();
    },
    (err) => {
      console.error(err);
      setSync(false);
    }
  );
}
