"use client";

import { useEffect, useMemo, useState } from "react";
import { FactGrid } from "@/components/evaluations/fact-grid";
import type { PerTestReportRow } from "@/lib/evaluation/report-data";

import { hasReportExecutionError } from "@/lib/evaluation/report-status";
type FilterKey = "all" | "failed" | "passed" | "regressions" | "errors";

type ReportTestResultsProps = Readonly<{
  tests: readonly PerTestReportRow[];
  totalTests: number;
  failed: number;
  passed: number;
  regressions: number;
}>;

function formatNumber(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString()}${suffix}`
    : "Not recorded";
}

function formatCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(6)}`
    : "Not recorded";
}

function formatDecimal(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "Not recorded";
}

function formatLatencySeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value / 1000).toFixed(2)}s`
    : "Not recorded";
}

function formatState(value: string) {
  return value.replaceAll("_", " ");
}

function getFilterLabel(filter: FilterKey) {
  if (filter === "failed") return "failed tests";
  if (filter === "passed") return "passed tests";
  if (filter === "regressions") return "regressions";
  if (filter === "errors") return "execution/evaluator errors";
  return "test results";
}

function getResultTitle(test: PerTestReportRow) {
  const status = hasReportExecutionError(test) ? "Execution/evaluator error" : test.result === "PASS" ? "Passed" : "Failed";
  const classification = formatState(test.classification).toLowerCase();
  const baseline = test.baselineResult
    ? `previously ${test.baselineResult.toLowerCase()}`
    : "no baseline";

  return `${test.testName} - ${status} ${test.category} test, ${classification}, ${baseline}`;
}

export function ReportTestResults({
  tests,
  totalTests,
  failed,
  passed,
  regressions,
}: ReportTestResultsProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [linkedTest, setLinkedTest] = useState("");
  useEffect(() => {
    function openLinkedTest(hash = window.location.hash) {
      let target: string;
      try { target = decodeURIComponent(hash.slice(1)); } catch { return; }
      if (!target.startsWith("report-test-")) return;
      setActiveFilter("all");
      setLinkedTest(target);
      requestAnimationFrame(() => {
        const row = document.getElementById(target);
        if (row instanceof HTMLDetailsElement) row.open = true;
        row?.scrollIntoView({ block: "start" });
      });
    }
    const onHashChange = () => openLinkedTest();
    const onLinkClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const hash = link?.getAttribute("href");
      if (hash?.startsWith("#report-test-")) openLinkedTest(hash);
    };
    openLinkedTest();
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onLinkClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onLinkClick);
    };
  }, []);
  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: "All", count: totalTests },
    { key: "failed", label: "Failed", count: failed },
    { key: "passed", label: "Passed", count: passed },
    { key: "regressions", label: "Regressions", count: regressions },
    { key: "errors", label: "Execution/evaluator errors", count: tests.filter(hasReportExecutionError).length },
  ];
  const visibleTests = useMemo(() => {
    if (activeFilter === "errors") return tests.filter(hasReportExecutionError);
    if (activeFilter === "failed") {
      return tests.filter((test) => test.result === "FAIL");
    }

    if (activeFilter === "passed") {
      return tests.filter((test) => test.result === "PASS");
    }

    if (activeFilter === "regressions") {
      return tests.filter((test) => test.classification === "REGRESSION");
    }

    return tests;
  }, [activeFilter, tests]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key;

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              aria-pressed={isActive}
              className={[
                "inline-flex h-10 items-center justify-center rounded-md border px-3 font-semibold transition-colors",
                isActive
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
              ].join(" ")}
            >
              {filter.label} {filter.count}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-sm text-stone-600">
        Showing {visibleTests.length} {getFilterLabel(activeFilter)}.
      </p>

      {visibleTests.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-200 p-4 text-sm leading-6 text-stone-600">
          No test results match this filter.
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleTests.map((test) => (
            <details
              key={test.id}
              id={`report-test-${test.id}`}
              open={linkedTest === `report-test-${test.id}` ? true : undefined}
              className="rounded-md border border-stone-200 p-3"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-stone-950 marker:hidden">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span>{getResultTitle(test)}</span>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                      {test.result} · {formatState(test.classification)} · Severity{" "}
                      {test.severity} · Score {formatDecimal(test.score)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-stone-500">
                    {formatLatencySeconds(test.latencyMs)}
                  </span>
                </div>
              </summary>
              <div className="mt-3 grid gap-3">
                <FactGrid
                  items={[
                    { label: "Category", value: test.category },
                    {
                      label: "Previous result",
                      value: test.baselineResult ?? "No baseline",
                    },
                    {
                      label: "Score change",
                      value:
                        test.scoreDelta === null
                          ? "No baseline"
                          : formatDecimal(test.scoreDelta),
                    },
                    { label: "Provider", value: test.providerStatus ?? "Not recorded" },
                    { label: "Execution", value: test.executionStatus ?? test.providerStatus ?? "Not recorded" },
                    { label: "Evaluator", value: test.evaluatorStatus ?? "Not recorded" },
                    { label: "Comparison", value: test.comparisonEligibility.replaceAll("_", " ") },
                    { label: "Tokens", value: formatNumber(test.totalTokens) },
                    { label: "Cost", value: formatCurrency(test.estimatedCostUsd) },
                  ]}
                />
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Input
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-700">
                      {test.input}
                    </p>
                  </div>
                  <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Expected Output
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                      {test.expectedOutput}
                    </p>
                  </div>
                  <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Actual Output
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                      {test.actualOutput || "No output recorded."}
                    </p>
                  </div>
                </div>
                <details className="rounded-md border border-stone-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-stone-950">
                    Evaluator explanation and evidence
                  </summary>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {test.evaluatorReason ?? "No evaluator reason recorded."}
                  </p>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-stone-950 p-3 text-xs text-stone-50">
                    {test.evaluatorEvidence}
                  </pre>
                </details>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
