# Deployment verification checkpoint — 2026-10-03

## R2 implementation checkpoint — 2026-10-04

The local code now uses private R2 multipart uploads for new model folders, Modal Volumes for worker copies, and Supabase for application records. Legacy Supabase artifacts retain read and cleanup support. The new migration disables the former browser storage insert policy. The R2 setup, bucket CORS, lifecycle, environment variables, and rollout steps are in `r2-model-storage.md`. Subsequent live R2 verification passed upload, resume, exact-byte download, and cleanup; CORS, production configuration, and worker verification still require work. See `r2-live-verification.md` for the current evidence and blockers.

Type checking, ESLint, all 119 app/database tests (including R2 signing, resume, completion, cancellation, and cleanup), 8 Python package tests, 5 Python cleanup tests, worker bundling, and the production web build passed locally. These automated R2 tests use mocked storage responses; the later live check is recorded separately. The new storage code and migration have not been verified as deployed or applied to hosted services. The rollout record below describes the previous deployment, not acceptance of this R2 change.

## Current rollout

Production: https://model-ledger-sigma.vercel.app. The authenticated application and guided setup are enabled. The private Modal control service is deployed at https://nitishyella99--modelledger-control.modal.run. `MODELLEDGER_DEPLOY_GPU=false` remains configured: existing API models evaluate through durable CPU workers; uploaded folders and repository imports can be saved as drafts. The operator explicitly deferred GPU deployment after Modal required a payment method.

Clerk's Supabase integration and the matching Supabase third-party authentication provider are enabled with operator approval. A fresh native Clerk token carries `role=authenticated`. The pilot account can read its project, onboarding operations, and reports. Browser reads of private credentials return permission denied, and anonymous project reads are denied. Server preflight verifies migrated tables, the private artifact bucket, encryption configuration, pilot allowance, private worker health, and anonymous worker rejection.

Pilot Clerk user: `user_3KBCwct1u16YiLYo0dlDJFboSH3`. Approved allowance: 1,800 seconds total, 600 seconds maximum per hosted job, and 4 GB storage. The operator authorized a $10 maximum verification budget. Allowances count wall time; they are not a USD meter. No GPU run was started.

## Real API V1/V2 verification

Both versions used the exact selected NVIDIA API model `meta/llama-3.2-11b-vision-instruct` and identical frozen reviewed tests. This verifies the version workflow with unchanged model configuration; it does not establish quality differences between different weights.

- Project: `cbfbcf57-88c3-4cb1-b3b2-6f71017ee181`.
- V1 operation: `6900c1a4-4c15-449c-bb74-12cf99edac21`; report: `d3209675-66da-47df-98c8-c0b18023d396`.
- V2 operation: `b2162850-46cf-4382-b1cf-752968a98a95`; report: `46c17076-b5f0-4738-aa0e-6506787e05de`.
- Both operations reached `ready`, with two of two cases completed and no actionable error.
- Actual answers were `4` and `Paris`, both PASS with successful execution and scoring in each report.
- Repeated authenticated creation submissions returned the same operation IDs.
- V1 initially exposed a DNS-pinned transport lookup issue. Retrying after the correction reused the same operation/project/report and completed without recreating setup.
- The signed-in production browser displayed the V2 report and comparison: two PASS-to-PASS cases, zero regressions, zero new or removed tests. Report links preserve project/version context and offer Add version and compare.

Proof screenshots are saved in the task visualization directory as `deployment-v2-report.jpg` and `deployment-v1-v2-comparison.jpg`.

## Local verification

TypeScript and ESLint pass. All 67 app/database tests pass, including ownership isolation, idempotency, atomic allowances, guidance states, exact model selection, changed-test comparison exclusions, encrypted credentials, endpoint validation, and checkpoint reuse. Previous production app and worker builds passed; the ownership migration safely supports an existing text owner column and repeated application. Eight pre-GPU model-package fixture tests passed during setup.

Operator tooling is isolated in ignored `.venv-modal`. Local credentials and smoke-operation state are ignored. The encryption key must remain stable and be backed up securely by the operator.

## Outstanding acceptance checks

These are not claimed complete by the API-only verification:

1. A real uploaded/imported small-model GPU deployment and V1/V2 evaluation, after the operator enables hosted compute.
2. Live R2 multipart interruption/resume, exact part and completed-object sizes, owner isolation, private bucket settings, and worker download (replaces the former TUS acceptance check).
3. Two independent real accounts in the browser across uploads, reports, exports, cancellation, and memory; automated isolation tests do not replace this check.
4. Live session expiry/account switching, worker interruption, cancellation/settlement, and hosted allowance exhaustion.
5. Complete authenticated keyboard/mobile verification of all guided failure and recovery states, and live memory access isolation.

Keep GPU hosting disabled until the hosted acceptance checks pass. The CPU/API rollout does not constitute acceptance of arbitrary model hosting or the original GPU deployment requirement.
