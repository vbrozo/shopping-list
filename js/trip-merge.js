"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import { tripKeyOf, toast, setSync, html } from "./util.js";
import { db, purchasesCol, doc, writeBatch } from "./firebase.js";

// ── Drag & drop merge tripova (touch-based) ────────────────────
let drag = null; // { sourceKey, ghost, originY, li }
let mergeTarget = null; // trip key koji je označen kao drop target

export function initTripMerge() {
  const list = els.historyList;

  list.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);
  document.addEventListener("touchcancel", cancelDrag);
}

// ── Helpers ─────────────────────────────────────────────────────
function tripLiAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest(".trip-group[data-trip-key]");
}

function allTripLis() {
  return [...els.historyList.querySelectorAll(".trip-group[data-trip-key]")];
}

// ── Touch handlers ───────────────────────────────────────────────
let longPressTimer = null;
let longPressStart = null;

function onTouchStart(e) {
  const header = e.target.closest(".trip-header-main");
  if (!header) return;
  const li = header.closest(".trip-group[data-trip-key]");
  if (!li) return;

  const t = e.touches[0];
  longPressStart = { x: t.clientX, y: t.clientY, li };
  longPressTimer = setTimeout(() => {
    startDrag(li, t.clientX, t.clientY);
    longPressStart = null;
  }, 500);
}

function startDrag(li, x, y) {
  if (navigator.vibrate) navigator.vibrate(30);
  const key = li.dataset.tripKey;
  const rect = li.getBoundingClientRect();

  // Vytvori ghost element
  const ghost = li.cloneNode(true);
  ghost.style.cssText = `
    position: fixed; left: ${rect.left}px; top: ${rect.top}px;
    width: ${rect.width}px; opacity: 0.85; z-index: 1000;
    pointer-events: none; border-radius: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    transition: none;
  `;
  document.body.appendChild(ghost);

  li.style.opacity = "0.3";
  drag = { sourceKey: key, ghost, originY: y - rect.top, originX: x - rect.left, li };
  els.historyList.classList.add("merging");
}

function onTouchMove(e) {
  if (longPressTimer && longPressStart) {
    const dx = e.touches[0].clientX - longPressStart.x;
    const dy = e.touches[0].clientY - longPressStart.y;
    if (Math.hypot(dx, dy) > 8) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    }
  }
  if (!drag) return;
  e.preventDefault();

  const t = e.touches[0];
  drag.ghost.style.left = `${t.clientX - drag.originX}px`;
  drag.ghost.style.top  = `${t.clientY - drag.originY}px`;

  // Highlight target
  const over = tripLiAt(t.clientX, t.clientY);
  const overKey = over?.dataset.tripKey;

  if (overKey !== mergeTarget) {
    allTripLis().forEach((li) => li.classList.remove("merge-target"));
    mergeTarget = null;
    if (over && overKey !== drag.sourceKey) {
      over.classList.add("merge-target");
      mergeTarget = overKey;
    }
  }
}

function onTouchEnd(e) {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  if (!drag) return;

  const { sourceKey, ghost, li } = drag;
  ghost.remove();
  li.style.opacity = "";
  els.historyList.classList.remove("merging");
  allTripLis().forEach((l) => l.classList.remove("merge-target"));

  const target = mergeTarget;
  drag = null;
  mergeTarget = null;

  if (target && target !== sourceKey) {
    confirmMerge(sourceKey, target);
  }
}

function cancelDrag() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  if (!drag) return;
  drag.ghost.remove();
  drag.li.style.opacity = "";
  els.historyList.classList.remove("merging");
  allTripLis().forEach((l) => l.classList.remove("merge-target"));
  drag = null;
  mergeTarget = null;
}

// ── Potvrda i izvršavanje merge-a ───────────────────────────────
export function confirmMerge(sourceKey, destKey) {
  const srcItems = state.purchases.filter((p) => tripKeyOf(p) === sourceKey);
  const dstItems = state.purchases.filter((p) => tripKeyOf(p) === destKey);
  if (!srcItems.length || !dstItems.length) return;

  const srcStore = [...new Set(srcItems.map((p) => p.store).filter(Boolean))][0] || "";
  const srcDate = new Date(Math.max(...srcItems.map((p) => p.purchased_at || 0))).toLocaleDateString("hr");
  const dstStore = [...new Set(dstItems.map((p) => p.store).filter(Boolean))][0] || "";
  const dstDate = new Date(Math.max(...dstItems.map((p) => p.purchased_at || 0))).toLocaleDateString("hr");

  els.mergeSourceLabel.textContent = `${srcDate}${srcStore ? " · " + srcStore : ""} — ${srcItems.length} stavki`;
  els.mergeDestLabel.textContent   = `${dstDate}${dstStore ? " · " + dstStore : ""} — ${dstItems.length} stavki`;
  els.mergeModal.classList.remove("hidden");

  els.mergeConfirm.onclick = () => doMerge(sourceKey, destKey);
  els.mergeCancel.onclick  = () => els.mergeModal.classList.add("hidden");
}

async function doMerge(sourceKey, destKey) {
  els.mergeModal.classList.add("hidden");
  const srcItems = state.purchases.filter((p) => tripKeyOf(p) === sourceKey);
  const dstItems = state.purchases.filter((p) => tripKeyOf(p) === destKey);

  // Destination trip_id i purchased_at
  const dstTripId = dstItems.find((p) => p.trip_id)?.trip_id || null;
  const dstAt     = Math.max(...dstItems.map((p) => p.purchased_at || 0));
  const dstStore  = [...new Set(dstItems.map((p) => p.store).filter(Boolean))][0] || null;

  try {
    const batch = writeBatch(db);
    for (const p of srcItems) {
      const update = { purchased_at: dstAt };
      if (dstTripId) update.trip_id = dstTripId;
      if (dstStore && !p.store) update.store = dstStore;
      batch.update(doc(purchasesCol, p.id), update);
    }
    await batch.commit();
    toast(`Spojeno: ${srcItems.length + dstItems.length} stavki ✓`);
  } catch (e) { console.error(e); setSync(false); }
}
