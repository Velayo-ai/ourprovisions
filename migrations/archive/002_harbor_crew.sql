-- ============================================================
-- OurProvisions — Migration 002
-- The Harbor: Velayo Crew Layer
-- ============================================================
-- Adds the harbor-level identity layer that sits above all apps.
-- A crew is a user's permanent circle of people — the source of
-- truth for who they do things with across every Velayo app.
--
-- Households (OurProvisions) draw from a crew.
-- Future apps (OurManifest trips, etc.) will do the same.
--
-- Run AFTER 001_initial_schema.sql
-- Safe to run on existing data — households.crew_id is nullable.
-- ============================================================


-- ============================================================
-- VELAYO CREWS
-- Harbor level. Sits above any individual app.
-- One crew per primary user — their permanent circle of people.
-- ============================================================
create table velayo_crews (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                         -- e.g. "The Holmes Crew"
  created_by    uuid references users(id) not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);


-- ============================================================
-- VELAYO CREW MEMBERS
-- Who belongs to a crew and what role they have.
-- Roles: owner (created the crew), member (invited in), guest
-- ============================================================
create table velayo_crew_members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid references velayo_crews(id) not null,
  user_id     uuid references users(id) not null,
  role        text default 'member' check (role in ('owner', 'member', 'guest')),
  invited_by  uuid references users(id),               -- who brought them in
  joined_at   timestamptz default now(),
  deleted_at  timestamptz,
  unique (crew_id, user_id)
);


-- ============================================================
-- LINK HOUSEHOLDS TO CREWS
-- Nullable for now — existing households are unaffected.
-- Populated when the harbor UI is built (Phase 2+).
-- ============================================================
alter table households
  add column crew_id uuid references velayo_crews(id);


-- ============================================================
-- INDEXES
-- ============================================================
create index idx_velayo_crew_members_crew    on velayo_crew_members(crew_id);
create index idx_velayo_crew_members_user    on velayo_crew_members(user_id);
create index idx_households_crew             on households(crew_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table velayo_crews        enable row level security;
alter table velayo_crew_members enable row level security;

-- Crews: visible to members only
create policy "crews_for_members" on velayo_crews
  for all using (
    id in (
      select crew_id from velayo_crew_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Crew members: visible within same crew
create policy "crew_members_in_same_crew" on velayo_crew_members
  for all using (
    crew_id in (
      select crew_id from velayo_crew_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );


-- ============================================================
-- REALTIME
-- Crew membership changes should sync live across all apps.
-- ============================================================
alter publication supabase_realtime add table velayo_crew_members;


-- ============================================================
-- END OF MIGRATION 002
-- Next: Migration 003 will add Phase 2 shopping intelligence
-- (shopping_sessions, known_stores, pantry_snapshots)
-- ============================================================
