"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
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
  nameBtn: $("name-btn"),
  viewToggle: $("view-toggle"),
  viewList: $("view-list"),
  viewHistory: $("view-history"),
  form: $("add-form"),
  itemInput: $("item-input"),
  qtyInput: $("qty-input"),
  micBtn: $("mic-btn"),
  detailsToggle: $("details-toggle"),
  addDetails: $("add-details"),
  toast: $("toast"),
  suggestList: $("suggest-list"),
  storePicker: $("store-picker"),
  inputSheet: $("input-sheet"),
  sheetTitle: $("sheet-title"),
  sheetInput: $("sheet-input"),
  sheetOk: $("sheet-ok"),
  sheetCancel: $("sheet-cancel"),
  storeFilter: $("store-filter"),
  groupToggle: $("group-toggle"),
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
  archiveModal: $("archive-modal"),
  archiveRows: $("archive-rows"),
  archiveCancel: $("archive-cancel"),
  archiveConfirm: $("archive-confirm"),
};

if (!configured) {
  els.setupNotice.classList.remove("hidden");
  els.viewList.classList.add("hidden");
}

const app = configured ? initializeApp(cfg) : null;
let db = null;
if (configured) {
  // Offline trajni cache (radi i bez interneta, sinkronizira po povratku)
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Offline cache nedostupan, koristim standardni:", e);
    db = getFirestore(app);
  }
}
const itemsCol = db ? collection(db, "items") : null;
const purchasesCol = db ? collection(db, "purchases") : null;

// ── Stanje ─────────────────────────────────────────────────────
let items = [];
let purchases = [];
let filterStore = "";
let view = "list";
let historyQuery = "";
let editingStoresFor = null;
let groupByStore = localStorage.getItem("groupByStore") === "1";
let userName = localStorage.getItem("userName") || "";
let storesTouched = false; // je li korisnik ručno mijenjao dućane u formi
let allNames = []; // svi poznati nazivi (za prijedloge pri tipkanju)
const newStores = new Set();

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
function getStores(item) {
  if (Array.isArray(item.stores)) return item.stores;
  if (item.store) return [item.store];
  return [];
}
function sortStores(arr) {
  return [...arr].sort((a, b) => {
    const ia = STORES.indexOf(a), ib = STORES.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, "hr");
  });
}
// Uobičajeni dućan za artikl (na temelju povijesti)
function usualStoresFor(name) {
  if (!name) return [];
  const key = name.trim().toLowerCase();
  const counts = {};
  for (const p of purchases) {
    if (p.name && p.name.toLowerCase() === key && p.store) {
      counts[p.store] = (counts[p.store] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? [best[0]] : [];
}

// Skini hrvatske dijakritike za usporedbu (č→c, ž→z, đ→d…)
function deaccent(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d");
}
// Prepoznavanje dućana u izgovorenom tekstu
const VOICE_PREP = new Set(["iz", "u", "kod", "na", "sa", "s", "od"]);
const VOICE_SINGLE_STORE = [["Konzum", "konzum"], ["Lidl", "lidl"], ["DM", "dm"]];
const VOICE_TZH_WORDS = new Set([
  "tvornica", "tvornice", "tvornici", "tvornicu",
  "zdrave", "zdrava", "zdravu", "zdravi",
  "hrane", "hranu", "hrana", "tzh",
]);

// Iz fraze ("mlijeko iz konzuma") izvuci naziv i dućan(e)
function extractStores(phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  const norm = words.map(deaccent);
  const remove = new Set();
  const stores = [];

  // Tvornica Zdrave Hrane (više riječi)
  const tzh = norm.map((w, i) => (VOICE_TZH_WORDS.has(w) ? i : -1)).filter((i) => i >= 0);
  if (tzh.length) {
    stores.push("Tvornica Zdrave Hrane");
    tzh.forEach((i) => remove.add(i));
    if (tzh[0] > 0 && VOICE_PREP.has(norm[tzh[0] - 1])) remove.add(tzh[0] - 1);
  }
  // Konzum / Lidl / DM (jednorječni, uz padeže: konzuma, lidlu…)
  for (const [store, stem] of VOICE_SINGLE_STORE) {
    for (let i = 0; i < norm.length; i++) {
      if (remove.has(i)) continue;
      if (norm[i].startsWith(stem) && norm[i].length <= stem.length + 3) {
        stores.push(store);
        remove.add(i);
        if (i > 0 && VOICE_PREP.has(norm[i - 1])) remove.add(i - 1);
        break;
      }
    }
  }
  const name = words.filter((_, i) => !remove.has(i)).join(" ").trim();
  return { name, stores: [...new Set(stores)] };
}

// ── Toast (s opcionalnom akcijom, npr. Poništi) ────────────────
let toastTimer = null;
function toast(msg, actionLabel, actionFn) {
  els.toast.innerHTML = `<span>${esc(msg)}</span>`;
  if (actionLabel) {
    const b = document.createElement("button");
    b.className = "toast-action";
    b.textContent = actionLabel;
    b.addEventListener("click", () => {
      els.toast.classList.remove("show");
      if (actionFn) actionFn();
    });
    els.toast.appendChild(b);
  }
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), actionLabel ? 5000 : 2600);
}

// ── Bottom-sheet za unos vrijednosti (zamjena za prompt) ───────
let sheetResolve = null;
function askSheet(title, value = "", placeholder = "", inputmode = "text") {
  return new Promise((resolve) => {
    sheetResolve = resolve;
    els.sheetTitle.textContent = title;
    els.sheetInput.value = value;
    els.sheetInput.placeholder = placeholder;
    els.sheetInput.setAttribute("inputmode", inputmode);
    els.inputSheet.classList.remove("hidden");
    setTimeout(() => { els.sheetInput.focus(); els.sheetInput.select(); }, 60);
  });
}
function closeSheet(val) {
  els.inputSheet.classList.add("hidden");
  const r = sheetResolve;
  sheetResolve = null;
  if (r) r(val);
}

// ── Glavni render ──────────────────────────────────────────────
function render() {
  els.viewList.classList.toggle("hidden", view !== "list" || !configured);
  els.viewHistory.classList.toggle("hidden", view !== "history");
  els.viewToggle.textContent = view === "list" ? "📜" : "🛒";
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
  const sel = sortStores([...newStores]);
  els.detailsToggle.textContent = sel.length ? `🏪 ${sel.join(", ")} ✓` : "🏪 Dućan i količina";
}

// Predloži uobičajeni dućan za upisani naziv (ako korisnik nije ručno birao)
function applyAutoStore(name) {
  if (storesTouched) return;
  newStores.clear();
  usualStoresFor(name).forEach((s) => newStores.add(s));
  renderStorePicker();
}

// Vlastiti prijedlozi — pojave se tek od 2. znaka, ne otvaraju se na prazno polje
function renderSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) { hideSuggestions(); return; }
  const matches = allNames
    .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
    .slice(0, 6);
  if (!matches.length) { hideSuggestions(); return; }
  els.suggestList.innerHTML = matches
    .map((n) => `<li class="suggest-item" data-act="suggest" data-name="${esc(n)}">${esc(n)}</li>`)
    .join("");
  els.suggestList.classList.remove("hidden");
}
function hideSuggestions() {
  els.suggestList.classList.add("hidden");
  els.suggestList.innerHTML = "";
}

function renderList() {
  renderStorePicker();
  els.groupToggle.classList.toggle("active", groupByStore);

  const used = sortStores([...new Set(items.flatMap(getStores).filter(Boolean))]);
  const prevFilter = els.storeFilter.value;
  els.storeFilter.innerHTML =
    '<option value="">Svi</option>' +
    used.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  els.storeFilter.value = used.includes(prevFilter) ? prevFilter : "";
  filterStore = els.storeFilter.value;

  allNames = [...new Set([...items.map((i) => i.name), ...purchases.map((p) => p.name)])].sort();

  renderQuickAdd();

  const visible = items.filter((i) => !filterStore || getStores(i).includes(filterStore));
  const active = visible.filter((i) => !i.bought);
  const bought = visible.filter((i) => i.bought);

  els.activeList.innerHTML = renderActiveItems(active);
  els.boughtList.innerHTML = bought.map(renderItem).join("");

  els.activeCount.textContent = active.length;
  els.boughtCount.textContent = bought.length;
  els.emptyActive.classList.toggle("hidden", active.length > 0);
  els.boughtSection.classList.toggle("hidden", bought.length === 0);
}

// Aktivne stavke — grupirano po dućanu ili ravno
function renderActiveItems(active) {
  if (!groupByStore) return active.map(renderItem).join("");
  const groups = {};
  for (const it of active) {
    const key = sortStores(getStores(it))[0] || "Bez dućana";
    (groups[key] ||= []).push(it);
  }
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = STORES.indexOf(a), ib = STORES.indexOf(b);
    return (ia === -1 ? 98 : ia) - (ib === -1 ? 98 : ib) || a.localeCompare(b, "hr");
  });
  return keys
    .map(
      (k) =>
        `<li class="group-head">${esc(k)} <span class="count">${groups[k].length}</span></li>` +
        groups[k].map(renderItem).join("")
    )
    .join("");
}

function renderItem(item) {
  const stores = sortStores(getStores(item));
  const storeBadges = stores.map((s) => `<span class="store-badge">📍 ${esc(s)}</span>`).join("");
  const editBtn = `<button class="store-badge edit ${stores.length ? "" : "empty"}"
      data-act="edit-stores" data-id="${item.id}">${stores.length ? "✏️" : "+ dućan"}</button>`;

  const qty = item.qty
    ? `<button class="qty-badge" data-act="qty" data-id="${item.id}">×${esc(item.qty)}</button>`
    : `<button class="qty-badge empty" data-act="qty" data-id="${item.id}">+ kol.</button>`;

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

  const priceTxt = fmtPrice(item.price);
  const price = item.bought
    ? (priceTxt
        ? `<button class="price-badge" data-act="price" data-id="${item.id}">💰 ${priceTxt}</button>`
        : `<button class="price-badge empty" data-act="price" data-id="${item.id}">💰 cijena</button>`)
    : "";

  const who = item.added_by ? `<span class="who">👤 ${esc(item.added_by)}</span>` : "";

  return `
    <li class="item swipeable ${item.bought ? "done" : ""}" data-act="toggle" data-id="${item.id}">
      <div class="item-bg"><span class="item-bg-icon">🗑️ Obriši</span></div>
      <div class="item-inner">
        <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
          ${item.bought ? "✓" : ""}
        </button>
        <div class="item-body">
          <div class="item-name">${esc(item.name)} ${who}</div>
          <div class="badges">${storeBadges}${editBtn}${qty}${price}</div>
          ${editor}
        </div>
        <button class="btn-del" data-act="del" data-id="${item.id}" aria-label="Obriši">×</button>
      </div>
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
      map[key] = { name: p.name, count: 0, lastAt: 0, lastStore: null, prices: [], perStore: {} };
    }
    const e = map[key];
    e.count++;
    if ((p.purchased_at || 0) > e.lastAt) {
      e.lastAt = p.purchased_at || 0;
      e.lastStore = p.store || null;
    }
    if (typeof p.price === "number" && !isNaN(p.price)) {
      const st = p.store || "—";
      e.prices.push({ price: p.price, store: st, at: p.purchased_at || 0 });
      const ps = (e.perStore[st] ||= { min: Infinity, last: null, lastAt: 0, count: 0 });
      ps.count++;
      ps.min = Math.min(ps.min, p.price);
      if ((p.purchased_at || 0) >= ps.lastAt) { ps.lastAt = p.purchased_at || 0; ps.last = p.price; }
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
      const entries = Object.entries(s.perStore).sort((a, b) => a[1].min - b[1].min);
      const cheapest = entries[0][0];
      const rows = entries
        .map(([st, ps]) => {
          const extra = ps.count > 1 ? ` <small>(min ${ps.min.toFixed(2)})</small>` : "";
          return `<div class="price-row ${st === cheapest ? "cheapest" : ""}">
                    <span>${st === cheapest ? "🏆 " : ""}${esc(st)}</span>
                    <span>${ps.last.toFixed(2)} €${extra}</span>
                  </div>`;
        })
        .join("");
      return `<li class="item col"><div class="item-body">
                <div class="item-name">${esc(s.name)}</div>
                <div class="price-table">${rows}</div>
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
      if (p.bought_by) parts.push("👤 " + esc(p.bought_by));
      return `<li class="item">
                <div class="item-body">
                  <div class="item-name">${esc(p.name)}${p.qty ? ` ×${esc(p.qty)}` : ""}</div>
                  <div class="muted-line">${parts.join(" · ")}</div>
                </div>
                <button class="btn-del" data-act="del-hist" data-id="${p.id}" aria-label="Obriši">×</button>
              </li>`;
    })
    .join("");
}

// ── Akcije: lista ──────────────────────────────────────────────
async function addItem(name, stores, qty) {
  let st = stores && stores.length ? stores : usualStoresFor(name);
  try {
    await addDoc(itemsCol, {
      name,
      stores: st || [],
      store: null,
      qty: qty || null,
      bought: false,
      bought_at: null,
      price: null,
      added_by: userName || null,
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

async function toggleItemStore(id, store) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const cur = new Set(getStores(item));
  cur.has(store) ? cur.delete(store) : cur.add(store);
  try {
    await updateDoc(doc(db, "items", id), { stores: [...cur], store: null });
  } catch (e) { console.error(e); setSync(false); }
}

async function editQty(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const value = await askSheet(`Količina — ${item.name}`, item.qty || "", "npr. 2 ili 1 kg");
  if (value === null) return;
  try {
    await updateDoc(doc(db, "items", id), { qty: value.trim() || null });
  } catch (e) { console.error(e); setSync(false); }
}

async function editPrice(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const value = await askSheet(`Cijena — ${item.name}`, item.price != null ? String(item.price) : "", "npr. 1,99", "decimal");
  if (value === null) return;
  try {
    await updateDoc(doc(db, "items", id), { price: parsePrice(value) });
  } catch (e) { console.error(e); setSync(false); }
}

// Brisanje s mogućnošću poništavanja
async function deleteItem(id) {
  const item = items.find((i) => i.id === id);
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

function quickAdd(name, store) {
  addItem(name, store ? [store] : [], null);
}

// ── Dijalog: spremanje u povijest ──────────────────────────────
function openArchiveModal() {
  const bought = items.filter((i) => i.bought);
  if (bought.length === 0) return;
  els.archiveRows.innerHTML = bought
    .map((it) => {
      const primary = sortStores(getStores(it))[0] || "";
      const chips = STORES.map(
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
function closeArchiveModal() {
  els.archiveModal.classList.add("hidden");
}
async function confirmArchive() {
  const rows = [...els.archiveRows.querySelectorAll(".archive-row")];
  try {
    const batch = writeBatch(db);
    for (const row of rows) {
      const id = row.dataset.id;
      const it = items.find((i) => i.id === id);
      if (!it) continue;
      const selected = row.querySelector(".store-chip.selected");
      const store = selected ? selected.dataset.store : null;
      const price = parsePrice(row.querySelector(".archive-price").value);
      batch.set(doc(purchasesCol), {
        name: it.name,
        qty: it.qty || null,
        store,
        price,
        bought_by: userName || null,
        purchased_at: it.bought_at || Date.now(),
      });
      batch.delete(doc(db, "items", id));
    }
    await batch.commit();
    closeArchiveModal();
  } catch (e) { console.error(e); setSync(false); }
}

async function deleteHistory(id) {
  const p = purchases.find((x) => x.id === id);
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

// ── Glasovni unos (Web Speech API) ─────────────────────────────
let recognition = null;
let listening = false;
const VOICE_CMD = /^(dodaj|dodati|daj|kupi|kupit|kupiti|treba(m|mo)?|trebalo bi)\s+/i;

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { els.micBtn.classList.add("hidden"); return; }
  recognition = new SR();
  recognition.lang = "hr-HR";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    let interim = "", final = "";
    for (const res of e.results) {
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (final) { processVoice(final); els.itemInput.value = ""; }
    else els.itemInput.value = interim;
  };
  recognition.onend = () => stopVoiceUI();
  recognition.onerror = (e) => {
    stopVoiceUI();
    if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Mikrofon nije dopušten 🎤");
    else if (e.error === "no-speech") toast("Nisam ništa čuo 🤔");
  };
}
function stopVoiceUI() {
  listening = false;
  els.micBtn.classList.remove("listening");
  els.itemInput.placeholder = "Dodaj stavku (npr. mlijeko)";
}
function toggleVoice() {
  if (!recognition) return;
  if (listening) { recognition.stop(); return; }
  try {
    recognition.start();
    listening = true;
    els.micBtn.classList.add("listening");
    els.itemInput.value = "";
    els.itemInput.placeholder = "Slušam… 🎤";
  } catch (e) { console.error(e); }
}
function processVoice(text) {
  let t = text.trim().replace(/[.!?]+$/, "").replace(VOICE_CMD, "");
  const parts = t.split(/\s*,\s*|\s+i\s+|\s+pa\s+|\s+te\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return;

  const picked = sortStores([...newStores]); // ručno odabrani dućani u formi
  const added = [];
  for (let part of parts) {
    part = part.replace(VOICE_CMD, "").trim(); // npr. "dodaj kruh i dodaj mlijeko"
    if (!part) continue;
    const { name, stores } = extractStores(part);
    if (!name) continue;
    const finalStores = stores.length ? stores : picked;
    addItem(name, finalStores, null);
    added.push(name + (stores.length ? ` → ${stores.join(", ")}` : ""));
  }
  if (added.length) toast(`Dodano: ${added.join(" · ")} ✓`);
}

// ── Swipe za brisanje (lijevo) ─────────────────────────────────
let swipe = null;
let suppressClickUntil = 0; // spriječi "tap = kupljeno" odmah nakon swipea
function initSwipe() {
  document.addEventListener("touchstart", (e) => {
    const li = e.target.closest(".item.swipeable[data-id]");
    if (!li || !els.viewList.contains(li)) return;
    if (e.target.closest("button, input, select, .store-editor")) return;
    const inner = li.querySelector(".item-inner");
    swipe = { li, inner, id: li.dataset.id, x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false, dx: 0 };
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!swipe) return;
    const dx = e.touches[0].clientX - swipe.x;
    const dy = e.touches[0].clientY - swipe.y;
    if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
      swipe.moved = true;
      swipe.dx = Math.max(dx, -130);
      swipe.inner.style.transition = "none";
      swipe.inner.style.transform = `translateX(${swipe.dx}px)`;
      swipe.li.classList.toggle("will-delete", swipe.dx <= -80);
    }
  }, { passive: true });

  document.addEventListener("touchend", () => {
    if (!swipe) return;
    const { li, inner } = swipe;
    if (swipe.moved) suppressClickUntil = Date.now() + 450;
    inner.style.transition = "";
    if (swipe.dx <= -80) {
      inner.style.transform = "translateX(-100%)";
      inner.style.opacity = "0";
      deleteItem(swipe.id);
    } else {
      inner.style.transform = "";
      li.classList.remove("will-delete");
    }
    swipe = null;
  });
}

// ── Event listeneri ────────────────────────────────────────────
if (configured) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.itemInput.value.trim();
    if (!name) return;
    addItem(name, sortStores([...newStores]), els.qtyInput.value.trim());
    els.itemInput.value = "";
    els.qtyInput.value = "";
    newStores.clear();
    storesTouched = false;
    renderStorePicker();
    hideSuggestions();
    els.itemInput.focus();
  });

  // Pri tipkanju: prijedlozi + automatski predloženi dućan
  els.itemInput.addEventListener("input", () => {
    applyAutoStore(els.itemInput.value);
    renderSuggestions(els.itemInput.value);
  });
  els.itemInput.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 150); // odgoda da klik na prijedlog stigne
  });

  document.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil) { suppressClickUntil = 0; return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, id, store } = btn.dataset;
    if (act === "toggle") {
      if (e.target.closest(".store-editor")) return; // ne prebacuj dok uređuješ dućane
      toggleBought(id);
    }
    else if (act === "edit-stores") { editingStoresFor = editingStoresFor === id ? null : id; render(); }
    else if (act === "toggle-item-store") toggleItemStore(id, store);
    else if (act === "close-store-edit") { editingStoresFor = null; render(); }
    else if (act === "toggle-new-store") {
      storesTouched = true;
      newStores.has(store) ? newStores.delete(store) : newStores.add(store);
      renderStorePicker();
    }
    else if (act === "archive-store") {
      const row = btn.closest(".archive-row");
      const was = btn.classList.contains("selected");
      row.querySelectorAll(".store-chip").forEach((c) => c.classList.remove("selected"));
      if (!was) btn.classList.add("selected");
    }
    else if (act === "qty") editQty(id);
    else if (act === "price") editPrice(id);
    else if (act === "del") deleteItem(id);
    else if (act === "del-hist") deleteHistory(id);
    else if (act === "quick") quickAdd(btn.dataset.name, store);
    else if (act === "suggest") {
      els.itemInput.value = btn.dataset.name;
      applyAutoStore(btn.dataset.name);
      hideSuggestions();
      els.itemInput.focus();
    }
  });

  els.storeFilter.addEventListener("change", render);
  els.groupToggle.addEventListener("click", () => {
    groupByStore = !groupByStore;
    localStorage.setItem("groupByStore", groupByStore ? "1" : "0");
    render();
  });
  els.clearBought.addEventListener("click", openArchiveModal);
  els.archiveCancel.addEventListener("click", closeArchiveModal);
  els.archiveConfirm.addEventListener("click", confirmArchive);
  els.archiveModal.addEventListener("click", (e) => {
    if (e.target === els.archiveModal) closeArchiveModal();
  });
  els.historySearch.addEventListener("input", (e) => {
    historyQuery = e.target.value;
    renderHistory();
  });
  els.viewToggle.addEventListener("click", () => {
    view = view === "list" ? "history" : "list";
    render();
  });
  els.nameBtn.addEventListener("click", async () => {
    const v = await askSheet("Tvoje ime", userName, "npr. Vedran");
    if (v === null) return;
    userName = v.trim();
    localStorage.setItem("userName", userName);
    toast(userName ? `Bok, ${userName}! 👋` : "Ime uklonjeno");
  });

  // Otkrivanje detalja (dućan/količina)
  els.detailsToggle.addEventListener("click", () => els.addDetails.classList.toggle("hidden"));

  // Bottom-sheet za unos vrijednosti
  els.sheetOk.addEventListener("click", () => closeSheet(els.sheetInput.value));
  els.sheetCancel.addEventListener("click", () => closeSheet(null));
  els.sheetInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); closeSheet(els.sheetInput.value); }
  });
  els.inputSheet.addEventListener("click", (e) => {
    if (e.target === els.inputSheet) closeSheet(null);
  });

  els.micBtn.addEventListener("click", toggleVoice);
  initVoice();
  initSwipe();

  onSnapshot(itemsCol, (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    setSync(true);
    render();
  }, (err) => { console.error(err); setSync(false); });

  onSnapshot(purchasesCol, (snap) => {
    purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => { console.error(err); setSync(false); });
}

// ── Service worker (offline / PWA) ─────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  });
}
