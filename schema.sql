-- ════════════════════════════════════════════════════════════════
--  Lista za kupovinu — Supabase shema
--  Pokreni ovo u Supabase: SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════════

-- ── Tablica: trenutna lista za kupovinu ─────────────────────────
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  store       text,
  bought      boolean not null default false,
  bought_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ── Tablica: povijest kupovine (FAZA 2 — cijene/datumi) ─────────
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  store         text,
  price         numeric(10, 2),
  purchased_at  timestamptz not null default now()
);

create index if not exists purchases_name_idx on public.purchases (name);

-- ── Realtime (sinkronizacija uživo) ─────────────────────────────
alter publication supabase_realtime add table public.items;

-- ── Sigurnost (RLS) ─────────────────────────────────────────────
--  Napomena: ove politike dopuštaju pristup svima koji imaju link +
--  anon ključ. Za privatnu listu para to je u redu (link je nepoznat),
--  a kasnije se može dodati zaporka. Vidi README → "Privatnost".
alter table public.items enable row level security;
alter table public.purchases enable row level security;

create policy "items: pristup svima" on public.items
  for all using (true) with check (true);

create policy "purchases: pristup svima" on public.purchases
  for all using (true) with check (true);
