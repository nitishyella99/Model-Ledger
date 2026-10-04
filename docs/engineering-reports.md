# Engineering evaluation reports

Reports analyze the selected evaluation run. Stored PASS/FAIL results, issue classifications, and comparable baselines remain authoritative. The report distinguishes model-quality failures from execution/evaluator errors and includes category performance.

AI analysis receives summary facts for every recorded test and at most ten detailed examples, prioritized by execution errors, regressions, and severity. A resolved example is included when available. Detailed inputs, expected/actual outputs, evaluator reasoning, and histories are bounded; the report discloses omissions and truncation and links to complete test outputs.

Findings and actions cite evidence IDs and affected tests. Possible contributors are hypotheses. Actions identify a concrete investigation or proposed change and explain how to verify the affected tests. Unknown references, contradictory structured states, missing priority findings, unsupported training remedies, and generic verification steps trigger one corrective retry. Provider failures or repeated invalid output leave deterministic findings and actions available.

Historical recall covers at most five prioritized tests. Related memories are deduplicated and separated from stored history. Evidence from after the selected run is excluded from its historical context. Turning memory off excludes both stored and recalled memory from AI analysis; per-test recorded result history remains available.

Missing token/cost totals remain `null`, distinct from a recorded zero. `telemetryCoverage` identifies how many test rows supplied each metric; partial totals are labeled in the UI. Category totals follow the same rules. Baseline recommendations require a completed, nonempty, all-pass run without execution/evaluator errors or a known result-count mismatch.

The JSON export contains the corrected report facts, sourced stored-history records, deterministic findings, and recommendations with verification steps. AI analysis is generated for the current page and is not saved or added to the export. Existing historical recommendation records are preserved; newly generated records include verification information in their evidence JSON.

The configured provider/model is unchanged. Report AI calls allow 75 seconds and up to 6,000 output tokens each, with at most one retry. The page allows 240 seconds subject to hosting limits. Supported providers receive a strict JSON schema; other providers receive JSON-object mode with the schema included in the prompt. Analysis remains advisory: validated references and passing controlled tests do not prove every narrative claim from a live model.
