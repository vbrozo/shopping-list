"use strict";

import { state, setState } from "./state.js";
import { els } from "./dom.js";
import { haptic } from "./util.js";
import { deleteItem, deleteHistory } from "./actions.js";

// ── Swipe za brisanje (lijevo) ─────────────────────────────────
let swipe = null;
// Dijeljeno s globalnim click handlerom (spriječi "tap = kupljeno" odmah nakon swipea)
export const swipeGuard = { suppressClickUntil: 0 };

// ── Swipe za promjenu taba (lijevo/desno na view-list) ────────
let tabSwipe = null;

export function initSwipe() {
  document.addEventListener("touchstart", (e) => {
    const li = e.target.closest(".item.swipeable[data-id]");
    if (!li) return;
    const inList = els.viewList.contains(li);
    const inHistory = els.viewHistory.contains(li);
    if (!inList && !inHistory) return;
    if (e.target.closest("button, input, select, .store-editor")) return;
    const inner = li.querySelector(".item-inner");
    swipe = { li, inner, id: li.dataset.id, isHistory: inHistory, x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false, dx: 0 };
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
    if (swipe.moved) swipeGuard.suppressClickUntil = Date.now() + 450;
    inner.style.transition = "";
    if (swipe.dx <= -80) {
      haptic(20);
      inner.style.transform = "translateX(-100%)";
      inner.style.opacity = "0";
      if (swipe.isHistory) deleteHistory(swipe.id);
      else deleteItem(swipe.id);
    } else {
      inner.style.transform = "";
      li.classList.remove("will-delete");
    }
    swipe = null;
  });

  // ── Tab swipe na view-list (ignorira swipeable artikle) ──────
  els.viewList.addEventListener("touchstart", (e) => {
    if (e.target.closest(".item.swipeable")) return; // prepusti item swipeu
    if (e.target.closest("button, input, select")) return;
    tabSwipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  els.viewList.addEventListener("touchend", (e) => {
    if (!tabSwipe) return;
    const dx = e.changedTouches[0].clientX - tabSwipe.x;
    const dy = e.changedTouches[0].clientY - tabSwipe.y;
    tabSwipe = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const tab = dx < 0 ? "list" : "add";
    if (tab === state.listTab) return;
    localStorage.setItem("listTab", tab);
    setState({ listTab: tab });
  }, { passive: true });
}
