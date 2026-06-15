# 🛒 Lista za kupovinu

Jednostavna web aplikacija (mobile-first) za zajedničku listu za kupovinu.
Lista se sinkronizira uživo između uređaja preko [Supabase](https://supabase.com),
a hosta se besplatno na GitHub Pages.

## Funkcionalnosti (faza 1)

- ➕ Dodavanje stavki
- ✅ Označavanje kao kupljeno
- 🏪 Dodavanje dućana na svaku stavku + filtriranje po dućanu
- 💡 Prijedlozi (autocomplete) na temelju prijašnjih unosa
- 🔄 Sinkronizacija uživo između telefona
- 📱 Može se "instalirati" na početni ekran (PWA)

## Postavljanje (jednokratno, ~5 min)

### 1. Napravi Supabase projekt
1. Idi na [supabase.com](https://supabase.com) → **New project** (besplatno).
2. Kad se projekt kreira, otvori **SQL Editor → New query**, zalijepi
   sadržaj datoteke [`schema.sql`](schema.sql) i klikni **Run**.

### 2. Upiši ključeve
1. U Supabaseu otvori **Project Settings → API**.
2. Kopiraj **Project URL** i **anon public** ključ.
3. Otvori [`config.js`](config.js) i upiši ih:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
4. Spremi i commitaj promjenu.

### 3. Uključi GitHub Pages
1. U repozitoriju: **Settings → Pages**.
2. **Source: Deploy from a branch** → branch `main` (ili tvoj branch) → `/root`.
3. Pričekaj minutu — aplikacija je dostupna na linku koji Pages prikaže.
4. Otvori link na mobitelu → izbornik preglednika → **Dodaj na početni ekran**.

## Privatnost

`anon` ključ je **namijenjen da bude javan** — sigurnost se kontrolira preko
Row Level Security pravila u bazi. Trenutna pravila (u `schema.sql`) dopuštaju
pristup svakome tko ima link aplikacije. Za privatnu listu para to je u praksi
dovoljno (link je nepoznat), ali ako želiš pravu zaštitu zaporkom, to dodajemo
u sljedećem koraku (Supabase Auth).

## Razvoj lokalno

Bilo koji statički server, npr.:
```bash
python3 -m http.server 8000
# pa otvori http://localhost:8000
```

## Plan — faza 2

- 📅 Povijest kupovine: datum, dućan, cijena (tablica `purchases` već postoji)
- 💡 Pametniji prijedlozi na temelju povijesti
- 📊 Pregled cijena po dućanima
- 🔐 Zaštita zaporkom (Supabase Auth)
