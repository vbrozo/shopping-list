"use strict";

// ── Auto-escaping HTML tagged template ─────────────────────────
// html`<div>${userValue}</div>` escapes svaku interpoliranu vrijednost
// automatski. Za već sigurni/izgrađeni markup (npr. icon() ili
// ugniježđeni html`` rezultat) koristi raw() da se ne escapea dvaput.
const SAFE = Symbol("safeHtml");

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function raw(s) {
  return { [SAFE]: true, toString: () => String(s) };
}

function stringify(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return val.map(stringify).join("");
  if (val && val[SAFE]) return String(val);
  return esc(String(val));
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += stringify(values[i]) + strings[i + 1];
  }
  return raw(out);
}
