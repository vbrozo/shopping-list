"use strict";

// ── Firebase / Firestore inicijalizacija (jedinstvena točka) ───
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig) || {};
export const configured = cfg.apiKey && cfg.projectId;

const app = configured ? initializeApp(cfg) : null;
export let db = null;
if (configured) {
  // Offline trajni cache (radi i bez interneta, sinkronizira po povratku)
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Offline cache nedostupan, koristim standardni:", e);
    db = getFirestore(app);
  }
}

export const itemsCol = db ? collection(db, "items") : null;
export const purchasesCol = db ? collection(db, "purchases") : null;
export const settingsDoc = db ? doc(db, "settings", "app") : null;

// Re-export Firestore API-ja da ostali moduli ne diraju CDN izravno
export { onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, writeBatch, collection };
