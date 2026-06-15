"use strict";

// ── Konfiguracija / inicijalizacija ────────────────────────────
const cfg = window.APP_CONFIG || {};
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY;

const $ = (id) => document.getElementById(id);

const els = {
  setupNotice: $("setup-notice"),
  form: $("add-form"),
  itemInput: $("item-input"),
  storeInput: $("store-input"),
  suggestions: $("suggestions"),
  storeSuggestions: $("store-suggestions"),
  storeFilter: $("store-filter"),
  activeList: $("active-list"),
  boughtList: $("bought-list"),
  boughtSection: $("bought-section"),
  emptyActive: $("empty-active"),
  activeCount: $("active-count"),
  boughtCount: $("bought-count"),
  clearBought: $("clear-bought"),
  syncDot: $("sync-dot"),
};

if (!configured) {
  els.setupNotice.classList.remove("hidden");
  els.form.classList.add("hidden");
}

const sb = configured
  ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

// Lokalna kopija stavki (sinkronizirana s bazom)
let items = [];
let filterStore = "";

// ── Dohvat i prikaz ────────────────────────────────────────────
async function loadItems() {
  const { data, error } = await sb
    .from("items")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    setSync(false);
    return;
  }
  items = data || [];
  setSync(true);
  render();
}

function render() {
  // Popuni filter dućana
  const stores = [...new Set(items.map((i) => i.store).filter(Boolean))].sort();
  const prevFilter = els.storeFilter.value;
  els.storeFilter.innerHTML =
    '<option value="">Svi</option>' +
    stores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  els.storeFilter.value = stores.includes(prevFilter) ? prevFilter : "";
  filterStore = els.storeFilter.value;

  // Prijedlozi za autocomplete (iz prošlih unosa)
  const names = [...new Set(items.map((i) => i.name))].sort();
  els.suggestions.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
  els.storeSuggestions.innerHTML = stores.map((s) => `<option value="${esc(s)}">`).join("");

  const visible = items.filter((i) => !filterStore || i.store === filterStore);
  const active = visible.filter((i) => !i.bought);
  const bought = visible.filter((i) => i.bought);

  els.activeList.innerHTML = active.map(renderItem).join("");
  els.boughtList.innerHTML = bought.map(renderItem).join("");

  els.activeCount.textContent = active.length;
  els.boughtCount.textContent = bought.length;
  els.emptyActive.classList.toggle("hidden", active.length > 0);
  els.boughtSection.classList.toggle("hidden", bought.length === 0);
}

function renderItem(item) {
  const store = item.store
    ? `<button class="store-badge" data-act="store" data-id="${item.id}">📍 ${esc(item.store)}</button>`
    : `<button class="store-badge empty" data-act="store" data-id="${item.id}">+ dućan</button>`;
  return `
    <li class="item ${item.bought ? "done" : ""}">
      <button class="check" data-act="toggle" data-id="${item.id}" aria-label="Označi kupljeno">
        ${item.bought ? "✓" : ""}
      </button>
      <div class="item-body">
        <div class="item-name">${esc(item.name)}</div>
        ${store}
      </div>
      <button class="btn-del" data-act="del" data-id="${item.id}" aria-label="Obriši">×</button>
    </li>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function setSync(ok) {
  els.syncDot.className = "sync-dot " + (ok ? "online" : "offline");
}

// ── Akcije ─────────────────────────────────────────────────────
async function addItem(name, store) {
  const optimistic = {
    id: "tmp-" + Date.now(),
    name,
    store: store || null,
    bought: false,
    created_at: new Date().toISOString(),
  };
  items.push(optimistic);
  render();

  const { error } = await sb.from("items").insert({ name, store: store || null });
  if (error) {
    console.error(error);
    setSync(false);
  }
  // realtime / reload donosi pravi redak
}

async function toggleBought(id) {
  const item = items.find((i) => String(i.id) === String(id));
  if (!item) return;
  const next = !item.bought;
  item.bought = next;
  render();
  const { error } = await sb
    .from("items")
    .update({ bought: next, bought_at: next ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) { console.error(error); setSync(false); }
}

async function editStore(id) {
  const item = items.find((i) => String(i.id) === String(id));
  if (!item) return;
  const value = prompt("U kojem dućanu se kupuje?", item.store || "");
  if (value === null) return; // odustao
  const store = value.trim() || null;
  item.store = store;
  render();
  const { error } = await sb.from("items").update({ store }).eq("id", id);
  if (error) { console.error(error); setSync(false); }
}

async function deleteItem(id) {
  items = items.filter((i) => String(i.id) !== String(id));
  render();
  const { error } = await sb.from("items").delete().eq("id", id);
  if (error) { console.error(error); setSync(false); }
}

async function clearBought() {
  if (!confirm("Obrisati sve kupljene stavke?")) return;
  const ids = items.filter((i) => i.bought).map((i) => i.id);
  items = items.filter((i) => !i.bought);
  render();
  const { error } = await sb.from("items").delete().in("id", ids);
  if (error) { console.error(error); setSync(false); }
}

// ── Event listeneri ────────────────────────────────────────────
if (configured) {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.itemInput.value.trim();
    if (!name) return;
    addItem(name, els.storeInput.value.trim());
    els.itemInput.value = "";
    els.storeInput.value = "";
    els.itemInput.focus();
  });

  // Delegirani klikovi na listama
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === "toggle") toggleBought(id);
    else if (act === "store") editStore(id);
    else if (act === "del") deleteItem(id);
  });

  els.storeFilter.addEventListener("change", render);
  els.clearBought.addEventListener("click", clearBought);

  // Sinkronizacija uživo između uređaja
  sb.channel("items-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, loadItems)
    .subscribe();

  // Osvježi pri povratku u aplikaciju
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadItems();
  });

  loadItems();
}
