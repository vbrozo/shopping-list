"use strict";

import { els } from "./dom.js";
import { sortStores, extractStores, toast } from "./util.js";
import { newStores } from "./views/list.js";
import { addItem } from "./actions.js";

// ── Glasovni unos (Web Speech API) ─────────────────────────────
let recognition = null;
let listening = false;
const VOICE_CMD = /^(dodaj|dodati|daj|kupi|kupit|kupiti|treba(m|mo)?|trebalo bi)\s+/i;

export function initVoice() {
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
    if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Mikrofon nije dopušten");
    else if (e.error === "no-speech") toast("Nisam ništa čuo");
  };
}
function stopVoiceUI() {
  listening = false;
  els.micBtn.classList.remove("listening");
  els.itemInput.placeholder = "Dodaj stavku (npr. mlijeko)";
}
export function toggleVoice() {
  if (!recognition) return;
  if (listening) { recognition.stop(); return; }
  try {
    recognition.start();
    listening = true;
    els.micBtn.classList.add("listening");
    els.itemInput.value = "";
    els.itemInput.placeholder = "Slušam…";
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
