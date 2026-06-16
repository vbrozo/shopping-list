"use strict";

import { state } from "../state.js";
import { els, icon } from "../dom.js";
import {
  esc, sortStores, getStores, fmtPrice, normKey,
  unitChipsHTML, catChipsHTML, usualStoresFor, usualCategoryFor, aggregateByName,
} from "../util.js";

// ── Prolazno stanje forme za dodavanje ─────────────────────────
export const newStores = new Set();
export const addForm = {
  unit: "kom",           // odabrana jedinica u formi za dodavanje
  category: "",          // odabrana kategorija u formi za dodavanje
  storesTouched: false,  // je li korisnik ručno mijenjao dućane u formi
  categoryTouched: false, // je li korisnik ručno mijenjao kategoriju u formi
};

// ── Kontrola količine ──────────────────────────────────────────
export function initAddQty() {
  els.qtyValue.value = "";
  renderAddUnits();
}
export function renderAddUnits() {
  els.qtyUnits.innerHTML = unitChipsHTML(addForm.unit, "qty-unit");
}

export function renderStorePicker() {
  els.storePicker.innerHTML = state.STORES.map(
    (s) =>
      `<button type="button" class="store-chip ${newStores.has(s) ? "selected" : ""}"
         data-act="toggle-new-store" data-store="${esc(s)}">${esc(s)}</button>`
  ).join("");
  const sel = sortStores([...newStores]);
  els.detailsToggle.innerHTML = sel.length
    ? `${icon("bag")} ${esc(sel.join(", "))} ✓`
    : `${icon("bag")} Dućan i količina`;
  renderCatPicker();
}

// Picker kategorije u formi za dodavanje (jedan izbor)
export function renderCatPicker() {
  els.catPicker.innerHTML = catChipsHTML(addForm.category, "toggle-new-cat");
}

// Predloži uobičajeni dućan za upisani naziv (ako korisnik nije ručno birao)
export function applyAutoStore(name) {
  if (!addForm.storesTouched) {
    newStores.clear();
    usualStoresFor(name).forEach((s) => newStores.add(s));
    renderStorePicker();
  }
  if (!addForm.categoryTouched) {
    addForm.category = usualCategoryFor(name);
    renderCatPicker();
  }
}

// Vlastiti prijedlozi — pojave se tek od 2. znaka, ne otvaraju se na prazno polje
export function renderSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) { hideSuggestions(); return; }
  const matches = state.allNames
    .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
    .slice(0, 6);
  if (!matches.length) { hideSuggestions(); return; }
  els.suggestList.innerHTML = matches
    .map((n) => `<li class="suggest-item" data-act="suggest" data-name="${esc(n)}">${esc(n)}</li>`)
    .join("");
  els.suggestList.classList.remove("hidden");
}
export function hideSuggestions() {
  els.suggestList.classList.add("hidden");
  els.suggestList.innerHTML = "";
}

export function renderList() {
  renderStorePicker();
  els.groupToggle.classList.toggle("active", state.groupMode !== "none");
  els.groupLabel.textContent =
    state.groupMode === "store" ? "Dućan" : state.groupMode === "category" ? "Kategorija" : "Grupiraj";

  const used = sortStores([...new Set(state.items.flatMap(getStores).filter(Boolean))]);
  const prevFilter = els.storeFilter.value;
  els.storeFilter.innerHTML =
    '<option value="">Svi</option>' +
    used.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  els.storeFilter.value = used.includes(prevFilter) ? prevFilter : "";
  state.filterStore = els.storeFilter.value;

  // Prijedlozi — po jedan po normaliziranom nazivu (bez duplih varijanti)
  const nameByKey = new Map();
  for (const n of [...state.items.map((i) => i.name), ...state.purchases.map((p) => p.name)]) {
    const k = normKey(n);
    if (k && !nameByKey.has(k)) nameByKey.set(k, n);
  }
  state.allNames = [...nameByKey.values()].sort((a, b) => a.localeCompare(b, "hr"));

  renderQuickAdd();

  const visible = state.items.filter((i) => !state.filterStore || getStores(i).includes(state.filterStore));
  const active = visible.filter((i) => !i.bought);
  const bought = visible.filter((i) => i.bought);

  // Hitno (zvjezdica) na vrh
  active.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.created_at || 0) - (b.created_at || 0));

  renderSummary(active);

  els.activeList.innerHTML = renderActiveItems(active);
  els.boughtList.innerHTML = bought.map(renderItem).join("");

  els.activeCount.textContent = active.length;
  els.boughtCount.textContent = bought.length;
  els.emptyActive.classList.toggle("hidden", active.length > 0);
  els.boughtSection.classList.toggle("hidden", bought.length === 0);
}

// Aktivne stavke — grupirano po dućanu, kategoriji ili ravno
function renderActiveItems(active) {
  if (state.groupMode === "none") return active.map(renderItem).join("");
  const byCategory = state.groupMode === "category";
  const order = byCategory ? state.CATEGORIES : state.STORES;
  const emptyLabel = byCategory ? "Bez kategorije" : "Bez dućana";
  const groups = {};
  for (const it of active) {
    const key = byCategory
      ? (state.CATEGORIES.includes(it.category) ? it.category : emptyLabel)
      : (sortStores(getStores(it))[0] || emptyLabel);
    (groups[key] ||= []).push(it);
  }
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
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
    storeText = `${icon("pin")} ${shown}${extra}`;
  }
  const meta = [storeText];
  if (item.category) meta.push(`<span class="cat-tag">${esc(item.category)}</span>`);
  const priceTxt = item.bought ? fmtPrice(item.price) : null;
  if (priceTxt) meta.push(`${icon("tag")} ${priceTxt}`);
  if (item.added_by) meta.push(`${icon("user")} ${esc(item.added_by)}`);
  if (item.recurring) meta.push(`${icon("refresh")} ponavlja se`);

  const qtyTag = item.qty ? `<span class="qty-tag">×${esc(item.qty)}</span>` : "";

  return `
    <li class="item swipeable ${item.bought ? "done" : ""} ${item.urgent ? "urgent" : ""}" data-id="${item.id}">
      <div class="item-bg"><span class="item-bg-icon">${icon("trash")} Obriši</span></div>
      <div class="item-inner">
        <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
          ${item.bought ? "✓" : ""}
        </button>
        <div class="item-main" data-act="edit-item" data-id="${item.id}">
          <div class="item-row1">
            <button class="star-btn ${item.urgent ? "on" : ""}" data-act="star" data-id="${item.id}" aria-label="Hitno">${icon("star")}</button>
            <button class="recur-btn ${item.recurring ? "on" : ""}" data-act="recur" data-id="${item.id}" aria-label="Ponavljajuća stavka">${icon("refresh")}</button>
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
  const onList = new Set(state.items.map((i) => i.name.toLowerCase()));
  const top = [...new Set(Object.values(stats))]
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

// Procjena cijene košarice + pametni dućan (na temelju povijesti cijena)
function renderSummary(active) {
  const stats = aggregateByName();
  const statFor = (n) => stats[normKey(n)];
  let estTotal = 0, estKnown = 0;
  const perStore = {};
  for (const s of state.STORES) perStore[s] = { total: 0, covered: 0 };

  for (const it of active) {
    const s = statFor(it.name);
    if (!s || !s.prices.length) continue;
    const last = [...s.prices].sort((a, b) => b.at - a.at)[0];
    estTotal += last.price;
    estKnown++;
    for (const store of state.STORES) {
      const ps = s.perStore[store];
      if (ps && ps.last != null) { perStore[store].total += ps.last; perStore[store].covered++; }
    }
  }

  if (estKnown === 0) { els.listSummary.classList.add("hidden"); els.listSummary.innerHTML = ""; return; }

  let best = null;
  for (const store of state.STORES) {
    const d = perStore[store];
    if (d.covered === 0) continue;
    if (!best || d.covered > best.covered || (d.covered === best.covered && d.total < best.total)) {
      best = { store, total: d.total, covered: d.covered };
    }
  }

  const M = active.length;
  let html = `<div class="summary-row">${icon("tag")} Procjena košarice: <strong>~${estTotal.toFixed(2)} €</strong> <span class="muted">(${estKnown}/${M} s cijenom)</span></div>`;
  if (best) {
    html += `<div class="summary-row">${icon("bag")} Najpovoljnije na jednom mjestu: <strong>${esc(best.store)}</strong> ~${best.total.toFixed(2)} € <span class="muted">(${best.covered}/${M})</span></div>`;
  }
  els.listSummary.innerHTML = html;
  els.listSummary.classList.remove("hidden");
}
