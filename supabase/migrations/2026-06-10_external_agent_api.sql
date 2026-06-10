-- External-agent API support: multi-draft storage per lead.
-- Unlike email_drafts / linkedin_drafts / letter_drafts (one auto-generated
-- draft per lead, upserted), lead_drafts holds N drafts per lead with a
-- status lifecycle (draft → approved → sent), written by external agents via
-- POST /api/leads/{id}/drafts. Marking one `sent` auto-logs an Interaction.

create table if not exists lead_drafts (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     text not null,
  company_id  text,
  channel     text not null check (channel in ('letter', 'email', 'linkedin_dm')),
  subject     text,
  body        text not null,
  status      text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  created_by  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_lead_drafts_lead on lead_drafts(lead_id);

alter table lead_drafts enable row level security;
