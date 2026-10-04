import { normalizeTestIdentity } from "./engine";

export function selectRerunTests<T extends { id: string; modelId: string; modelVersionId: string | null; stableKey: string }>(
  tests: readonly T[], modelId: string, versionId: string, keys: readonly string[],
): string[] {
  const requested = new Set(keys.map(normalizeTestIdentity));
  const selected = new Map<string, T>();
  for (const test of tests) {
    if (test.modelId !== modelId || (test.modelVersionId && test.modelVersionId !== versionId)) continue;
    const key = normalizeTestIdentity(test.stableKey);
    if (!requested.has(key)) continue;
    const existing = selected.get(key);
    if (!existing || test.modelVersionId === versionId) selected.set(key, test);
  }
  return [...selected.values()].map((test) => test.id);
}
