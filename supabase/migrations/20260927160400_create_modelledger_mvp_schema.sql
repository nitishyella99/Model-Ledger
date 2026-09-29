create extension if not exists pgcrypto;

create table public.models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  purpose text not null,
  current_model_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  version text not null,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  constraint model_versions_status_check
    check (status in ('DRAFT', 'APPROVED', 'MONITORING', 'DEPRECATED')),
  constraint model_versions_model_id_version_key unique (model_id, version)
);

alter table public.models
  add constraint models_current_model_version_id_fkey
  foreign key (current_model_version_id)
  references public.model_versions(id)
  on delete set null;

create table public.version_changes (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  change_type text not null,
  field_name text,
  previous_value text,
  new_value text,
  description text not null,
  created_at timestamptz not null default now(),
  constraint version_changes_change_type_check
    check (change_type in ('SYSTEM_PROMPT', 'TOOLING', 'POLICY', 'MODEL_CONFIG', 'EVALUATION', 'OTHER'))
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  name text not null,
  evaluated_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  test_name text not null,
  test_key text,
  category text not null,
  test_input text not null,
  expected_result text not null,
  actual_result text not null,
  result text not null,
  severity text not null,
  evaluator_notes text,
  created_at timestamptz not null default now(),
  constraint evaluation_results_result_check
    check (result in ('PASS', 'FAIL')),
  constraint evaluation_results_severity_check
    check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

create index models_created_at_idx
  on public.models (created_at desc);

create index models_current_model_version_id_idx
  on public.models (current_model_version_id);

create index model_versions_model_id_idx
  on public.model_versions (model_id);

create index model_versions_created_at_idx
  on public.model_versions (created_at desc);

create index version_changes_model_version_id_idx
  on public.version_changes (model_version_id);

create index version_changes_created_at_idx
  on public.version_changes (created_at desc);

create index evaluations_model_id_idx
  on public.evaluations (model_id);

create index evaluations_model_version_id_idx
  on public.evaluations (model_version_id);

create index evaluations_evaluated_at_idx
  on public.evaluations (evaluated_at desc);

create index evaluations_created_at_idx
  on public.evaluations (created_at desc);

create index evaluation_results_evaluation_id_idx
  on public.evaluation_results (evaluation_id);

create index evaluation_results_test_key_idx
  on public.evaluation_results (test_key);

create index evaluation_results_result_idx
  on public.evaluation_results (result);

create index evaluation_results_severity_idx
  on public.evaluation_results (severity);

create index evaluation_results_created_at_idx
  on public.evaluation_results (created_at desc);
