# Failure recurrence acceptance demo

Open `/demo/recurrence` after signing in, or choose **See recurrence demo** on Reports. The clearly labeled synthetic sample makes no provider calls and writes no project data. It uses the production recurrence engine and report component.

## Walkthrough

1. Show the two affected refund cases in v7. The within-window control case still passes.
2. Follow the earlier-failure evidence to v3, then the first passing evidence to v4. Inspect the exact inputs, expected/actual outputs, evaluator threshold, and recorded execution/evaluation status.
3. Inspect the v4 change adding refund eligibility instructions and the v7 change replacing them. These are suspected contributors; the record does not prove a causal fix.
4. Read the verification plan: rerun the affected case on the current and last-passing versions with unchanged criteria, isolate one suspected change on a new candidate, repeat to check variability, and run the full suite.

## Real project behavior

Real run reports display **Failures that returned** when an explicit stable test key and matching input, expected output, evaluator, threshold, and criteria connect a previous failure, a later passing version, and a current failure. All three must have successful execution and evaluation. Legacy records without snapshots cannot establish this chain. Evidence after the selected run is excluded.

Each event links to its original report and test evidence. Recorded before/after version changes appear alongside the chain. **Prepare affected-case rerun** and **Prepare last-passing baseline** open the evaluation form with the matching case preselected, preferring version-specific cases over shared cases. The user reviews the current canonical definition before running; the form does not recreate immutable historical snapshots. Missing cases are not replaced with unrelated tests.

The JSON report export includes recurrence evidence and the verification plan. The feature works without AI analysis or Hindsight availability. It establishes recurrence of a tested requirement, not semantic identity of an incident or a confirmed root cause.

## Automated acceptance

`npm test` checks the v3/v4/v7 chain, definition changes, error states, missing snapshots, future evidence, rerun selection, real report rendering and source links, and synthetic demo rendering. `npm run type-check` and `npm run lint` check integration.
