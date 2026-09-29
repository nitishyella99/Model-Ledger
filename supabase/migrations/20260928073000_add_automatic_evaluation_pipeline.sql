create table if not exists public.test_cases (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  model_id uuid not null references public.models(id) on delete cascade,
  name text not null,
  category text not null,
  input text not null,
  expected_output text not null,
  evaluation_criteria jsonb not null default '{}'::jsonb,
  evaluator_type text not null default 'exact_match',
  threshold numeric(5, 4) not null default 1,
  severity text not null default 'LOW',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_cases_model_id_stable_key_key unique (model_id, stable_key),
  constraint test_cases_evaluator_type_check
    check (evaluator_type in ('exact_match', 'contains', 'llm_judge')),
  constraint test_cases_threshold_check
    check (threshold >= 0 and threshold <= 1),
  constraint test_cases_severity_check
    check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

create table if not exists public.model_version_configurations (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  provider text not null,
  model_name text not null,
  base_url text,
  endpoint_url text,
  system_prompt text,
  temperature numeric(4, 3) not null default 0,
  max_tokens integer,
  provider_settings jsonb not null default '{}'::jsonb,
  credential_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_version_configurations_model_version_id_key unique (model_version_id),
  constraint model_version_configurations_temperature_check
    check (temperature >= 0 and temperature <= 2),
  constraint model_version_configurations_max_tokens_check
    check (max_tokens is null or max_tokens > 0)
);

alter table public.evaluations
  add column if not exists status text not null default 'COMPLETED',
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists total_tests integer,
  add column if not exists passed_count integer,
  add column if not exists failed_count integer,
  add column if not exists error_count integer,
  add column if not exists average_score numeric(6, 4),
  add column if not exists total_input_tokens integer,
  add column if not exists total_output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_cost_usd numeric(12, 6),
  add column if not exists run_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluations_status_check'
  ) then
    alter table public.evaluations
      add constraint evaluations_status_check
      check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'));
  end if;
end $$;

alter table public.evaluation_results
  add column if not exists test_case_id uuid references public.test_cases(id) on delete set null,
  add column if not exists input_snapshot text,
  add column if not exists expected_output_snapshot text,
  add column if not exists evaluation_criteria_snapshot jsonb,
  add column if not exists evaluator_type text,
  add column if not exists threshold numeric(5, 4),
  add column if not exists score numeric(6, 4),
  add column if not exists passed boolean,
  add column if not exists evaluator_reason text,
  add column if not exists evaluator_evidence jsonb,
  add column if not exists model_latency_ms integer,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_cost_usd numeric(12, 6),
  add column if not exists provider_status text,
  add column if not exists provider_error text,
  add column if not exists provider_metadata jsonb,
  add column if not exists execution_status text,
  add column if not exists evaluator_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_results_evaluator_type_check'
  ) then
    alter table public.evaluation_results
      add constraint evaluation_results_evaluator_type_check
      check (evaluator_type is null or evaluator_type in ('exact_match', 'contains', 'llm_judge'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_results_threshold_check'
  ) then
    alter table public.evaluation_results
      add constraint evaluation_results_threshold_check
      check (threshold is null or (threshold >= 0 and threshold <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_results_score_check'
  ) then
    alter table public.evaluation_results
      add constraint evaluation_results_score_check
      check (score is null or (score >= 0 and score <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_results_execution_status_check'
  ) then
    alter table public.evaluation_results
      add constraint evaluation_results_execution_status_check
      check (execution_status is null or execution_status in ('SUCCESS', 'AUTH_FAILURE', 'TIMEOUT', 'RATE_LIMIT', 'API_FAILURE', 'MALFORMED_RESPONSE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_results_evaluator_status_check'
  ) then
    alter table public.evaluation_results
      add constraint evaluation_results_evaluator_status_check
      check (evaluator_status is null or evaluator_status in ('SUCCESS', 'ERROR'));
  end if;
end $$;

create index if not exists test_cases_model_id_idx
  on public.test_cases (model_id);

create index if not exists test_cases_stable_key_idx
  on public.test_cases (stable_key);

create index if not exists test_cases_category_idx
  on public.test_cases (category);

create index if not exists model_version_configurations_model_version_id_idx
  on public.model_version_configurations (model_version_id);

create index if not exists evaluations_status_idx
  on public.evaluations (status);

create index if not exists evaluation_results_test_case_id_idx
  on public.evaluation_results (test_case_id);

create index if not exists evaluation_results_score_idx
  on public.evaluation_results (score);

alter table public.test_cases enable row level security;
alter table public.model_version_configurations enable row level security;

create policy "demo_public_read_test_cases"
  on public.test_cases
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_test_cases"
  on public.test_cases
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_update_test_cases"
  on public.test_cases
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "demo_public_read_model_version_configurations"
  on public.model_version_configurations
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_model_version_configurations"
  on public.model_version_configurations
  for insert
  to anon, authenticated
  with check (true);

create policy "demo_public_update_model_version_configurations"
  on public.model_version_configurations
  for update
  to anon, authenticated
  using (true)
  with check (true);
