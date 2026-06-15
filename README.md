# 🛒 Lista za kupovinu

Jednostavna web aplikacija (mobile-first) za zajedničku listu za kupovinu.
Lista se sinkronizira uživo između uređaja preko [Firebase Firestore](https://firebase.google.com),
a hosta se besplatno na GitHub Pages.

## Funkcionalnosti

**Lista (faza 1)**
- ➕ Dodavanje stavki
- ✅ Označavanje kao kupljeno
- 🏪 Odabir dućana iz fiksne liste (Konzum, DM, Lidl, Tvornica Zdrave Hrane), može više po stavci + filtriranje po dućanu
- 💡 Prijedlozi (autocomplete) na temelju prijašnjih unosa
- 🎤 Glasovni unos — npr. „Dodaj kruh i mlijeko" (Web Speech API, hr-HR; Chrome/Safari)
- 🔄 Sinkronizacija uživo između telefona
- 📱 Može se "instalirati" na početni ekran (PWA)

**Povijest i cijene (faza 2)**
- 💰 Upis cijene na kupljenu stavku
- 📦 „Spremi u povijest" — arhivira kupljene stavke (datum, dućan, cijena)
- 📊 Pregled cijena po artiklu (najjeftiniji dućan + zadnja cijena)
- 📅 Kronološka povijest kupovina s pretragom
- ⚡ Brzi unos — najčešći artikli iz povijesti dodaju se jednim dodirom (s prošlim dućanom)

Prikaz se prebacuje između **Liste** 🛒 i **Povijesti** 📜 dugmetom u zaglavlju.

## Postavljanje (jednokratno, ~5 min)

### 1. Napravi Firebase projekt
1. Idi na [Firebase konzolu](https://console.firebase.google.com) → **Add project** (besplatno).
2. Otvori **Build → Firestore Database → Create database** (možeš odabrati
   "production mode", pravila postavljamo u koraku 3). Odaberi regiju (npr. `eur3`).

### 2. Dodaj web aplikaciju i upiši konfiguraciju
1. U **Project settings (zupčanik) → Your apps** klikni ikonu **`</>`** (Web).
2. Daj joj naziv (npr. "Lista") i registriraj — **GitHub Pages hosting NIJE potreban**.
3. Kopiraj prikazani `firebaseConfig` objekt.
4. Otvori [`config.js`](config.js) i zalijepi vrijednosti:
   ```js
   window.APP_CONFIG = {
     firebaseConfig: {
       apiKey: "AIza...",
       authDomain: "tvoj-projekt.firebaseapp.com",
       projectId: "tvoj-projekt",
       storageBucket: "tvoj-projekt.appspot.com",
       messagingSenderId: "123...",
       appId: "1:123...:web:abc..."
     }
   };
   ```
5. Spremi i commitaj promjenu.

### 3. Postavi sigurnosna pravila
1. U **Firestore Database → Rules** zalijepi sadržaj datoteke
   [`firestore.rules`](firestore.rules) i klikni **Publish**.

### 4. Uključi GitHub Pages
1. U repozitoriju: **Settings → Pages**.
2. **Source: Deploy from a branch** → branch `main` (ili tvoj branch) → `/root`.
3. Pričekaj minutu — aplikacija je dostupna na linku koji Pages prikaže.
4. Otvori link na mobitelu → izbornik preglednika → **Dodaj na početni ekran**.

## Privatnost

Firebase web konfiguracija (`apiKey` itd.) je **namijenjena da bude javna** —
sigurnost se kontrolira preko Firestore Security Rules. Trenutna pravila (u
`firestore.rules`) dopuštaju pristup svakome tko ima link aplikacije. Za
privatnu listu para to je u praksi dovoljno (link je nepoznat), ali ako želiš
pravu zaštitu prijavom, to dodajemo u sljedećem koraku (Firebase Auth).

## Razvoj lokalno

Bilo koji statički server, npr.:
```bash
python3 -m http.server 8000
# pa otvori http://localhost:8000
```

## Plan — faza 3 (ideje)

- 🔐 Zaštita prijavom (Firebase Auth) — privatna lista
- 📈 Grafovi kretanja cijena kroz vrijeme
- 🧾 Grupiranje povijesti po „kupovini" (jedan odlazak u dućan)
- 📤 Izvoz povijesti (CSV)
