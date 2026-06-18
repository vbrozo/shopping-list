"use strict";

import { state } from "../state.js";
import { els, icon } from "../dom.js";
import { html, raw, aggregateByName, normKey, tripKeyOf, fmtDate, fmtPrice } from "../util.js";

// Jedna kartica u "Cijene po artiklu" (usporedba cijena po dućanu)
function priceStatHTML(s) {
  const nameKey = normKey(s.name);
  const onList = state.items.some((i) => normKey(i.name) === nameKey && !i.bought);
  const addBtn = html`<button class="btn-add-to-list ${onList ? "on-list" : ""}" data-act="article-add" data-name="${s.name}" data-store="${s.prices.length ? Object.entries(s.perStore).sort((a, b) => a[1].min - b[1].min)[0][0] : ""}" aria-label="Dodaj na listu">${onList ? "✓" : icon("plus")}</button>`;

  if (s.prices.length === 0) {
    return html`<li class="item" ><div class="item-body item-main" data-act="edit-article" data-key="${nameKey}"><div class="item-name">${s.name}</div>
            <div class="muted-line">još bez cijene · ${s.count}× kupljeno</div></div>${raw(addBtn)}</li>`;
  }
  const entries = Object.entries(s.perStore).sort((a, b) => a[1].min - b[1].min);
  const cheapest = entries[0][0];
  const rows = entries
    .map(([st, ps]) => {
      const extra = ps.count > 1 ? raw(` <small>(min ${ps.min.toFixed(2)})</small>`) : "";
      return html`<div class="price-row ${st === cheapest ? "cheapest" : ""}">
                <span>${st === cheapest ? raw(icon("star") + " ") : ""}${st}</span>
                <span>${ps.last.toFixed(2)} €${extra}</span>
              </div>`;
    })
    .join("");
  return html`<li class="item col"><div class="item-body item-main" data-act="edit-article" data-key="${nameKey}">
            <div class="item-name">${s.name}</div>
            <div class="price-table">${raw(rows)}</div>
          </div>${raw(addBtn)}</li>`;
}

// ── Render: POVIJEST ───────────────────────────────────────────
export function renderHistory() {
  const q = state.historyQuery.trim().toLowerCase();
  const tab = state.historyTab;

  els.tabPrices.setAttribute("aria-selected", tab === "prices");
  els.tabTrips.setAttribute("aria-selected", tab === "trips");
  els.panelPrices.classList.toggle("hidden", tab !== "prices");
  els.panelTrips.classList.toggle("hidden", tab !== "trips");

  els.emptyHistory.classList.toggle("hidden", state.purchases.length > 0);

  const stats = [...new Set(Object.values(aggregateByName()))]
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "hr"));

  if (state.priceGroupBy === "category") {
    const noCat = "📦 Bez kategorije";
    const buckets = {};
    for (const s of stats) {
      const key = s.category && state.CATEGORIES.includes(s.category) ? s.category : noCat;
      (buckets[key] ||= []).push(s);
    }
    const keys = Object.keys(buckets).sort((a, b) => {
      const ia = state.CATEGORIES.indexOf(a), ib = state.CATEGORIES.indexOf(b);
      return (ia === -1 ? 98 : ia) - (ib === -1 ? 98 : ib) || a.localeCompare(b, "hr");
    });
    els.priceList.innerHTML = keys
      .map((k) => {
        const collapsed = state.collapsedPriceCats.has(k);
        const items = collapsed ? "" : buckets[k].map(priceStatHTML).join("");
        return html`<li class="group-head price-cat-head" data-act="toggle-price-cat" data-cat="${k}">
              <span>${k} <span class="count">${buckets[k].length}</span></span>
              <span class="cat-chevron ${collapsed ? "collapsed" : ""}">${icon("chevron")}</span>
            </li>` + items;
      })
      .join("");
  } else {
    els.priceList.innerHTML = stats.map(priceStatHTML).join("");
  }

  const filtered = state.purchases.filter((p) => !q || p.name.toLowerCase().includes(q));

  // Grupiraj po kupovini (trip_id ili, za stare zapise, dan+dućan)
  const groups = new Map();
  for (const p of filtered) {
    const key = tripKeyOf(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const tripList = [...groups.entries()]
    .map(([key, ps]) => ({
      key,
      items: ps.sort((a, b) => a.name.localeCompare(b.name, "hr")),
      maxAt: Math.max(...ps.map((p) => p.purchased_at || 0)),
    }))
    .sort((a, b) => b.maxAt - a.maxAt);

  els.historyList.innerHTML = tripList
    .map((trip) => {
      const stores = [...new Set(trip.items.map((p) => p.store).filter(Boolean))];
      const sum = trip.items.reduce((s, p) => s + (typeof p.price === "number" ? p.price : 0), 0);
      const collapsed = state.collapsedTrips.has(trip.key);
      const headParts = [fmtDate(trip.maxAt)];
      if (stores.length) headParts.push(html`${icon("pin")} ${stores.join(", ")}`);
      headParts.push(`${trip.items.length} ${trip.items.length === 1 ? "stavka" : "stavke"}`);
      if (sum > 0) headParts.push(html`${icon("tag")} ${sum.toFixed(2)} €`);

      const rows = trip.items
        .map((p) => {
          const parts = [];
          if (p.store && stores.length > 1) parts.push(html`${icon("pin")} ${p.store}`);
          const priceTxt = fmtPrice(p.price);
          if (priceTxt) parts.push(html`${icon("tag")} ${priceTxt}`);
          if (p.bought_by) parts.push(html`${icon("user")} ${p.bought_by}`);
          const showReceipt = p.receipt_name && normKey(p.receipt_name) !== normKey(p.name);
          return html`<li class="item">
                    <div class="item-main" data-act="edit-hist" data-id="${p.id}">
                      <div class="item-name">${p.name}${p.qty ? html` ×${p.qty}` : ""}</div>
                      ${parts.length ? html`<div class="muted-line">${raw(parts.join(" · "))}</div>` : ""}
                      ${showReceipt ? html`<div class="muted-line tiny">${icon("tag")} na računu: ${p.receipt_name}</div>` : ""}
                    </div>
                    <button class="btn-del" data-act="del-hist" data-id="${p.id}" aria-label="Obriši">×</button>
                  </li>`;
        })
        .join("");

      return html`<li class="trip-group ${collapsed ? "collapsed" : ""}">
                <div class="trip-header">
                  <div class="trip-header-main" data-act="toggle-trip" data-trip="${trip.key}">
                    <div class="muted-line">${raw(headParts.join(" · "))}</div>
                  </div>
                  <button type="button" class="btn-repeat" data-act="repeat-trip" data-trip="${trip.key}" aria-label="Ponovi kupovinu">${icon("refresh")} Ponovi</button>
                  <span class="trip-chevron" data-act="toggle-trip" data-trip="${trip.key}">${icon("chevron")}</span>
                </div>
                <ul class="list trip-items">${raw(rows)}</ul>
              </li>`;
    })
    .join("");
}
