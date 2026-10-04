-- Clerk's native Supabase third-party integration must be configured before rollout.
-- Legacy projects intentionally remain unassigned. No automatic first-user claim.
begin;
alter table public.models add column if not exists owner_user_id text;
-- An existing column is safe to reuse only with the Clerk text identifier type.
-- Fail clearly rather than converting or overwriting existing ownership data.
do $$
begin
  if (select atttypid <> 'text'::regtype from pg_attribute
      where attrelid = 'public.models'::regclass and attname = 'owner_user_id' and not attisdropped) then
    raise exception 'models.owner_user_id must have type text for Clerk user IDs; inspect the existing column before applying this migration';
  end if;
end $$;
alter table public.models alter column owner_user_id set default (auth.jwt()->>'sub');
create index if not exists models_owner_user_id_created_at_idx on public.models (owner_user_id, created_at desc);

-- Remove every old policy on these application tables, including permissive demo policies.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('models', 'model_versions', 'version_changes', 'model_version_configurations', 'test_cases', 'evaluations', 'evaluation_results', 'evaluation_recommendations')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.models enable row level security;
revoke all on public.models from anon;
revoke all on public.models from authenticated;
grant select, insert, update on public.models to authenticated;
create policy owner_select_models on public.models for select to authenticated using (owner_user_id = (select auth.jwt()->>'sub')) ;
create policy owner_insert_models on public.models for insert to authenticated with check (owner_user_id = (select auth.jwt()->>'sub')) ;
create policy owner_update_models on public.models for update to authenticated using (owner_user_id = (select auth.jwt()->>'sub')) with check (owner_user_id = (select auth.jwt()->>'sub')) ;

alter table public.model_versions enable row level security;
revoke all on public.model_versions from anon;
revoke all on public.model_versions from authenticated;
grant select, insert, update, delete on public.model_versions to authenticated;
create policy owner_select_model_versions on public.model_versions for select to authenticated using (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_insert_model_versions on public.model_versions for insert to authenticated with check (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_update_model_versions on public.model_versions for update to authenticated using (exists (select 1 from public.models m where m.id = model_id)) with check (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_delete_model_versions on public.model_versions for delete to authenticated using (exists (select 1 from public.models m where m.id = model_id)) ;

alter table public.version_changes enable row level security;
revoke all on public.version_changes from anon;
revoke all on public.version_changes from authenticated;
grant select, insert on public.version_changes to authenticated;
create policy owner_select_version_changes on public.version_changes for select to authenticated using (exists (select 1 from public.model_versions v where v.id = model_version_id)) ;
create policy owner_insert_version_changes on public.version_changes for insert to authenticated with check (exists (select 1 from public.model_versions v where v.id = model_version_id)) ;

alter table public.model_version_configurations enable row level security;
revoke all on public.model_version_configurations from anon;
revoke all on public.model_version_configurations from authenticated;
grant select, insert, update on public.model_version_configurations to authenticated;
create policy owner_select_model_version_configurations on public.model_version_configurations for select to authenticated using (exists (select 1 from public.model_versions v where v.id = model_version_id)) ;
create policy owner_insert_model_version_configurations on public.model_version_configurations for insert to authenticated with check (exists (select 1 from public.model_versions v where v.id = model_version_id)) ;
create policy owner_update_model_version_configurations on public.model_version_configurations for update to authenticated using (exists (select 1 from public.model_versions v where v.id = model_version_id)) with check (exists (select 1 from public.model_versions v where v.id = model_version_id)) ;

alter table public.test_cases enable row level security;
revoke all on public.test_cases from anon;
revoke all on public.test_cases from authenticated;
grant select, insert, update on public.test_cases to authenticated;
create policy owner_select_test_cases on public.test_cases for select to authenticated using (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_insert_test_cases on public.test_cases for insert to authenticated with check (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_update_test_cases on public.test_cases for update to authenticated using (exists (select 1 from public.models m where m.id = model_id)) with check (exists (select 1 from public.models m where m.id = model_id)) ;

alter table public.evaluations enable row level security;
revoke all on public.evaluations from anon;
revoke all on public.evaluations from authenticated;
grant select, insert, update on public.evaluations to authenticated;
create policy owner_select_evaluations on public.evaluations for select to authenticated using (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_insert_evaluations on public.evaluations for insert to authenticated with check (exists (select 1 from public.models m where m.id = model_id)) ;
create policy owner_update_evaluations on public.evaluations for update to authenticated using (exists (select 1 from public.models m where m.id = model_id)) with check (exists (select 1 from public.models m where m.id = model_id)) ;

alter table public.evaluation_results enable row level security;
revoke all on public.evaluation_results from anon;
revoke all on public.evaluation_results from authenticated;
grant select, insert on public.evaluation_results to authenticated;
create policy owner_select_evaluation_results on public.evaluation_results for select to authenticated using (exists (select 1 from public.evaluations e where e.id = evaluation_id)) ;
create policy owner_insert_evaluation_results on public.evaluation_results for insert to authenticated with check (exists (select 1 from public.evaluations e where e.id = evaluation_id)) ;

alter table public.evaluation_recommendations enable row level security;
revoke all on public.evaluation_recommendations from anon;
revoke all on public.evaluation_recommendations from authenticated;
grant select, insert on public.evaluation_recommendations to authenticated;
create policy owner_select_evaluation_recommendations on public.evaluation_recommendations for select to authenticated using (exists (select 1 from public.evaluations e where e.id = evaluation_id)) ;
create policy owner_insert_evaluation_recommendations on public.evaluation_recommendations for insert to authenticated with check (exists (select 1 from public.evaluations e where e.id = evaluation_id)) ;

-- Authenticated clients cannot transfer ownership, including by direct REST calls.
create or replace function public.enforce_project_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.owner_user_id is distinct from (select auth.jwt()->>'sub') or new.owner_user_id is null then
        raise exception 'Invalid project owner' using errcode = '42501';
      end if;
    elsif new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Project ownership cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_project_owner on public.models;
create trigger enforce_project_owner before insert or update on public.models
for each row execute function public.enforce_project_owner();

-- Validate new/changed relationships without rewriting historical records.
-- These invoker functions retain RLS when called by authenticated clients.
create or replace function public.enforce_project_relationships() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'models' then
    if new.current_model_version_id is not null and not exists (
      select 1 from public.model_versions v where v.id = new.current_model_version_id and v.model_id = new.id
    ) then
      raise exception 'Current version must belong to this project' using errcode = '23514';
    end if;
  elsif tg_table_name = 'test_cases' then
    if new.model_version_id is not null and not exists (
      select 1 from public.model_versions v where v.id = new.model_version_id and v.model_id = new.model_id
    ) then
      raise exception 'Test version must belong to this project' using errcode = '23514';
    end if;
  elsif tg_table_name = 'evaluation_results' then
    if new.test_case_id is not null and not exists (
      select 1 from public.test_cases t join public.evaluations e on e.model_id = t.model_id
      where t.id = new.test_case_id and e.id = new.evaluation_id
    ) then
      raise exception 'Test case must belong to the evaluated project' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_current_version_project on public.models;
create trigger enforce_current_version_project before insert or update of current_model_version_id on public.models
for each row execute function public.enforce_project_relationships();
drop trigger if exists enforce_test_version_project on public.test_cases;
create trigger enforce_test_version_project before insert or update of model_id, model_version_id on public.test_cases
for each row execute function public.enforce_project_relationships();
drop trigger if exists enforce_result_test_project on public.evaluation_results;
create trigger enforce_result_test_project before insert or update of evaluation_id, test_case_id on public.evaluation_results
for each row execute function public.enforce_project_relationships();

notify pgrst, 'reload schema';
commit;
