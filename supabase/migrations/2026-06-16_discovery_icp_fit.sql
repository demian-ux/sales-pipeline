-- ============================================================================
-- ICP-fit layer — 2026-06-16
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every column uses `add column if not exists`.
--
-- Adds a second scoring axis to `discoveries`. discovery_score measures how
-- big/real a deal is; icp_fit_score measures whether it's a deal oaki can sell
-- into (pre-sale, image-led residential / hospitality). The two blend into the
-- generated `combined_score`, which becomes the feed's default sort.
--
-- Going-forward only: existing rows keep icp_fit_score = NULL and continue to
-- rank by discovery_score (combined_score falls back to it). New ingests after
-- this migration populate the ICP columns. No backfill.
-- ============================================================================

-- Extracted signals (set by the analyze prompt) ----------------------------
alter table discoveries add column if not exists tenure                   text;  -- for_sale | rental | owner_occupied | mixed | unknown
alter table discoveries add column if not exists has_for_sale_residential boolean;
alter table discoveries add column if not exists project_stage            text;  -- pre_entitlement | entitled_no_design | design_in_hand | sales_launch | under_construction | built_stabilized | financing_only
alter table discoveries add column if not exists sector_fit               text;  -- high | medium | low
alter table discoveries add column if not exists viz_buyer_role           text;  -- developer_marketing | developer_principal | architect | broker | none_identified
alter table discoveries add column if not exists viz_buyer_entity         text;  -- named actor that would commission viz (≠ lender/fund)
alter table discoveries add column if not exists incumbent_viz            text;  -- render/image-credit vendor, if any
alter table discoveries add column if not exists est_scale_vs_floor       text;  -- above | near | below | unknown

-- Computed in code (lib/discoveries/icp.ts) at insert time ------------------
alter table discoveries add column if not exists icp_fit_score integer;          -- 0–100, NULL on legacy rows
alter table discoveries add column if not exists fit_tier      text;             -- prime | workable | complement | weak | disqualified
alter table discoveries add column if not exists fit_reason    text;             -- one-line why-fit / why-not
alter table discoveries add column if not exists partner_radar boolean not null default false;

-- Blended sort key (generated). When icp_fit_score is NULL (legacy rows) the
-- blend degrades to the raw discovery_score so the feed stays coherent during
-- the going-forward transition. CASE/arithmetic is immutable → valid generated.
alter table discoveries add column if not exists combined_score integer
  generated always as (
    case
      when icp_fit_score is null then discovery_score
      else round(0.6 * icp_fit_score + 0.4 * discovery_score)::int
    end
  ) stored;

create index if not exists idx_discoveries_combined on discoveries(combined_score desc);
create index if not exists idx_discoveries_fit_tier on discoveries(fit_tier);
