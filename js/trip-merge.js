"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import { tripKeyOf, toast, setSync } from "./util.js";
import { db, purchasesCol, doc, writeBatch } from "./firebase.js";

// ── Drag & drop merge tripova (touch + mouse) ──────────────────
let drag = null;       // { sourceKey, ghost, originX, originY, li }
let mergeTarget = null;

export function initTripMerge() {
  // Touch
  els.historyList.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);
  document.addEventListener("touchcancel", cancelDrag);

  // Mouse (web)
  els.historyList.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// ── Helpers ─────────────────────────────────────────────────────
function tripLiAt(x, y) {
  // ghost is pointer-events:none so elementFromPoint works through it
  const el = document.elementFromPoint(x, y);
  return el?.closest(".trip-group[data-trip-key]");
}

function allTripLis() {
  return [...els.historyList.querySelectorAll(".trip-group[data-trip-key]")];
}

function startDrag(li, x, y) {
  if (navigator.vibrate) navigator.vibrate(30);
  const rect = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  ghost.style.cssText = `
    position:fixed; left:${rect.left}px; top:${rect.top}px;
    width:${rect.width}px; opacity:0.85; z-index:1000;
    pointer-events:none; border-radius:14px;
    box-shadow:0 8px 24px rgba(0,0,0,0.25); transition:none; cursor:grabbing;
  `;
  document.body.appendChild(ghost);
  li.style.opacity = "0.3";
  drag = { sourceKey: li.dataset.tripKey, ghost, originX: x - rect.left, originY: y - rect.top, li };
  els.historyList.classList.add("merging");
  document.body.style.userSelect = "none";
}

function moveGhost(x, y) {
  if (!drag) return;
  drag.ghost.style.left = `${x - drag.originX}px`;
  drag.ghost.style.top  = `${y - drag.originY}px`;

  const over = tripLiAt(x, y);
  const overKey = over?.dataset.tripKey;
  if (overKey !== mergeTarget) {
    allTripLis().forEach((l) => l.classList.remove("merge-target"));
    mergeTarget = null;
    if (over && overKey !== drag.sourceKey) {
      over.classList.add("merge-target");
      mergeTarget = overKey;
    }
  }
}

function endDrag() {
  if (!drag) return;
  drag.ghost.remove();
  drag.li.style.opacity = "";
  els.historyList.classList.remove("merging");
  allTripLis().forEach((l) => l.classList.remove("merge-target"));
  document.body.style.userSelect = "";
  const { sourceKey } = drag;
  const target = mergeTarget;
  drag = null;
  mergeTarget = null;
  if (target && target !== sourceKey) confirmMerge(sourceKey, target);
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost.remove();
  drag.li.style.opacity = "";
  els.historyList.classList.remove("merging");
  allTripLis().forEach((l) => l.classList.remove("merge-target"));
  document.body.style.userSelect = "";
  drag = null;
  mergeTarget = null;
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
  longPressStart = { x: t.clientX, y: t.clientY };
  longPressTimer = setTimeout(() => {
    longPressStart = null;
    startDrag(li, t.clientX, t.clientY);
  }, 500);
}

function onTouchMove(e) {
  if (longPressStart) {
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
  moveGhost(e.touches[0].clientX, e.touches[0].clientY);
}

function onTouchEnd() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressStart = null;
  endDrag();
}

// ── Mouse handlers ───────────────────────────────────────────────
let mouseDownLi = null;
let mouseMoved = false;

function onMouseDown(e) {
  if (e.button !== 0) return;
  const header = e.target.closest(".trip-header-main");
  if (!header) return;
  const li = header.closest(".trip-group[data-trip-key]");
  if (!li) return;
  mouseDownLi = { li, x: e.clientX, y: e.clientY };
  mouseMoved = false;
}

function onMouseMove(e) {
  if (mouseDownLi && !drag) {
    const dx = e.clientX - mouseDownLi.x;
    const dy = e.clientY - mouseDownLi.y;
    if (Math.hypot(dx, dy) > 6) {
      startDrag(mouseDownLi.li, mouseDownLi.x, mouseDownLi.y);
      mouseDownLi = null;
      mouseMoved = true;
    }
  }
  if (drag) moveGhost(e.clientX, e.clientY);
}

function onMouseUp() {
  mouseDownLi = null;
  endDrag();
}

// ── Potvrda i izvršavanje merge-a ───────────────────────────────
export function confirmMerge(sourceKey, destKey) {
  const srcItems = state.purchases.filter((p) => tripKeyOf(p) === sourceKey);
  const dstItems = state.purchases.filter((p) => tripKeyOf(p) === destKey);
  if (!srcItems.length || !dstItems.length) return;

  const label = (items) => {
    const store = [...new Set(items.map((p) => p.store).filter(Boolean))][0] || "";
    const date = new Date(Math.max(...items.map((p) => p.purchased_at || 0))).toLocaleDateString("hr");
    return `${date}${store ? " · " + store : ""} — ${items.length} stavki`;
  };

  els.mergeSourceLabel.textContent = label(srcItems);
  els.mergeDestLabel.textContent   = label(dstItems);
  els.mergeModal.classList.remove("hidden");
  els.mergeConfirm.onclick = () => doMerge(sourceKey, destKey);
  els.mergeCancel.onclick  = () => els.mergeModal.classList.add("hidden");
}

async function doMerge(sourceKey, destKey) {
  els.mergeModal.classList.add("hidden");
  const srcItems = state.purchases.filter((p) => tripKeyOf(p) === sourceKey);
  const dstItems = state.purchases.filter((p) => tripKeyOf(p) === destKey);
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
