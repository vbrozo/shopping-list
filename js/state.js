"use strict";

// ── Središnji reaktivni store ──────────────────────────────────
// Sva zajednička aplikacijska data živi ovdje. Promjene idu kroz
// setState() koji obavijesti pretplatnike (render se zove sam).

// ── Verzija (za prikaz i provjeru je li nova učitana) ──────────
export const APP_VERSION = "38";

// ── Dućani (uredivi u Postavkama; spremaju se u Firestore) ─────
export const DEFAULT_STORES = ["Konzum", "DM", "Lidl", "Tvornica Zdrave Hrane"];

// ── Kategorije namirnica (uredive u Postavkama; sync u Firestore) ─
export const DEFAULT_CATEGORIES = [
  "🥦 Voće i povrće",
  "🥛 Mliječni proizvodi",
  "🥩 Meso i riba",
  "🍞 Pekara",
  "🧊 Smrznuto",
  "🥤 Pića",
  "🍫 Slatkiši i grickalice",
  "🧴 Higijena i kućanstvo",
  "🍝 Suhe namirnice",
  "📦 Ostalo",
];

// ── Količina: jedinice (vrijednost je slobodan unos) ───────────
export const QTY_UNITS = ["kom", "kg", "g", "l"];

// ── Boje naglaska (accent) ─────────────────────────────────────
export const ACCENTS = ["green", "blue", "purple", "orange", "teal", "red"];

// ── Stanje ─────────────────────────────────────────────────────
export const state = {
  items: [],
  purchases: [],
  STORES: [...DEFAULT_STORES],
  CATEGORIES: [...DEFAULT_CATEGORIES],
  filterStore: "",
  view: "list",
  historyQuery: "",
  collapsedTrips: new Set(), // sklopljene grupe kupovina u povijesti (po trip ključu)
  collapsedPriceCats: new Set(), // sklopljene kategorije u "Cijene po artiklu"
  // Način grupiranja liste: "none" | "store" | "category" (kompatibilno sa starom postavkom)
  groupMode: localStorage.getItem("groupMode") || (localStorage.getItem("groupByStore") === "1" ? "store" : "none"),
  priceGroupBy: localStorage.getItem("priceGroupBy") || "none", // grupiranje "Cijene po artiklu"
  historyTab: localStorage.getItem("historyTab") || "prices", // aktivni tab u povijesti: "prices" | "trips"
  listTab: localStorage.getItem("listTab") || "add", // aktivni tab na listi: "add" | "list"
  userName: localStorage.getItem("userName") || "",
  allNames: [], // svi poznati nazivi (za prijedloge pri tipkanju)
};

// ── Pub/sub ────────────────────────────────────────────────────
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() {
  for (const fn of listeners) fn();
}
// Spoji promjene u state i obavijesti pretplatnike (→ render).
export function setState(patch) {
  Object.assign(state, patch);
  emit();
}
