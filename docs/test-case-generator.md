# Test case generation

Describe the application's tasks, input/output format, authoritative rules, requested focus, and known failures in the generator chat. Include representative inputs and expected behavior when available. Follow-up answers stay in the conversation; clarification is checked on every request.

For example:

> Classify code snippets into Python, JavaScript, SQL, or unknown. Return JSON with one key, language. Unsupported code and prose must return unknown. Test supported languages, unsupported code, and prose mentioning a language name. A known failure is classifying prose that mentions Python as Python code.

The generator first analyzes requirements and builds a coverage plan. It generates 5–15 complete cases, reviews the full suite, and attempts one repair of rejected cases while retaining accepted ones. Local validation enforces counts, objective allocation, and duplicate inputs. AI review checks semantic relevance, diversity, and expectations against the original context. A suite that still fails review is withheld; provider failures do not produce fallback cases.

Each case includes a descriptive name, objective, input, draft expected behavior, and observable pass/fail criteria. Review expectations before evaluating: an AI review can make mistakes, including incorrectly rejecting a valid case.

The CSV retains the existing import columns. `expected_output` combines behavior and pass/fail criteria for the LLM judge; evaluator, threshold, and severity defaults remain `llm_judge`, `0.75`, and `MEDIUM`. Exported fields are single lines for compatibility with the current importer. The on-screen preview preserves input formatting. Generation does not import cases or run evaluations automatically.

The configured AI provider and model are unchanged. The completion interface accepts an optional JSON schema; supported providers receive a strict response schema, while other providers retain JSON-object mode. Responses are validated in either mode. A request uses at most five provider calls (analysis, generation, review, repair, final review), each with a 75-second timeout. The page execution budget is 420 seconds, subject to the deployment platform's limits.

Generator tests use controlled provider responses to verify clarification, validation, repair, and CSV/evaluator compatibility. Those tests do not establish the quality or reliability of a particular live model.
