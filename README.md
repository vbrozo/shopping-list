# 🛒 Lista za kupovinu

Jednostavna web aplikacija (mobile-first) za **zajedničku** listu za kupovinu.
Lista se sinkronizira **uživo** između uređaja preko [Firebase Firestore](https://firebase.google.com),
radi **offline** (PWA) i hosta se besplatno na **GitHub Pages**. Sučelje je na hrvatskom.

---

## Funkcionalnosti

### 📝 Lista i stavke
- **Dodavanje stavki** — upis naziva + Enter ili gumb ➕.
- **Količina** — slobodan unos broja + jedinica: **kom · kg · g · l** (npr. `2 kg`, `500 g`, `1,5 l`). Prikazuje se uz naziv kao npr. `×2 kg`.
- **Označavanje kupljeno** — dodir na kvačicu ili na cijeli redak. Kupljene idu u zasebnu sekciju (precrtane).
- **Brisanje** — povuci stavku **ulijevo** (pokaže se crveni „Obriši" sloj) ili gumb ✕; nakon brisanja **„Poništi"** vraća stavku.
- **Uređivanje** — dodir na karticu otvara editor (naziv, količina, dućani, cijena).
- **⭐ Hitno** — zvjezdica na stavci; hitne stavke idu na vrh i imaju istaknut rub.
- **Jedinstvene kartice** — sve stavke imaju isti raspored: `kvačica · naziv · količina` i meta-red `dućani · cijena · tko je dodao`.

### 🏪 Dućani
- Odabir dućana **iz liste koja se uređuje u Postavkama** (zadano: Konzum, DM, Lidl, Tvornica Zdrave Hrane).
- Jedna stavka može imati **više dućana** (npr. „kupiti u Konzumu ili Lidlu").
- **Filtriranje** liste po dućanu.
- **Grupiranje** liste po dućanu (📑) — dok kupuješ vidiš stavke skupljene po dućanu.

### 🎤 Unos i prijedlozi
- **Glasovni unos** — npr. „Dodaj kruh i mlijeko" (više stavki odjednom). Prepoznaje i **dućan iz fraze**: „mlijeko iz Konzuma" → stavka *mlijeko* + dućan *Konzum* (podržava padeže). Web Speech API, jezik `hr-HR` (Chrome/Edge/Safari).
- **Prijedlozi pri tipkanju** — od 2. znaka, na temelju prijašnjih unosa/povijesti (bez duplih varijanti).
- **Automatski predloženi dućan** — kad upišeš poznati artikl, predloži dućan u kojem ga inače kupuješ.
- **⚡ Brzi unos** — najčešći artikli iz povijesti dodaju se jednim dodirom (s prošlim dućanom).

### 💰 Povijest i cijene
- **Cijena** na kupljenu stavku.
- **„Spremi u povijest"** — dijalog gdje za svaku kupljenu stavku odabereš **dućan** i upišeš **cijenu**; arhivira se s datumom i imenom kupca.
- **📷 Skeniranje računa (OCR)** — fotografiraš račun, a aplikacija pročita stavke i cijene **lokalno na uređaju** ([Tesseract.js](https://tesseract.projectnaptha.com), hrvatski model) — bez slanja slike igdje. Prepoznaje **dućan** iz zaglavlja, **datum** i svaku stavku (naziv · količina · cijena); količina se izvodi iz `iznos ÷ cijena` pa radi i za **vaganu robu** (kg) i **višekratnike**. Zbroj stavki se uspoređuje s „UKUPNO" na računu (✓/⚠). Sve je editabilno na **pregledu prije spremanja**.
- **Cijene po artiklu** — usporedba cijena po dućanu za svaki artikl; najjeftiniji označen **★**.
- **Pametno grupiranje naziva** — „Pom Bar – paprika", „Pom Bar paprika", „PomBar paprika" tretiraju se kao isti artikl (ignorira razmake, crtice, kvačice i velika/mala slova).
- **Kronološka povijest** kupovina s **pretragom**; svaki zapis se može **urediti** (naziv, količina, dućan, cijena, datum) ili obrisati.

### 🧠 Pametne procjene
- **Procjena košarice** — približan zbroj cijene trenutne liste (na temelju zadnjih poznatih cijena).
- **Pametni dućan** — preporuka „najpovoljnije na jednom mjestu" (dućan koji pokriva najviše artikala uz najniži zbroj, uz prikaz pokrivenosti npr. 5/7).

### ⚙️ Postavke
- **Tema**: Svijetlo / Tamno / **Auto** (prati postavku sustava).
- **Dućani**: dodavanje i brisanje (zajednički za sve uređaje).
- **Tvoje ime**: oznaka tko je dodao/kupio (sprema se po uređaju; gumb „Uredi" kad je već postavljeno).
- **Očisti cache i osvježi** + prikaz verzije aplikacije.

### 📲 Tehnički
- **Sinkronizacija uživo** između svih uređaja (Firestore `onSnapshot`).
- **Offline** — service worker kešira aplikaciju; Firestore ima trajni cache i sinkronizira po povratku mreže.
- **PWA** — instalira se na početni ekran (vlastita ikona).
- **Haptika** — kratka vibracija na radnje (Android; iOS Safari ne podržava web-vibraciju).
- **Monokromatske ikone** koje prate temu.

Prikaz se prebacuje između **Liste**, **Povijesti** i **Postavki** dugmadima u zaglavlju.

---

## Postavljanje (jednokratno, ~5 min)

### 1. Napravi Firebase projekt
1. [Firebase konzola](https://console.firebase.google.com) → **Add project** (besplatno).
2. **Build → Firestore Database → Create database** ("production mode"); odaberi regiju (npr. `eur3`).

### 2. Dodaj web aplikaciju i upiši konfiguraciju
1. **Project settings (zupčanik) → Your apps** → ikona **`</>`** (Web).
2. Naziv (npr. "Lista") → registriraj (Firebase Hosting nije potreban).
3. Kopiraj `firebaseConfig` objekt u [`config.js`](config.js):
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

### 3. Postavi sigurnosna pravila
U **Firestore Database → Rules** zalijepi sadržaj [`firestore.rules`](firestore.rules) i klikni **Publish**.
(Pokriva kolekcije `items`, `purchases` i `settings`.)

### 4. Uključi GitHub Pages
1. Repozitorij → **Settings → Pages**.
2. **Source: Deploy from a branch** → `main` → `/ (root)`.
3. Pričekaj minutu — link prikaže Pages. Otvori na mobitelu → **Dodaj na početni ekran**.

---

## Struktura datoteka

| Datoteka | Uloga |
|---|---|
| `index.html` | Struktura sučelja (lista, povijest, postavke, dijalozi) |
| `app.js` | Sva logika (ES modul; Firestore, render, glasovni unos, ikone…) |
| `styles.css` | Stilovi (uklj. tamni način) |
| `config.js` | Firebase konfiguracija (ispunjava korisnik) |
| `sw.js` | Service worker (offline) |
| `manifest.json` | PWA manifest |
| `firestore.rules` | Sigurnosna pravila baze |
| `icon-*.png`, `favicon-32.png` | Ikone aplikacije |

## Model podataka (Firestore)

- **`items`** (trenutna lista): `name`, `stores[]`, `qty`, `bought`, `bought_at`, `price`, `urgent`, `added_by`, `created_at`
- **`purchases`** (povijest): `name`, `qty`, `store`, `price`, `bought_by`, `purchased_at`
- **`settings/app`**: `stores[]` (lista dućana)

## Privatnost

Firebase web konfiguracija (`apiKey` itd.) je **namijenjena da bude javna** — sigurnost se
kontrolira preko Firestore Security Rules. Trenutna pravila dopuštaju pristup svakome tko ima
link aplikacije; za privatnu listu para to je u praksi dovoljno (link je nepoznat). Za pravu
zaštitu može se dodati prijava (Firebase Auth).

## Razvoj lokalno

```bash
python3 -m http.server 8000
# pa otvori http://localhost:8000
```

## Ideje za dalje
- 🔐 Zaštita prijavom (Firebase Auth) — privatna lista
- 📈 Grafovi kretanja cijena kroz vrijeme
- 🧾 Predlošci liste / „ponovi prošlu kupovinu"
- 📤 Izvoz povijesti (CSV)
- 📊 Mjesečni trošak po dućanu
- 🗂️ Kategorije/odjeli (voće-povrće, mliječno…) s redoslijedom polica po dućanu
- 📝 Više listi (npr. „Tjedna kupovina", „Roštilj")
- 🔔 Push obavijesti za hitne stavke / podsjetnici
- 🔁 Ponavljajuće stavke (npr. „mlijeko svaki tjedan")
- 📦 Barkod skener za brzo dodavanje artikla
