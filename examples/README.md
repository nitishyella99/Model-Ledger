# Sample test cases

Import `test-cases.csv` into a model version after creating your own project. The file uses the application's supported CSV columns and needs no external download. Configure the version's model endpoint and credentials before evaluating.

The sample tests factual answers, arithmetic, and output formatting. Exact-match formatting tests intentionally fail if the model adds extra text or spaces. These are input/expected-answer examples; they do not guarantee any model's results.

For a version comparison, import the same file into two versions, evaluate each, then open Compare. Keep `stable_key` values unchanged so corresponding tests can be matched across versions.
