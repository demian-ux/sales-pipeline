-- ============================================================================
-- Review state — 2026-07-14
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: additive columns only, and every backfill is idempotent
-- (each one narrows to rows that don't already carry the new state).
--
-- Why: after a full triage pass on 14 Jul the board still read "34 unworked",
-- because `unworked` meant "no outreach consumed this row yet" — which conflates
-- *never reviewed* with *reviewed and deliberately kept*. Splitting those two is
-- the point of this migration.
--
--   • work_status gains 'benched'  — reviewed, kept, still offered to runs.
--     'unworked' now strictly means NEVER REVIEWED. (No DB check constraint on
--     the column; the enum is enforced in src/lib/vocab.ts + the PATCH route.)
--   • reviewed_at — set whenever ANY verdict is written, benched included.
--     worked_at keeps its old meaning: a run *consumed* the row.
--   • re_arm_at — a held row returns to the active board on this date instead of
--     disappearing behind the toggle until a human remembers it.
-- ============================================================================

alter table discoveries add column if not exists reviewed_at timestamptz;
alter table discoveries add column if not exists re_arm_at   date;

-- Provenance for the ingest dedup guard: when a later article covers a project
-- we already hold, we note its URL here instead of inserting a second row.
alter table discoveries add column if not exists duplicate_urls text[];

create index if not exists idx_discoveries_re_arm_at on discoveries(re_arm_at);

comment on column discoveries.work_status is
  'unworked (never reviewed) | benched (reviewed, kept) | drafted | held | rejected | already_engaged';
comment on column discoveries.reviewed_at is
  'When any verdict was written, benched included. worked_at = when a run consumed the row.';

-- ── 1. reviewed_at backfill ─────────────────────────────────────────────────
-- Every row that already carries a verdict was, by definition, reviewed then.
update discoveries
   set reviewed_at = worked_at
 where reviewed_at is null
   and worked_at is not null
   and work_status <> 'unworked';

-- ── 2. Bench the 14 Jul triage pass ─────────────────────────────────────────
-- Scope check (verified against the DB on 2026-07-14 before writing this):
--   active + unworked                                     = 116 rows
--   …of which fit_tier = 'disqualified'                   =  72 rows  ← never on the
--     board (the board hides disqualified), so NOT reviewed → stay 'unworked'
--   …leaving prime | workable | weak | NULL tier          =  44 rows  ← the board
--     the triage actually worked through → 'benched'
-- The 44 here is the same 44 the handoff counted. Rows ingested after the cutoff
-- are genuinely new and stay 'unworked' — that is the number the widget reports.
update discoveries
   set work_status = 'benched',
       reviewed_at = timestamptz '2026-07-14 20:00:00+00',
       work_reason = coalesce(work_reason, 'Triage 14 Jul 2026: reviewed and kept on bench')
 where status = 'active'
   and work_status = 'unworked'
   and coalesce(fit_tier, '') <> 'disqualified'
   and created_at < timestamptz '2026-07-14 20:00:00+00';

-- ── 3. project_key backfill (feeds the dedup + reject-resurrection guard) ────
-- Mirrors makeProjectKey() in src/lib/discoveries/project-key.ts exactly:
-- lower → strip non-alphanumerics to spaces → collapse → trim; name must be
-- 3+ chars; key = 'name|city', or 'name' when no city.
with normalized as (
  select id,
         btrim(regexp_replace(regexp_replace(lower(project_name), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) as name_key,
         btrim(regexp_replace(regexp_replace(lower(coalesce(city, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) as city_key
    from discoveries
   where project_key is null
     and project_name is not null
)
update discoveries d
   set project_key = case when n.city_key <> '' then n.name_key || '|' || n.city_key else n.name_key end
  from normalized n
 where d.id = n.id
   and length(n.name_key) >= 3;

-- The ALMA trap: rejected 22 May (EB-5 student housing mislabeled as luxury),
-- resurfaced 14 Jul as a fresh active item at combined score 72 because the row
-- carries no project_name → no project_key → nothing for dedup to match on.
-- Give the rejection a key so the guard can inherit the verdict next time.
update discoveries
   set project_key = 'alma|miami'
 where project_key is null
   and work_status = 'rejected'
   and title ilike '%ALMA Miami Real Estate Project%';

-- ── 4. Seed re-arm dates on the current holds ───────────────────────────────
-- Meliá / UNCG: held for want of a verified mailbox; re-arm at the opening
-- milestone (est. Q4 2026). The other two holds (13th Edge, La Musique) have no
-- dated trigger — they stay held until a human re-arms them.
update discoveries
   set re_arm_at = date '2026-10-01'
 where work_status = 'held'
   and re_arm_at is null
   and title ilike '%Meli%';
