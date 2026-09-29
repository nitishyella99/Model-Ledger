create table if not exists public.evaluation_recommendations (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  test_key text,
  priority text not null,
  title text not null,
  action text not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint evaluation_recommendations_priority_check
    check (priority in ('HIGH', 'MEDIUM', 'LOW'))
);

create index if not exists evaluation_recommendations_evaluation_id_idx
  on public.evaluation_recommendations (evaluation_id);

create index if not exists evaluation_recommendations_test_key_idx
  on public.evaluation_recommendations (test_key);

alter table public.evaluation_recommendations enable row level security;

create policy "demo_public_read_evaluation_recommendations"
  on public.evaluation_recommendations
  for select
  to anon, authenticated
  using (true);

create policy "demo_public_insert_evaluation_recommendations"
  on public.evaluation_recommendations
  for insert
  to anon, authenticated
  with check (true);
