"use strict";

import { state, QTY_UNITS } from "./state.js";
import { els } from "./dom.js";
import { esc, html, raw } from "./html.js";

export { esc, html, raw };

// ── Pomoćne ────────────────────────────────────────────────────
export function setSync(ok) {
  els.syncDot.className = "sync-dot " + (ok ? "online" : "offline");
}
// Vibracija (radi na Androidu; iOS Safari ne podržava — tiho ne radi ništa)
export function haptic(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
export function fmtPrice(p) {
  return (typeof p === "number" && !isNaN(p)) ? p.toFixed(2) + " €" : null;
}
export function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("hr-HR", { day: "numeric", month: "numeric", year: "numeric" });
}
export function newTripId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// Stavke bez trip_id (stari zapisi) grupiraju se po danu + dućanu kao zamjenski ključ.
export function tripKeyOf(p) {
  if (p.trip_id) return "t:" + p.trip_id;
  const day = p.purchased_at ? new Date(p.purchased_at).toDateString() : "?";
  return "legacy:" + day + ":" + (p.store || "");
}
export function msToDateInput(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dateInputToMs(v, fallback) {
  if (!v) return fallback;
  const ms = new Date(v + "T12:00:00").getTime();
  return isNaN(ms) ? fallback : ms;
}
export function parsePrice(str) {
  if (str == null) return null;
  const n = parseFloat(String(str).replace(",", ".").replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}
export function getStores(item) {
  if (Array.isArray(item.stores)) return item.stores;
  if (item.store) return [item.store];
  return [];
}
export function sortStores(arr) {
  return [...arr].sort((a, b) => {
    const ia = state.STORES.indexOf(a), ib = state.STORES.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, "hr");
  });
}
// Uobičajeni dućan za artikl (na temelju povijesti)
export function usualStoresFor(name) {
  if (!name) return [];
  const key = normKey(name);
  const counts = {};
  for (const p of state.purchases) {
    if (p.name && normKey(p.name) === key && p.store) {
      counts[p.store] = (counts[p.store] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? [best[0]] : [];
}

// Najčešća kategorija za artikl tog naziva (iz povijesti i trenutnih stavki)
export function usualCategoryFor(name) {
  if (!name) return "";
  const key = normKey(name);
  const counts = {};
  for (const src of [state.purchases, state.items]) {
    for (const r of src) {
      if (r.name && normKey(r.name) === key && r.category && state.CATEGORIES.includes(r.category)) {
        counts[r.category] = (counts[r.category] || 0) + 1;
      }
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "";
}

// Skini hrvatske dijakritike za usporedbu (č→c, ž→z, đ→d…)
export function deaccent(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d");
}
// Kanonski ključ naziva: bez razmaka, interpunkcije, kvačica, velikih slova
export function normKey(name) {
  return deaccent(String(name || "")).replace(/[^a-z0-9]/g, "");
}
// Levenshtein razmak — za prepoznavanje sličnih naziva (tipfeleri, npr. "Životinjsko" / "Životnjsko")
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
// Prepoznavanje dućana u izgovorenom tekstu
const VOICE_PREP = new Set(["iz", "u", "kod", "na", "sa", "s", "od"]);
// Usporedba korijena riječi (tolerira padeže: konzuma~konzum, tvornice~tvornica)
export function sameStem(token, word) {
  const n = Math.min(token.length, word.length);
  if (n < 3) return token === word;
  const k = Math.max(3, n - 2);
  return token.slice(0, k) === word.slice(0, k);
}

// Iz fraze ("mlijeko iz konzuma") izvuci naziv i dućan(e) — radi za bilo
// koje dućane iz trenutne liste STORES
export function extractStores(phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  const norm = words.map(deaccent);
  const remove = new Set();
  const found = [];

  for (const store of state.STORES) {
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
export function toast(msg, actionLabel, actionFn) {
  els.toast.innerHTML = html`<span>${msg}</span>`;
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

// ── Kontrola količine (slobodan broj + jedinice kom/kg/g/l) ────
export function unitChipsHTML(selected, act) {
  return QTY_UNITS
    .map((u) => html`<button type="button" class="unit-chip ${u === selected ? "selected" : ""}" data-act="${act}" data-unit="${u}">${u}</button>`)
    .join("");
}
export function buildQty(value, unit) {
  const v = (value || "").trim();
  if (!v) return null;
  return unit ? `${v} ${unit}` : v;
}
export function parseQty(s) {
  s = (s || "").trim();
  if (!s) return { value: "", unit: "kom" };
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  let value = m ? m[1].replace(",", ".") : "";
  let unit = m ? m[2].trim() : "";
  if (!QTY_UNITS.includes(unit)) unit = "kom"; // bez prepoznate jedinice → zadano "kom" (umjesto da ništa ne bude odabrano)
  return { value, unit };
}

// Jedinstveni HTML za chips kategorija (single-select)
export function catChipsHTML(selected, act) {
  return state.CATEGORIES.map(
    (c) =>
      html`<button type="button" class="store-chip ${c === selected ? "selected" : ""}"
         data-act="${act}" data-cat="${c}">${c}</button>`
  ).join("");
}

// Grupira po NORMALIZIRANOM nazivu (bez razmaka/crtica/kvačica/velikih slova)
// pa "Pom Bar – paprika", "Pom Bar paprika", "PomBar paprika" postaju jedno
export function aggregateByName() {
  const map = {};
  for (const p of state.purchases) {
    const key = normKey(p.name);
    if (!key) continue;
    if (!map[key]) {
      map[key] = { name: p.name, count: 0, lastAt: 0, lastStore: null, category: null, prices: [], perStore: {}, nameCounts: {}, catCounts: {} };
    }
    const e = map[key];
    e.count++;
    e.nameCounts[p.name] = (e.nameCounts[p.name] || 0) + 1;
    if (p.category) e.catCounts[p.category] = (e.catCounts[p.category] || 0) + 1;
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
  // Spoji ključeve koji se razlikuju za tipfeler (npr. "zivotinjskocarstvo" / "zivotnjskocarstvo)
  const keys = Object.keys(map);
  const used = new Set();
  const merged = {};
  for (let i = 0; i < keys.length; i++) {
    const ki = keys[i];
    if (used.has(ki)) continue;
    const target = map[ki];
    used.add(ki);
    merged[ki] = target;
    for (let j = i + 1; j < keys.length; j++) {
      const kj = keys[j];
      if (used.has(kj)) continue;
      const maxLen = Math.max(ki.length, kj.length);
      if (maxLen < 6) continue; // kratki nazivi: rizik lažnog spajanja
      const maxDist = maxLen <= 9 ? 1 : 2;
      if (levenshtein(ki, kj) > maxDist) continue;
      const e2 = map[kj];
      target.count += e2.count;
      for (const [nm, c] of Object.entries(e2.nameCounts)) target.nameCounts[nm] = (target.nameCounts[nm] || 0) + c;
      for (const [ct, c] of Object.entries(e2.catCounts)) target.catCounts[ct] = (target.catCounts[ct] || 0) + c;
      target.prices.push(...e2.prices);
      for (const [st, ps] of Object.entries(e2.perStore)) {
        const tp = (target.perStore[st] ||= { min: Infinity, last: null, lastAt: 0, count: 0 });
        tp.count += ps.count;
        tp.min = Math.min(tp.min, ps.min);
        if (ps.lastAt >= tp.lastAt) { tp.lastAt = ps.lastAt; tp.last = ps.last; }
      }
      if (e2.lastAt > target.lastAt) { target.lastAt = e2.lastAt; target.lastStore = e2.lastStore; }
      used.add(kj);
      merged[kj] = target; // alias — pretraga po oba ključa vraća isti spojeni zapis
    }
  }
  // Prikazni naziv = najčešća varijanta zapisa; kategorija = najčešća zabilježena
  for (const e of new Set(Object.values(merged))) {
    e.name = Object.entries(e.nameCounts).sort((a, b) => b[1] - a[1])[0][0];
    const topCat = Object.entries(e.catCounts).sort((a, b) => b[1] - a[1])[0];
    e.category = topCat ? topCat[0] : null;
  }
  return merged;
}
