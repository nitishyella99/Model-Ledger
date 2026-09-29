alter table public.evaluation_results
  add column if not exists test_key text;

create index if not exists evaluation_results_test_key_idx
  on public.evaluation_results (test_key);

