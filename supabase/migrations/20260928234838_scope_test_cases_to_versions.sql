alter table public.test_cases
  add column if not exists model_version_id uuid references public.model_versions(id) on delete cascade;

update public.test_cases
set model_version_id = models.current_model_version_id
from public.models
where test_cases.model_id = models.id
  and test_cases.model_version_id is null
  and models.current_model_version_id is not null;

alter table public.test_cases
  drop constraint if exists test_cases_model_id_stable_key_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_cases_model_id_model_version_id_stable_key_key'
  ) then
    alter table public.test_cases
      add constraint test_cases_model_id_model_version_id_stable_key_key
      unique (model_id, model_version_id, stable_key);
  end if;
end $$;

create index if not exists test_cases_model_version_id_idx
  on public.test_cases (model_version_id);
