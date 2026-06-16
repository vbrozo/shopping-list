"use strict";

import { state } from "./state.js";
import { els } from "./dom.js";
import {
  deaccent, parsePrice, normKey, usualCategoryFor, msToDateInput,
  dateInputToMs, newTripId, toast, setSync, esc,
} from "./util.js";
import { db, purchasesCol, doc, writeBatch } from "./firebase.js";

// ── Skeniranje računa (OCR, Tesseract.js) ──────────────────────
// Tesseract se učitava tek na prvi klik (ne usporava pokretanje).
let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract nedostupan"));
    s.onerror = () => { tesseractLoading = null; reject(new Error("Učitavanje Tesseracta nije uspjelo")); };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

// Slika → smanjeno, sivo + blagi kontrast (bolji OCR, manje memorije)
async function preprocessImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Slika nije čitljiva"));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / (img.width || 1600));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      g = g < 128 ? g * 0.7 : Math.min(255, g * 1.18); // blagi kontrast
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Iz OCR teksta izvuci dućan, datum, ukupno i stavke.
// Pravilo: zadnja dva decimalna broja u retku = cijena i iznos;
// količina = iznos / cijena (rješava i vaganu robu i višekratnike).
function parseReceipt(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { store: null, date: null, total: null, rows: [] };

  // Dućan — poznati naziv u zaglavlju računa
  const head = deaccent(lines.slice(0, 8).join(" "));
  for (const s of state.STORES) {
    if (head.includes(deaccent(s))) { out.store = s; break; }
  }
  // Datum (dd.mm.yyyy bilo gdje na računu)
  const dm = text.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  if (dm) {
    const ms = new Date(+dm[3], +dm[2] - 1, +dm[1], 12).getTime();
    if (!isNaN(ms)) out.date = ms;
  }

  // NB: ne uključuje "kartica" — Konzum maskirani broj kartice stoji na vrhu,
  // prije stavki; plaćanje karticom na dnu ionako presretne "ukupno"/"za platiti".
  const STOP = /^(ukupno|za\s*plat|p\s*pdv|pdv\b|osnovica|na[čc]in pla|gotovina|iznos\b)/i;
  const SKIP = /(popust|naknad|paketi|vre[ćc]ic|bonus|sli[čc]ic|rabat)/i;
  // Novčani iznos: 1–4 znamenke + 2 decimale (npr. 4,99). Ne hvata 0,5L (1 decimala).
  const PRICE = /\d{1,4}[.,]\d{2}(?!\d)/g;

  for (let raw of lines) {
    if (STOP.test(raw)) {
      if (/ukupno|za\s*plat/i.test(raw)) {
        const m = raw.match(/(?:ukupno|za\s*plat\w*)\D*([\d.,]+\d)/i);
        if (m) out.total = parsePrice(m[1]);
      }
      break; // stavke su iznad sažetka
    }
    if (SKIP.test(raw)) continue;
    // Spoji razmaknute brojeve iz OCR-a ("2 , 09" → "2,09")
    const line = raw.replace(/(\d)\s*[.,]\s*(\d{2})(?!\d)/g, "$1,$2");
    // Mora sadržavati naziv artikla blizu početka (dopušta vodeću količinu, npr. "1 Kruh ...")
    if (!/^[\d\s.,]*[a-zčćđšžA-ZČĆĐŠŽ]{2,}/.test(line)) continue;

    const prices = line.match(PRICE);
    if (!prices || !prices.length) continue;
    // Zadnji iznos = ukupno za redak; pretposljednji (ako postoji) = jedinična cijena
    const iznos = parsePrice(prices[prices.length - 1]);
    const cijena = parsePrice(prices.length > 1 ? prices[prices.length - 2] : prices[0]);
    if (cijena == null || iznos == null || cijena <= 0) continue;

    // Naziv = dio prije prvog novčanog iznosa
    let name = line.slice(0, line.indexOf(prices[0])).replace(/[\s,.;:]+$/, "").trim();

    let qtyNum = iznos / cijena;
    // Skini vodeću "Kol" na početku naziva (npr. "1 Kraš Život. carstv" → "Kraš Život. carstv")
    const lead = name.match(/^(\d{1,3})\s+(?=[a-zčćđšžA-ZČĆĐŠŽ])/);
    if (lead) {
      const tok = parseInt(lead[1], 10);
      if (tok > 0) {
        name = name.slice(lead[0].length).trim();
        if (Math.abs(tok - qtyNum) > 0.02) qtyNum = tok;
      }
    }
    // Skini "Kol" broj s kraja naziva ako odgovara izračunatoj količini
    // (dopušta i zaostali zarez iz OCR-a, npr. "... GL 2 1,")
    const tail = name.match(/\s+(\d{1,3}(?:[.,]\d{1,3})?)[.,]?\s*$/);
    if (tail) {
      const tok = parsePrice(tail[1]);
      if (tok != null && Math.abs(tok - qtyNum) < 0.06) {
        name = name.slice(0, tail.index).replace(/[\s,.;:]+$/, "").trim();
        qtyNum = tok; // otisnuta količina je točnija od izračunate
      }
    }
    if (!/[a-zčćđšžA-ZČĆĐŠŽ]{2,}/.test(name)) continue; // odbaci OCR smeće

    let qtyStr = "";
    if (Math.abs(qtyNum - 1) >= 0.02) {
      qtyStr = Math.abs(qtyNum - Math.round(qtyNum)) < 0.02
        ? `${Math.round(qtyNum)} kom`
        : `${(Math.round(qtyNum * 1000) / 1000).toString().replace(".", ",")} kg`;
    }
    out.rows.push({
      name,
      qty: qtyStr,
      price: cijena.toFixed(2).replace(".", ","), // bruto jedinična cijena s računa
      lineTotal: iznos,
    });
  }
  return out;
}

function openReceiptModal() {
  els.receiptStatus.textContent = "Učitavam…";
  els.receiptReview.classList.add("hidden");
  els.receiptConfirm.classList.add("hidden");
  els.receiptRows.innerHTML = "";
  els.receiptModal.classList.remove("hidden");
}
export function closeReceiptModal() {
  els.receiptModal.classList.add("hidden");
}

export async function handleReceiptFile(file) {
  if (!file) return;
  openReceiptModal();
  try {
    els.receiptStatus.textContent = "Pripremam sliku…";
    const [Tesseract, canvas] = await Promise.all([loadTesseract(), preprocessImage(file)]);
    els.receiptStatus.textContent = "Prepoznajem tekst… (može potrajati)";
    const { data } = await Tesseract.recognize(canvas, "hrv", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          els.receiptStatus.textContent = `Prepoznajem tekst… ${Math.round((m.progress || 0) * 100)}%`;
        }
      },
    });
    fillReceiptReview(parseReceipt(data.text), data.text);
  } catch (e) {
    console.error(e);
    els.receiptStatus.textContent = "Greška pri čitanju računa. Provjeri vezu i pokušaj ponovno.";
  }
}

// Rječnik: sirovi naziv s računa (receipt_name) → tvoje ime (name).
// Gradi se iz povijesti; uzima najnovije ime za svaki naziv s računa.
function receiptAliasMap() {
  const map = {};
  for (const p of state.purchases) {
    if (!p.receipt_name || !p.name) continue;
    const k = normKey(p.receipt_name);
    if (!k) continue;
    const at = p.purchased_at || 0;
    if (!map[k] || at >= map[k].at) map[k] = { name: p.name, at };
  }
  return map;
}

function fillReceiptReview(parsed, rawText) {
  els.receiptStatus.textContent = parsed.rows.length
    ? `Pronađeno ${parsed.rows.length} stavki. Provjeri i ispravi po potrebi.`
    : "Nisam prepoznao stavke na računu. Pogledaj sirovi OCR tekst niže ili pokušaj s oštrijom slikom.";

  els.receiptRaw.textContent = rawText || "";
  els.receiptRawWrap.classList.toggle("hidden", !rawText);

  els.receiptStores.innerHTML = state.STORES.map(
    (s) => `<button type="button" class="store-chip ${s === parsed.store ? "selected" : ""}"
       data-act="receipt-store" data-store="${esc(s)}">${esc(s)}</button>`
  ).join("");
  els.receiptDate.value = msToDateInput(parsed.date || Date.now());

  const aliases = receiptAliasMap();
  els.receiptRows.innerHTML = parsed.rows.map((r, i) => {
    const alias = aliases[normKey(r.name)];
    const display = alias ? alias.name : r.name;
    // data-raw čuva sirovi naziv s računa za učenje rječnika
    return `
    <div class="receipt-row ${alias ? "recognized" : ""}" data-i="${i}" data-raw="${esc(r.name)}">
      <button type="button" class="rr-del" data-act="receipt-del" aria-label="Ukloni">×</button>
      <input class="rr-name" type="text" value="${esc(display)}" aria-label="Naziv"
             title="Na računu: ${esc(r.name)}" />
      <div class="rr-nums">
        <input class="rr-qty" type="text" value="${esc(r.qty)}" placeholder="kol" aria-label="Količina" autocomplete="off" />
        <input class="rr-price" type="text" inputmode="decimal" value="${esc(r.price)}" placeholder="cijena" aria-label="Cijena" />
      </div>
    </div>`;
  }).join("");

  if (parsed.total != null && parsed.rows.length) {
    const sum = parsed.rows.reduce((a, r) => a + (r.lineTotal || 0), 0);
    const ok = Math.abs(sum - parsed.total) < 0.02;
    els.receiptCheck.textContent =
      `Zbroj stavki: ${sum.toFixed(2)} € · Na računu: ${parsed.total.toFixed(2)} € ${ok ? "✓" : "⚠ provjeri stavke"}`;
  } else {
    els.receiptCheck.textContent = "";
  }

  els.receiptReview.classList.remove("hidden");
  els.receiptConfirm.classList.toggle("hidden", parsed.rows.length === 0);
}

export async function confirmReceipt() {
  const rows = [...els.receiptRows.querySelectorAll(".receipt-row")];
  const sel = els.receiptStores.querySelector(".store-chip.selected");
  const store = sel ? sel.dataset.store : null;
  const at = dateInputToMs(els.receiptDate.value, Date.now());
  const tripId = newTripId();
  try {
    const batch = writeBatch(db);
    let n = 0;
    for (const row of rows) {
      const name = row.querySelector(".rr-name").value.trim();
      if (!name) continue;
      batch.set(doc(purchasesCol), {
        name,
        receipt_name: row.dataset.raw || null, // sirovi naziv s računa (za rječnik)
        qty: row.querySelector(".rr-qty").value.trim() || null,
        store,
        category: usualCategoryFor(name) || null,
        price: parsePrice(row.querySelector(".rr-price").value),
        bought_by: state.userName || null,
        purchased_at: at,
        trip_id: tripId,
      });
      n++;
    }
    if (n) await batch.commit();
    closeReceiptModal();
    toast(`Spremljeno u povijest: ${n} stavki ✓`);
  } catch (e) { console.error(e); setSync(false); }
}
