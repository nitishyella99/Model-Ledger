-- Phase 2 MVP security posture:
-- The hackathon demo has no authentication yet. These RLS policies make the
-- current public demo behavior explicit: anonymous users may read and create
-- MVP records, update only models for current-version tracking, and cannot
-- delete records through the anon/authenticated roles.

alter table public.models enable row level security;
alter table public.model_versions enable row level security;
alter table public.version_changes enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_results enable row level security;

alter table public.model_versions
  add constraint model_versions_id_model_id_key unique (id, model_id);

alter table public.evaluations
  add constraint evaluations_model_version_belongs_to_model_fkey
  foreign key (model_version_id, model_id)
  references public.model_versions (id, model_id)
  on delete cascade;

create policy "demo_public_read_models"
  on public.models
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_models"
  on public.models
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_update_models"
  on public.models
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "demo_public_read_model_versions"
  on public.model_versions
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_model_versions"
  on public.model_versions
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_read_version_changes"
  on public.version_changes
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_version_changes"
  on public.version_changes
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_read_evaluations"
  on public.evaluations
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_evaluations"
  on public.evaluations
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_read_evaluation_results"
  on public.evaluation_results
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_evaluation_results"
  on public.evaluation_results
  for insert
  to anon, authenticated
  with check (true);
