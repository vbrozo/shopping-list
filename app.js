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
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Verzija (za prikaz i provjeru je li nova učitana) ──────────
const APP_VERSION = "19";

// ── Dućani (uredivi u Postavkama; spremaju se u Firestore) ─────
const DEFAULT_STORES = ["Konzum", "DM", "Lidl", "Tvornica Zdrave Hrane"];
let STORES = [...DEFAULT_STORES];

// ── Količina: vrijednosti i jedinice ───────────────────────────
const QTY_VALUES = ["", "0.5", "1", "1.5", "2", "2.5", "3", "4", "5", "6", "7", "8", "9", "10"];
const QTY_UNITS = ["kom", "kg", "l"];
let addUnit = "kom"; // odabrana jedinica u formi za dodavanje

// ── Konfiguracija / inicijalizacija ────────────────────────────
const cfg = (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig) || {};
const configured = cfg.apiKey && cfg.projectId;

const $ = (id) => document.getElementById(id);
const els = {
  setupNotice: $("setup-notice"),
  appTitle: $("app-title"),
  settingsBtn: $("settings-btn"),
  viewToggle: $("view-toggle"),
  viewList: $("view-list"),
  viewHistory: $("view-history"),
  viewSettings: $("view-settings"),
  settingsBack: $("settings-back"),
  themeOptions: $("theme-options"),
  settingsStores: $("settings-stores"),
  addStoreForm: $("add-store-form"),
  newStoreInput: $("new-store-input"),
  nameForm: $("name-form"),
  nameInput: $("name-input"),
  nameSubmit: $("name-submit"),
  refreshBtn: $("refresh-btn"),
  appVer: $("app-ver"),
  form: $("add-form"),
  itemInput: $("item-input"),
  qtyValue: $("qty-value"),
  qtyUnits: $("qty-units"),
  editSheet: $("edit-sheet"),
  editName: $("edit-name"),
  editQtyValue: $("edit-qty-value"),
  editQtyUnits: $("edit-qty-units"),
  editStores: $("edit-stores"),
  editPrice: $("edit-price"),
  editSave: $("edit-save"),
  editCancel: $("edit-cancel"),
  histSheet: $("hist-sheet"),
  histName: $("hist-name"),
  histQtyValue: $("hist-qty-value"),
  histQtyUnits: $("hist-qty-units"),
  histStores: $("hist-stores"),
  histPrice: $("hist-price"),
  histDate: $("hist-date"),
  histSave: $("hist-save"),
  histCancel: $("hist-cancel"),
  micBtn: $("mic-btn"),
  detailsToggle: $("details-toggle"),
  addDetails: $("add-details"),
  toast: $("toast"),
  suggestList: $("suggest-list"),
  storePicker: $("store-picker"),
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

// ── Tema (svijetlo / tamno) — radi i prije Firebasea ───────────
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
function effectiveTheme() {
  const stored = localStorage.getItem("theme");
  return stored === "dark" || stored === "light" ? stored : (themeMedia.matches ? "dark" : "light");
}
function applyTheme() {
  document.documentElement.classList.toggle("dark", effectiveTheme() === "dark");
}
function currentThemeChoice() {
  const t = localStorage.getItem("theme");
  return t === "dark" || t === "light" ? t : "auto";
}
function setThemeChoice(choice) {
  if (choice === "auto") localStorage.removeItem("theme");
  else localStorage.setItem("theme", choice);
  applyTheme();
}
themeMedia.addEventListener("change", () => {
  if (!localStorage.getItem("theme")) applyTheme(); // prati sustav dok nije ručno postavljeno
});
applyTheme();

// ── Tvrdo osvježi (za fazu testiranja): odjavi SW, očisti cache, reload ─
els.appVer.textContent = "v" + APP_VERSION;
els.refreshBtn.addEventListener("click", async () => {
  els.refreshBtn.textContent = "Osvježavam…";
  els.refreshBtn.disabled = true;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn("Hard refresh:", e); }
  location.reload();
});

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
const settingsDoc = db ? doc(db, "settings", "app") : null;

// ── Stanje ─────────────────────────────────────────────────────
let items = [];
let purchases = [];
let filterStore = "";
let view = "list";
let historyQuery = "";
let editId = null; // stavka koja se trenutno uređuje u editoru
let editUnit = "kom"; // odabrana jedinica u editoru
const editStores = new Set(); // odabrani dućani u editoru
let histId = null; // zapis povijesti koji se uređuje
let histUnit = "kom"; // jedinica u editoru povijesti
let histStore = ""; // dućan u editoru povijesti (jedan)
let groupByStore = localStorage.getItem("groupByStore") === "1";
let userName = localStorage.getItem("userName") || "";
let storesTouched = false; // je li korisnik ručno mijenjao dućane u formi
let allNames = []; // svi poznati nazivi (za prijedloge pri tipkanju)
let nameEditing = false; // je li polje imena trenutno u načinu uređivanja
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
function msToDateInput(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dateInputToMs(v, fallback) {
  if (!v) return fallback;
  const ms = new Date(v + "T12:00:00").getTime();
  return isNaN(ms) ? fallback : ms;
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
// Usporedba korijena riječi (tolerira padeže: konzuma~konzum, tvornice~tvornica)
function sameStem(token, word) {
  const n = Math.min(token.length, word.length);
  if (n < 3) return token === word;
  const k = Math.max(3, n - 2);
  return token.slice(0, k) === word.slice(0, k);
}

// Iz fraze ("mlijeko iz konzuma") izvuci naziv i dućan(e) — radi za bilo
// koje dućane iz trenutne liste STORES
function extractStores(phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  const norm = words.map(deaccent);
  const remove = new Set();
  const found = [];

  for (const store of STORES) {
    const sw = deaccent(store).split(/\s+/).filter((w) => w.length >= 2);
    const idxs = [];
    for (let i = 0; i < norm.length; i++) {
      if (remove.has(i)) continue;
      if (sw.some((w) => sameStem(norm[i], w))) idxs.push(i);
    }
    if (idxs.length) {
      found.push(store);
      idxs.forEach((i) => remove.add(i));
      const first = Math.min(...idxs);
      if (first > 0 && VOICE_PREP.has(norm[first - 1])) remove.add(first - 1);
    }
  }
  const name = words.filter((_, i) => !remove.has(i)).join(" ").trim();
  return { name, stores: [...new Set(found)] };
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

// ── Kontrola količine (dropdown vrijednosti + jedinice kom/kg/l) ─
function qtyOptionsHTML(sel) {
  const vals = (!sel || QTY_VALUES.includes(sel)) ? QTY_VALUES : [...QTY_VALUES, sel];
  return vals
    .map((v) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${v === "" ? "–" : esc(v)}</option>`)
    .join("");
}
function unitChipsHTML(selected, act) {
  return QTY_UNITS
    .map((u) => `<button type="button" class="unit-chip ${u === selected ? "selected" : ""}" data-act="${act}" data-unit="${esc(u)}">${esc(u)}</button>`)
    .join("");
}
function buildQty(value, unit) {
  const v = (value || "").trim();
  if (!v) return null;
  return unit ? `${v} ${unit}` : v;
}
function parseQty(s) {
  s = (s || "").trim();
  if (!s) return { value: "", unit: "kom" };
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  let value = m ? m[1].replace(",", ".") : "";
  let unit = m ? m[2].trim() : "";
  if (!QTY_UNITS.includes(unit)) unit = "";
  return { value, unit };
}
function initAddQty() {
  els.qtyValue.innerHTML = qtyOptionsHTML("");
  renderAddUnits();
}
function renderAddUnits() {
  els.qtyUnits.innerHTML = unitChipsHTML(addUnit, "qty-unit");
}

// ── Editor stavke (jedan bottom-sheet za sve) ──────────────────
function openEditSheet(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  editId = id;
  els.editName.value = item.name;
  const { value, unit } = parseQty(item.qty || "");
  editUnit = unit;
  els.editQtyValue.innerHTML = qtyOptionsHTML(value);
  els.editQtyUnits.innerHTML = unitChipsHTML(editUnit, "edit-qty-unit");
  editStores.clear();
  getStores(item).forEach((s) => editStores.add(s));
  renderEditStores();
  els.editPrice.value = item.price != null ? String(item.price) : "";
  els.editSheet.classList.remove("hidden");
}
function renderEditStores() {
  els.editStores.innerHTML = STORES
    .map((s) => `<button type="button" class="store-chip ${editStores.has(s) ? "selected" : ""}" data-act="edit-store" data-store="${esc(s)}">${esc(s)}</button>`)
    .join("");
}
function closeEditSheet() {
  els.editSheet.classList.add("hidden");
  editId = null;
}
async function saveEdit() {
  if (!editId) return;
  const name = els.editName.value.trim();
  if (!name) { toast("Naziv ne može biti prazan"); return; }
  try {
    await updateDoc(doc(db, "items", editId), {
      name,
      qty: buildQty(els.editQtyValue.value, editUnit) || null,
      stores: sortStores([...editStores]),
      store: null,
      price: parsePrice(els.editPrice.value),
    });
    closeEditSheet();
  } catch (e) { console.error(e); setSync(false); }
}

// ── Editor zapisa povijesti ────────────────────────────────────
function openHistSheet(id) {
  const p = purchases.find((x) => x.id === id);
  if (!p) return;
  histId = id;
  els.histName.value = p.name;
  const { value, unit } = parseQty(p.qty || "");
  histUnit = unit;
  els.histQtyValue.innerHTML = qtyOptionsHTML(value);
  els.histQtyUnits.innerHTML = unitChipsHTML(histUnit, "hist-qty-unit");
  histStore = p.store || "";
  renderHistStores();
  els.histPrice.value = p.price != null ? String(p.price) : "";
  els.histDate.value = msToDateInput(p.purchased_at);
  els.histSheet.classList.remove("hidden");
}
function renderHistStores() {
  els.histStores.innerHTML = STORES
    .map((s) => `<button type="button" class="store-chip ${s === histStore ? "selected" : ""}" data-act="hist-store" data-store="${esc(s)}">${esc(s)}</button>`)
    .join("");
}
function closeHistSheet() {
  els.histSheet.classList.add("hidden");
  histId = null;
}
async function saveHist() {
  if (!histId) return;
  const name = els.histName.value.trim();
  if (!name) { toast("Naziv ne može biti prazan"); return; }
  const p = purchases.find((x) => x.id === histId);
  try {
    await updateDoc(doc(db, "purchases", histId), {
      name,
      qty: buildQty(els.histQtyValue.value, histUnit) || null,
      store: histStore || null,
      price: parsePrice(els.histPrice.value),
      purchased_at: dateInputToMs(els.histDate.value, p ? p.purchased_at : Date.now()),
    });
    closeHistSheet();
  } catch (e) { console.error(e); setSync(false); }
}

// ── Glavni render ──────────────────────────────────────────────
function render() {
  els.viewList.classList.toggle("hidden", view !== "list" || !configured);
  els.viewHistory.classList.toggle("hidden", view !== "history");
  els.viewSettings.classList.toggle("hidden", view !== "settings");
  els.viewToggle.textContent = view === "list" ? "📜" : "🛒";
  els.appTitle.textContent =
    view === "settings" ? "⚙️ Postavke" : view === "history" ? "📜 Povijest" : "🛒 Lista za kupovinu";
  if (view === "list") renderList();
  else if (view === "history") renderHistory();
  else renderSettings();
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

// Jedinstvena kartica: red 1 = naziv + količina; red 2 = meta (dućani · cijena · tko)
function renderItem(item) {
  const stores = sortStores(getStores(item));
  let storeText;
  if (stores.length === 0) {
    storeText = `<span class="meta-empty">bez dućana</span>`;
  } else {
    const shown = stores.slice(0, 2).map(esc).join(", ");
    const extra = stores.length > 2 ? ` +${stores.length - 2}` : "";
    storeText = `📍 ${shown}${extra}`;
  }
  const meta = [storeText];
  const priceTxt = item.bought ? fmtPrice(item.price) : null;
  if (priceTxt) meta.push(`💰 ${priceTxt}`);
  if (item.added_by) meta.push(`👤 ${esc(item.added_by)}`);

  const qtyTag = item.qty ? `<span class="qty-tag">×${esc(item.qty)}</span>` : "";

  return `
    <li class="item swipeable ${item.bought ? "done" : ""}" data-id="${item.id}">
      <div class="item-bg"><span class="item-bg-icon">🗑️ Obriši</span></div>
      <div class="item-inner">
        <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
          ${item.bought ? "✓" : ""}
        </button>
        <div class="item-main" data-act="edit-item" data-id="${item.id}">
          <div class="item-row1">
            <span class="item-name">${esc(item.name)}</span>
            ${qtyTag}
          </div>
          <div class="item-meta">${meta.join(" · ")}</div>
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
                <div class="item-main" data-act="edit-hist" data-id="${p.id}">
                  <div class="item-name">${esc(p.name)}${p.qty ? ` ×${esc(p.qty)}` : ""}</div>
                  <div class="muted-line">${parts.join(" · ")}</div>
                </div>
                <button class="btn-del" data-act="del-hist" data-id="${p.id}" aria-label="Obriši">×</button>
              </li>`;
    })
    .join("");
}

// ── Render: POSTAVKE ───────────────────────────────────────────
function renderSettings() {
  // Tema — istakni odabir
  const choice = currentThemeChoice();
  [...els.themeOptions.querySelectorAll(".seg-btn")].forEach((b) =>
    b.classList.toggle("selected", b.dataset.theme === choice)
  );
  // Dućani
  els.settingsStores.innerHTML = STORES.map(
    (s) =>
      `<li class="item"><div class="item-body"><div class="item-name">${esc(s)}</div></div>
         <button class="btn-del" data-act="store-del" data-store="${esc(s)}" aria-label="Obriši">×</button></li>`
  ).join("");
  // Ime — kad je spremljeno, polje je zaključano, a gumb piše "Uredi"
  els.nameInput.value = userName;
  const locked = !!userName && !nameEditing;
  els.nameInput.disabled = locked;
  els.nameSubmit.textContent = locked ? "Uredi" : "Spremi";
}

// Spremi listu dućana u Firestore (zajednički)
async function saveStores(list) {
  try {
    await setDoc(settingsDoc, { stores: list }, { merge: true });
  } catch (e) { console.error(e); setSync(false); }
}
function addStore(name) {
  name = name.trim();
  if (!name) return;
  if (STORES.some((s) => s.toLowerCase() === name.toLowerCase())) { toast("Taj dućan već postoji"); return; }
  saveStores([...STORES, name]);
}
function removeStore(name) {
  saveStores(STORES.filter((s) => s !== name));
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
    addItem(name, sortStores([...newStores]), buildQty(els.qtyValue.value, addUnit));
    els.itemInput.value = "";
    els.qtyValue.value = "";
    addUnit = "kom";
    renderAddUnits();
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
    if (act === "toggle") toggleBought(id);
    else if (act === "edit-item") openEditSheet(id);
    else if (act === "edit-store") {
      editStores.has(store) ? editStores.delete(store) : editStores.add(store);
      renderEditStores();
    }
    else if (act === "edit-qty-unit") {
      editUnit = editUnit === btn.dataset.unit ? "" : btn.dataset.unit;
      els.editQtyUnits.innerHTML = unitChipsHTML(editUnit, "edit-qty-unit");
    }
    else if (act === "edit-hist") openHistSheet(id);
    else if (act === "hist-store") {
      histStore = histStore === btn.dataset.store ? "" : btn.dataset.store;
      renderHistStores();
    }
    else if (act === "hist-qty-unit") {
      histUnit = histUnit === btn.dataset.unit ? "" : btn.dataset.unit;
      els.histQtyUnits.innerHTML = unitChipsHTML(histUnit, "hist-qty-unit");
    }
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
    else if (act === "qty-unit") {
      addUnit = addUnit === btn.dataset.unit ? "" : btn.dataset.unit;
      renderAddUnits();
    }
    else if (act === "del") deleteItem(id);
    else if (act === "del-hist") deleteHistory(id);
    else if (act === "quick") quickAdd(btn.dataset.name, store);
    else if (act === "suggest") {
      els.itemInput.value = btn.dataset.name;
      applyAutoStore(btn.dataset.name);
      hideSuggestions();
      els.itemInput.focus();
    }
    else if (act === "theme-set") { setThemeChoice(btn.dataset.theme); renderSettings(); }
    else if (act === "store-del") removeStore(btn.dataset.store);
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
    view = view === "history" ? "list" : "history";
    render();
  });
  els.settingsBtn.addEventListener("click", () => { view = "settings"; render(); });
  els.settingsBack.addEventListener("click", () => { view = "list"; render(); });

  // Dodavanje dućana
  els.addStoreForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addStore(els.newStoreInput.value);
    els.newStoreInput.value = "";
  });
  // Ime: ako je spremljeno -> "Uredi" otključa polje; inače "Spremi" sprema
  els.nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (userName && !nameEditing) {
      nameEditing = true;
      renderSettings();
      els.nameInput.focus();
      return;
    }
    userName = els.nameInput.value.trim();
    localStorage.setItem("userName", userName);
    nameEditing = false;
    toast(userName ? `Spremljeno: ${userName} 👋` : "Ime uklonjeno");
    renderSettings();
  });

  // Otkrivanje detalja (dućan/količina)
  els.detailsToggle.addEventListener("click", () => els.addDetails.classList.toggle("hidden"));

  // Editor stavke
  els.editSave.addEventListener("click", saveEdit);
  els.editCancel.addEventListener("click", closeEditSheet);
  els.editSheet.addEventListener("click", (e) => {
    if (e.target === els.editSheet) closeEditSheet();
  });

  // Editor zapisa povijesti
  els.histSave.addEventListener("click", saveHist);
  els.histCancel.addEventListener("click", closeHistSheet);
  els.histSheet.addEventListener("click", (e) => {
    if (e.target === els.histSheet) closeHistSheet();
  });

  els.micBtn.addEventListener("click", toggleVoice);
  initAddQty();
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

  // Postavke (dućani) — zajednički za sve uređaje
  onSnapshot(settingsDoc, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    STORES = data && Array.isArray(data.stores) && data.stores.length
      ? data.stores.filter((s) => typeof s === "string" && s.trim())
      : [...DEFAULT_STORES];
    render();
  }, (err) => { console.error(err); setSync(false); });
}

// ── Service worker (offline / PWA) ─────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  });
}
