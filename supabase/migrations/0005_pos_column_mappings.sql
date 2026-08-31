-- Rev Catcher — Phase 5 (CSV Import): reusable per-org column mappings
-- (spec §19: "Save reusable mappings per organization").

create table pos_column_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Default mapping',
  -- { transaction_id, timestamp, location, employee, item_name, category,
  --   quantity, price, discount, voided, refunded } -> source CSV header,
  -- or null where a field isn't mapped. Shape enforced in application code
  -- (src/lib/csv-import/types.ts), not in SQL — this is config, not a
  -- tenant-scoped business record, so a jsonb column is the right level of
  -- ceremony for it.
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pos_column_mappings_org_idx on pos_column_mappings(organization_id);

create trigger pos_column_mappings_set_updated_at
  before update on pos_column_mappings
  for each row execute function set_updated_at();

alter table pos_column_mappings enable row level security;

create policy "pos_column_mappings: managers can view" on pos_column_mappings
  for select using (organization_id = current_org_id() and is_manager_or_above());

create policy "pos_column_mappings: managers can write" on pos_column_mappings
  for all using (organization_id = current_org_id() and is_manager_or_above())
  with check (organization_id = current_org_id() and is_manager_or_above());
