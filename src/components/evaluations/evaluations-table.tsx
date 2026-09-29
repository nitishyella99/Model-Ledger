"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

export type EvaluationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvaluationResultLabel = "PASS" | "FAIL";
export type EvaluationIssueType =
  | "NEW_FAILURE"
  | "REPEATED_FAILURE"
  | "REGRESSION"
  | "RESOLVED"
  | "STABLE_PASS"
  | "STABLE_FAIL";

export type EvaluationHistoryRow = Readonly<{
  id: string;
  evaluationId: string;
  test: string;
  category: string;
  version: string;
  result: EvaluationResultLabel;
  severity: EvaluationSeverity;
  regression: boolean;
  issueType: EvaluationIssueType;
  historicalContext: string;
  evaluatedDate: string;
  evaluatedAt: string;
}>;

type EvaluationsTableProps = Readonly<{
  rows: EvaluationHistoryRow[];
  versions: string[];
  categories: string[];
  issueTypes: EvaluationIssueType[];
}>;

type Filters = {
  query: string;
  version: string;
  result: string;
  severity: string;
  category: string;
  issueType: string;
};

const severityOrder: Record<EvaluationSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function getResultTone(result: EvaluationResultLabel) {
  return result === "PASS" ? "success" : "danger";
}

function getSeverityTone(severity: EvaluationSeverity) {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "danger" as const;
  }

  if (severity === "MEDIUM") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function getIssueTone(issueType: EvaluationIssueType) {
  if (issueType === "REGRESSION" || issueType === "NEW_FAILURE") {
    return "danger" as const;
  }

  if (issueType === "REPEATED_FAILURE") {
    return "warning" as const;
  }

  if (issueType === "RESOLVED" || issueType === "STABLE_PASS") {
    return "success" as const;
  }

  return "neutral" as const;
}

function formatIssueType(issueType: EvaluationIssueType) {
  return issueType.replaceAll("_", " ");
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EvaluationsTable({
  rows,
  versions,
  categories,
  issueTypes,
}: EvaluationsTableProps) {
  const [filters, setFilters] = useState<Filters>({
    query: "",
    version: "all",
    result: "all",
    severity: "all",
    category: "all",
    issueType: "all",
  });

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const query = filters.query.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return [row.test, row.category].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .filter((row) => filters.version === "all" || row.version === filters.version)
      .filter((row) => filters.result === "all" || row.result === filters.result)
      .filter(
        (row) => filters.severity === "all" || row.severity === filters.severity,
      )
      .filter(
        (row) => filters.category === "all" || row.category === filters.category,
      )
      .filter(
        (row) =>
          filters.issueType === "all" || row.issueType === filters.issueType,
      )
      .sort((a, b) => {
        const dateDiff =
          new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime();

        if (dateDiff !== 0) {
          return dateDiff;
        }

        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }, [filters, rows]);

  const activeFilters = [
    filters.query ? `Search: ${filters.query}` : null,
    filters.version !== "all" ? `Version: ${filters.version}` : null,
    filters.result !== "all" ? `Result: ${filters.result}` : null,
    filters.severity !== "all" ? `Severity: ${filters.severity}` : null,
    filters.category !== "all" ? `Category: ${filters.category}` : null,
    filters.issueType !== "all"
      ? `Issue: ${formatIssueType(filters.issueType as EvaluationIssueType)}`
      : null,
  ].filter((filter): filter is string => Boolean(filter));

  const resetFilters = () => {
    setFilters({
      query: "",
      version: "all",
      result: "all",
      severity: "all",
      category: "all",
      issueType: "all",
    });
  };

  return (
    <section
      aria-labelledby="evaluation-history-title"
      className="rounded-md border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2
              id="evaluation-history-title"
              className="text-sm font-semibold text-slate-950"
            >
              Evaluation History
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Filter by version, outcome, severity, or test category.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(120px,1fr))_auto]">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Search
              </span>
              <input
                type="search"
                value={filters.query}
                placeholder="Test or category"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
              />
            </label>
            <FilterSelect
              id="version-filter"
              label="Version"
              value={filters.version}
              options={versions}
              onChange={(version) =>
                setFilters((current) => ({ ...current, version }))
              }
            />
            <FilterSelect
              id="result-filter"
              label="Result"
              value={filters.result}
              options={["PASS", "FAIL"]}
              onChange={(result) =>
                setFilters((current) => ({ ...current, result }))
              }
            />
            <FilterSelect
              id="severity-filter"
              label="Severity"
              value={filters.severity}
              options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]}
              onChange={(severity) =>
                setFilters((current) => ({ ...current, severity }))
              }
            />
            <FilterSelect
              id="category-filter"
              label="Category"
              value={filters.category}
              options={categories}
              onChange={(category) =>
                setFilters((current) => ({ ...current, category }))
              }
            />
            <FilterSelect
              id="issue-type-filter"
              label="Issue Type"
              value={filters.issueType}
              options={issueTypes}
              onChange={(issueType) =>
                setFilters((current) => ({ ...current, issueType }))
              }
            />
            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:translate-y-px sm:mt-0 lg:self-end"
            >
              <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>
        {activeFilters.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Active filters
            </span>
            {activeFilters.map((filter) => (
              <StatusBadge key={filter}>{filter}</StatusBadge>
            ))}
          </div>
        ) : null}
      </div>

      {filteredRows.length > 0 ? (
        <>
        <div className="grid divide-y divide-slate-200 md:hidden">
          {filteredRows.map((row) => (
            <article key={row.id} className="grid gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-950">{row.test}</h3>
                  <p className="mt-1 text-sm capitalize text-slate-600">
                    {row.category} · {row.version} · {row.evaluatedDate}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.historicalContext}
                  </p>
                </div>
                <StatusBadge tone={getResultTone(row.result)}>
                  {row.result}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={getSeverityTone(row.severity)}>
                  {row.severity}
                </StatusBadge>
                <StatusBadge tone={row.regression ? "danger" : "neutral"}>
                  {row.regression ? "Regression" : "No regression"}
                </StatusBadge>
                <StatusBadge tone={getIssueTone(row.issueType)}>
                  {formatIssueType(row.issueType)}
                </StatusBadge>
              </div>
              <Link
                href={`/reports/${row.evaluationId}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50 active:translate-y-px"
              >
                Open Report
                <ArrowRight
                  className="size-4"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </Link>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1220px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Test
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Version
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Result
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Severity
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Regression
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Issue Type
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Historical Context
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Evaluated date
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRows.map((row) => (
                <tr key={row.id} className="align-middle hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">
                    {row.test}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-600">
                    {row.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {row.version}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={getResultTone(row.result)}>
                      {row.result}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={getSeverityTone(row.severity)}>
                      {row.severity}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={row.regression ? "danger" : "neutral"}>
                      {row.regression ? "YES" : "NO"}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={getIssueTone(row.issueType)}>
                      {formatIssueType(row.issueType)}
                    </StatusBadge>
                  </td>
                  <td className="min-w-56 px-4 py-3 text-slate-600">
                    {row.historicalContext}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {row.evaluatedDate}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/reports/${row.evaluationId}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 transition-colors hover:text-slate-600"
                    >
                      Open Report
                      <ArrowRight
                        className="size-4"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="p-8 text-center">
          <h3 className="text-sm font-semibold text-slate-950">
            No evaluations match these filters
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Reset filters or broaden the selected version, result, severity, or
            category to inspect more history.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:translate-y-px"
          >
            <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
