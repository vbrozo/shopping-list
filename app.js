"use strict";

// ── Ulazna točka: poveži module, postavi event listenere i sync ─
import { APP_VERSION, state, setState, subscribe, DEFAULT_STORES, DEFAULT_CATEGORIES } from "./js/state.js";
import { els } from "./js/dom.js";
import { configured, itemsCol, purchasesCol, settingsDoc, onSnapshot } from "./js/firebase.js";
import { setThemeChoice, setAccent } from "./js/theme.js";
import { setSync, buildQty, sortStores, toast, aggregateByName, normKey, tripKeyOf } from "./js/util.js";
import { render } from "./js/render.js";
import {
  newStores, addForm, initAddQty, renderAddUnits, renderStorePicker,
  renderCatPicker, applyAutoStore, renderSuggestions, hideSuggestions,
} from "./js/views/list.js";
import {
  renderSettings, settingsState, addStore, addCategory, removeStore, removeCategory,
} from "./js/views/settings.js";
import { itemEditor, histEditor, articleEditor } from "./js/editors.js";
import {
  addItem, toggleBought, toggleStar, toggleRecurring, deleteItem, deleteHistory, repeatTrip,
  quickAdd, openArchiveModal, closeArchiveModal, confirmArchive,
} from "./js/actions.js";
import { handleReceiptFile, closeReceiptModal, confirmReceipt, openTripEdit, closeTripEdit, saveTripEdit } from "./js/receipt.js";
import { initVoice, toggleVoice } from "./js/voice.js";
import { initSwipe, swipeGuard } from "./js/swipe.js";

if (!configured) {
  els.setupNotice.classList.remove("hidden");
  els.viewList.classList.add("hidden");
}

// ── Tvrdo osvježi (za fazu testiranja): odjavi SW, očisti cache, reload ─
els.appVer.textContent = "v" + APP_VERSION;
els.refreshBtn.addEventListener("click", async () => {
  els.refreshBtn.textContent = "Osvježavam…";
  els.refreshBtn.disabled = true;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn("Hard refresh:", e); }
  location.reload();
});

// ── Event listeneri ────────────────────────────────────────────
if (configured) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.itemInput.value.trim();
    if (!name) return;
    addItemFromForm(name);
  });

  // Pri tipkanju: prijedlozi + automatski predloženi dućan
  els.itemInput.addEventListener("input", () => {
    applyAutoStore(els.itemInput.value);
    renderSuggestions(els.itemInput.value);
  });
  els.itemInput.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 150); // odgoda da klik na prijedlog stigne
  });

  document.addEventListener("click", (e) => {
    if (Date.now() < swipeGuard.suppressClickUntil) { swipeGuard.suppressClickUntil = 0; return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, id, store } = btn.dataset;
    if (act === "toggle") toggleBought(id);
    else if (act === "star") toggleStar(id);
    else if (act === "recur") toggleRecurring(id);
    else if (act === "edit-item") itemEditor.open(id);
    else if (act === "edit-store") itemEditor.toggleStore(store);
    else if (act === "edit-qty-unit") itemEditor.toggleUnit(btn.dataset.unit);
    else if (act === "edit-hist") histEditor.open(id);
    else if (act === "hist-store") histEditor.toggleStore(store);
    else if (act === "hist-qty-unit") histEditor.toggleUnit(btn.dataset.unit);
    else if (act === "article-add") {
      const { name, store } = btn.dataset;
      addItem(name, store ? [store] : [], null, false, null);
    }
    else if (act === "edit-article") {
      const key = btn.dataset.key;
      const stat = Object.values(aggregateByName()).find((s) => normKey(s.name) === key);
      if (stat) articleEditor.open(stat);
    }
    else if (act === "article-cat") articleEditor.toggleCat(btn.dataset.cat);
    else if (act === "toggle-new-store") {
      addForm.storesTouched = true;
      newStores.has(store) ? newStores.delete(store) : newStores.add(store);
      renderStorePicker();
    }
    else if (act === "toggle-new-cat") {
      addForm.categoryTouched = true;
      addForm.category = addForm.category === btn.dataset.cat ? "" : btn.dataset.cat;
      renderCatPicker();
    }
    else if (act === "edit-cat") itemEditor.toggleCat(btn.dataset.cat);
    else if (act === "archive-store") {
      const row = btn.closest(".archive-row");
      const was = btn.classList.contains("selected");
      row.querySelectorAll(".store-chip").forEach((c) => c.classList.remove("selected"));
      if (!was) btn.classList.add("selected");
    }
    else if (act === "receipt-store") {
      const was = btn.classList.contains("selected");
      els.receiptStores.querySelectorAll(".store-chip").forEach((c) => c.classList.remove("selected"));
      if (!was) btn.classList.add("selected");
    }
    else if (act === "receipt-del") btn.closest(".receipt-row")?.remove();
    else if (act === "trip-edit-store") {
      const was = btn.classList.contains("selected");
      els.tripEditStores.querySelectorAll(".store-chip").forEach((c) => c.classList.remove("selected"));
      if (!was) btn.classList.add("selected");
    }
    else if (act === "trip-edit-del") {
      const row = btn.closest(".receipt-row");
      if (row) { row.dataset.deleted = "1"; row.style.display = "none"; }
    }
    else if (act === "edit-trip") {
      const key = btn.dataset.trip;
      const items = state.purchases.filter((p) => tripKeyOf(p) === key);
      openTripEdit(key, items);
    }
    else if (act === "qty-unit") {
      addForm.unit = addForm.unit === btn.dataset.unit ? "" : btn.dataset.unit;
      renderAddUnits();
    }
    else if (act === "del") deleteItem(id);
    else if (act === "del-hist") {
      if (confirm("Obriši ovaj zapis iz povijesti?")) deleteHistory(id);
    }
    else if (act === "toggle-trip") {
      const key = btn.dataset.trip;
      state.collapsedTrips.has(key) ? state.collapsedTrips.delete(key) : state.collapsedTrips.add(key);
      render();
    }
    else if (act === "toggle-price-cat") {
      const cat = btn.dataset.cat;
      state.collapsedPriceCats.has(cat) ? state.collapsedPriceCats.delete(cat) : state.collapsedPriceCats.add(cat);
      render();
    }
    else if (act === "repeat-trip") repeatTrip(btn.dataset.trip);
    else if (act === "quick") {
      quickAdd(btn.dataset.name, store);
      localStorage.setItem("listTab", "list");
      setState({ listTab: "list" });
    }
    else if (act === "suggest") {
      els.itemInput.value = btn.dataset.name;
      applyAutoStore(btn.dataset.name);
      hideSuggestions();
      els.itemInput.focus();
    }
    else if (act === "theme-set") { setThemeChoice(btn.dataset.theme); renderSettings(); }
    else if (act === "accent-set") { setAccent(btn.dataset.accent); renderSettings(); }
    else if (act === "store-del") removeStore(btn.dataset.store);
    else if (act === "cat-del") removeCategory(btn.dataset.cat);
  });

  els.storeFilter.addEventListener("change", render);
  els.groupToggle.addEventListener("click", () => {
    // Ciklus: bez grupiranja → po dućanu → po kategoriji → bez grupiranja
    const next = state.groupMode === "none" ? "store" : state.groupMode === "store" ? "category" : "none";
    localStorage.setItem("groupMode", next);
    setState({ groupMode: next });
  });
  els.clearBought.addEventListener("click", openArchiveModal);
  els.archiveCancel.addEventListener("click", closeArchiveModal);
  els.archiveConfirm.addEventListener("click", confirmArchive);
  els.archiveModal.addEventListener("click", (e) => {
    if (e.target === els.archiveModal) closeArchiveModal();
  });

  // Skeniranje računa (OCR) — kamera ili galerija
  const onReceiptPicked = (e) => {
    const file = e.target.files && e.target.files[0];
    handleReceiptFile(file);
    e.target.value = ""; // dopusti ponovni odabir iste slike
  };
  els.scanReceipt.addEventListener("click", () => els.receiptFile.click());
  els.uploadReceipt.addEventListener("click", () => els.receiptGallery.click());
  els.receiptFile.addEventListener("change", onReceiptPicked);
  els.receiptGallery.addEventListener("change", onReceiptPicked);
  els.receiptCancel.addEventListener("click", closeReceiptModal);
  els.receiptConfirm.addEventListener("click", confirmReceipt);
  els.receiptModal.addEventListener("click", (e) => {
    if (e.target === els.receiptModal) closeReceiptModal();
  });
  els.tripEditCancel.addEventListener("click", closeTripEdit);
  els.tripEditSave.addEventListener("click", saveTripEdit);
  els.tripEditModal.addEventListener("click", (e) => {
    if (e.target === els.tripEditModal) closeTripEdit();
  });
  els.historySearch.addEventListener("input", (e) => {
    setState({ historyQuery: e.target.value });
  });
  els.listTabAdd.addEventListener("click", () => {
    localStorage.setItem("listTab", "add");
    setState({ listTab: "add" });
  });
  els.listTabList.addEventListener("click", () => {
    localStorage.setItem("listTab", "list");
    setState({ listTab: "list" });
  });
  els.tabPrices.addEventListener("click", () => {
    localStorage.setItem("historyTab", "prices");
    setState({ historyTab: "prices" });
  });
  els.tabTrips.addEventListener("click", () => {
    localStorage.setItem("historyTab", "trips");
    setState({ historyTab: "trips" });
  });
  els.viewToggle.addEventListener("click", () => {
    setState({ view: state.view === "history" ? "list" : "history" });
  });
  els.settingsBtn.addEventListener("click", () => setState({ view: "settings" }));
  els.settingsBack.addEventListener("click", () => setState({ view: "list" }));

  // Dodavanje dućana
  els.addStoreForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addStore(els.newStoreInput.value);
    els.newStoreInput.value = "";
  });
  // Dodavanje kategorije
  els.addCatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addCategory(els.newCatInput.value);
    els.newCatInput.value = "";
  });
  // Grupiranje "Cijene po artiklu" u povijesti
  els.priceSort.value = state.priceSortBy;
  els.priceSort.addEventListener("change", (e) => {
    localStorage.setItem("priceSortBy", e.target.value);
    setState({ priceSortBy: e.target.value });
  });
  els.priceGroup.value = state.priceGroupBy;
  els.priceGroup.addEventListener("change", (e) => {
    localStorage.setItem("priceGroupBy", e.target.value);
    setState({ priceGroupBy: e.target.value });
  });
  // Ime: ako je spremljeno -> "Uredi" otključa polje; inače "Spremi" sprema
  els.nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.userName && !settingsState.nameEditing) {
      settingsState.nameEditing = true;
      renderSettings();
      els.nameInput.focus();
      return;
    }
    const value = els.nameInput.value.trim();
    localStorage.setItem("userName", value);
    settingsState.nameEditing = false;
    setState({ userName: value });
    toastName(value);
  });

  // Otkrivanje detalja (dućan/količina)
  els.detailsToggle.addEventListener("click", () => els.addDetails.classList.toggle("hidden"));

  // Editor stavke
  els.editSave.addEventListener("click", itemEditor.save);
  els.editCancel.addEventListener("click", itemEditor.close);
  els.editSheet.addEventListener("click", (e) => {
    if (e.target === els.editSheet) itemEditor.close();
  });

  // Editor zapisa povijesti
  els.histSave.addEventListener("click", histEditor.save);
  els.histCancel.addEventListener("click", histEditor.close);
  els.histSheet.addEventListener("click", (e) => {
    if (e.target === els.histSheet) histEditor.close();
  });

  // Editor artikla (Cijene po artiklu)
  els.articleSave.addEventListener("click", articleEditor.save);
  els.articleCancel.addEventListener("click", articleEditor.close);
  els.articleSheet.addEventListener("click", (e) => {
    if (e.target === els.articleSheet) articleEditor.close();
  });

  els.micBtn.addEventListener("click", toggleVoice);
  initAddQty();
  initVoice();
  initSwipe();

  // Render se sada zove sam na svaku promjenu stanja
  subscribe(render);

  onSnapshot(itemsCol, (snap) => {
    const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    next.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    setSync(true);
    setState({ items: next });
  }, (err) => { console.error(err); setSync(false); });

  onSnapshot(purchasesCol, (snap) => {
    setState({ purchases: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  }, (err) => { console.error(err); setSync(false); });

  // Postavke (dućani + kategorije) — zajednički za sve uređaje
  onSnapshot(settingsDoc, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const STORES = data && Array.isArray(data.stores) && data.stores.length
      ? data.stores.filter((s) => typeof s === "string" && s.trim())
      : [...DEFAULT_STORES];
    const CATEGORIES = data && Array.isArray(data.categories) && data.categories.length
      ? data.categories.filter((c) => typeof c === "string" && c.trim())
      : [...DEFAULT_CATEGORIES];
    setState({ STORES, CATEGORIES });
  }, (err) => { console.error(err); setSync(false); });
}

// Dodaj stavku iz glavne forme i resetiraj polja
function addItemFromForm(name) {
  addItem(name, sortStores([...newStores]), buildQty(els.qtyValue.value, addForm.unit), false, addForm.category);
  els.itemInput.value = "";
  els.qtyValue.value = "";
  addForm.unit = "kom";
  renderAddUnits();
  newStores.clear();
  addForm.storesTouched = false;
  addForm.category = "";
  addForm.categoryTouched = false;
  renderStorePicker();
  hideSuggestions();
  localStorage.setItem("listTab", "list");
  setState({ listTab: "list" });
}

function toastName(value) {
  toast(value ? `Spremljeno: ${value}` : "Ime uklonjeno");
}

// ── Service worker (offline / PWA) ─────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  });
}
