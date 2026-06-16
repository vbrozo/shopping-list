"use strict";

import { ACCENTS } from "./state.js";

// ── Tema (svijetlo / tamno) — radi i prije Firebasea ───────────
export const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
function effectiveTheme() {
  const stored = localStorage.getItem("theme");
  return stored === "dark" || stored === "light" ? stored : (themeMedia.matches ? "dark" : "light");
}
export function applyTheme() {
  document.documentElement.classList.toggle("dark", effectiveTheme() === "dark");
  syncThemeColorMeta();
}
export function currentThemeChoice() {
  const t = localStorage.getItem("theme");
  return t === "dark" || t === "light" ? t : "auto";
}
export function setThemeChoice(choice) {
  if (choice === "auto") localStorage.removeItem("theme");
  else localStorage.setItem("theme", choice);
  applyTheme();
}
themeMedia.addEventListener("change", () => {
  if (!localStorage.getItem("theme")) applyTheme(); // prati sustav dok nije ručno postavljeno
});

// ── Boja naglaska (accent) ──────────────────────────────────────
export function currentAccent() {
  const a = localStorage.getItem("accent");
  return ACCENTS.includes(a) ? a : "green";
}
export function setAccent(accent) {
  localStorage.setItem("accent", accent);
  document.documentElement.setAttribute("data-accent", accent);
  syncThemeColorMeta();
}
function syncThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
}

applyTheme();
