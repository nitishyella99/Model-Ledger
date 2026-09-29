import Link from "next/link";
import { ArrowRight, CheckCircle2, Minus, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

export type VersionComparisonEvaluationRow = Readonly<{
  testName: string;
  beforeOutcome: "pass" | "fail" | "none";
  afterOutcome: "pass" | "fail" | "none";
  difference:
    | "pass_to_pass"
    | "pass_to_fail"
    | "fail_to_pass"
    | "fail_to_fail"
    | "new_test"
    | "removed_test";
  scoreDelta?: number | null;
  reportHref?: string | null;
}>;

type VersionComparisonProps = Readonly<{
  title: string;
  fromVersion: string;
  toVersion: string;
  evaluationRows: VersionComparisonEvaluationRow[];
}>;

function getDifferenceLabel(
  difference: VersionComparisonEvaluationRow["difference"],
) {
  if (difference === "pass_to_fail") {
    return "PASS to FAIL";
  }

  if (difference === "fail_to_pass") {
    return "FAIL to PASS";
  }

  if (difference === "pass_to_pass") {
    return "PASS to PASS";
  }

  if (difference === "fail_to_fail") {
    return "FAIL to FAIL";
  }

  if (difference === "new_test") {
    return "New Test";
  }

  return "Removed Test";
}

function getDifferenceTone(
  difference: VersionComparisonEvaluationRow["difference"],
) {
  if (difference === "pass_to_fail") {
    return "danger" as const;
  }

  if (difference === "fail_to_pass" || difference === "pass_to_pass") {
    return "success" as const;
  }

  if (difference === "fail_to_fail") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function getOutcomeTone(outcome: VersionComparisonEvaluationRow["beforeOutcome"]) {
  if (outcome === "pass") {
    return "success" as const;
  }

  if (outcome === "fail") {
    return "danger" as const;
  }

  return "neutral" as const;
}

export function VersionComparison({
  title,
  fromVersion,
  toVersion,
  evaluationRows,
}: VersionComparisonProps) {
  const passToFail = evaluationRows.filter(
    (row) => row.difference === "pass_to_fail",
  ).length;
  const failToPass = evaluationRows.filter(
    (row) => row.difference === "fail_to_pass",
  ).length;
  const passToPass = evaluationRows.filter(
    (row) => row.difference === "pass_to_pass",
  ).length;
  const failToFail = evaluationRows.filter(
    (row) => row.difference === "fail_to_fail",
  ).length;
  const newTests = evaluationRows.filter(
    (row) => row.difference === "new_test",
  ).length;
  const removedTests = evaluationRows.filter(
    (row) => row.difference === "removed_test",
  ).length;

  return (
    <section
      aria-labelledby="version-comparison-title"
      className="rounded-md border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2
            id="version-comparison-title"
            className="text-base font-semibold text-slate-950"
          >
            {title}
          </h2>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <StatusBadge>{fromVersion}</StatusBadge>
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden="true" />
            <StatusBadge tone="warning">{toVersion}</StatusBadge>
          </div>
        </div>
      </div>

      <div className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-950">
              Evaluation Differences
            </h3>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="danger">PASS to FAIL: {passToFail}</StatusBadge>
              <StatusBadge tone="success">FAIL to PASS: {failToPass}</StatusBadge>
              <StatusBadge tone="success">PASS to PASS: {passToPass}</StatusBadge>
              <StatusBadge tone="warning">FAIL to FAIL: {failToFail}</StatusBadge>
              <StatusBadge>New: {newTests}</StatusBadge>
              <StatusBadge>Removed: {removedTests}</StatusBadge>
            </div>
          </div>

          {evaluationRows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Test
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Before
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    After
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Difference
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Score delta
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Report
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {evaluationRows.map((row) => (
                  <tr key={row.testName}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-950">
                      {row.testName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusBadge tone={getOutcomeTone(row.beforeOutcome)}>
                        {row.beforeOutcome.toUpperCase()}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusBadge tone={getOutcomeTone(row.afterOutcome)}>
                        {row.afterOutcome.toUpperCase()}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        {row.difference === "pass_to_fail" ? (
                          <TriangleAlert
                            className="size-4 text-rose-700"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        ) : row.difference === "fail_to_pass" ||
                          row.difference === "pass_to_pass" ? (
                          <CheckCircle2
                            className="size-4 text-emerald-700"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        ) : (
                          <Minus
                            className="size-4 text-slate-400"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        )}
                        <StatusBadge tone={getDifferenceTone(row.difference)}>
                          {getDifferenceLabel(row.difference)}
                        </StatusBadge>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                      {row.scoreDelta === null || row.scoreDelta === undefined
                        ? "No score"
                        : row.scoreDelta > 0
                          ? `+${row.scoreDelta.toFixed(2)}`
                          : row.scoreDelta.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.reportHref ? (
                        <Link
                          href={row.reportHref}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 transition-colors hover:text-slate-600"
                        >
                          Open Report
                          <ArrowRight
                            className="size-4"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </Link>
                      ) : (
                        <span className="text-slate-500">No run</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              No shared evaluation tests are available for these versions.
            </p>
          )}
      </div>
    </section>
  );
}
