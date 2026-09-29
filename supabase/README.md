# ModelLedger Supabase Setup

## Environment

Required local variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Only the public anon key is used by the application. Do not add a Supabase
service-role key to any `NEXT_PUBLIC_*` variable or browser-facing module.

## Phase 2 Security Posture

This hackathon MVP intentionally does not include authentication, users,
organizations, or role-based access control. The RLS migration enables explicit
demo policies that allow anonymous reads and MVP writes needed by the app:

- create models
- add model versions and version changes
- submit evaluations and evaluation results
- update a model's current version pointer

Delete operations are not allowed by the demo policies.

This is not production-secure. Before a public production deployment, replace
the demo policies with authenticated, ownership-aware policies and move any
privileged operations behind server-only code that uses appropriately protected
credentials.
