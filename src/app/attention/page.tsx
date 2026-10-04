import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getModels } from "@/lib/data/models";
import { getVersionsByModelId } from "@/lib/data/versions";
import { getAttentionIssues } from "@/lib/evaluation/reporting";
import type { AttentionIssue } from "@/lib/evaluation/reporting";

export const dynamic = "force-dynamic";

type AttentionPageItem = Readonly<{
  projectId: string;
  projectName: string;
  currentVersion: string;
  issue: AttentionIssue;
}>;

const priorityLabel: Record<AttentionIssue["priority"], string> = {
  HIGH_REGRESSION: "High regression",
  REGRESSION: "Regression",
  HIGH_NEW_FAILURE: "High-priority new failure",
  REPEATED_FAILURE: "Repeated failure",
};

const priorityTone: Record<
  AttentionIssue["priority"],
  "danger" | "warning" | "neutral"
> = {
  HIGH_REGRESSION: "danger",
  REGRESSION: "warning",
  HIGH_NEW_FAILURE: "danger",
  REPEATED_FAILURE: "warning",
};

const priorityRank: Record<AttentionIssue["priority"], number> = {
  HIGH_REGRESSION: 0,
  HIGH_NEW_FAILURE: 1,
  REGRESSION: 2,
  REPEATED_FAILURE: 3,
};

function explainIssue(issue: AttentionIssue) {
  if (issue.priority === "HIGH_REGRESSION") {
    return "This high-severity test used to pass on an earlier version and now fails. Review it before trusting the current version because it signals a likely behavioral regression.";
  }

  if (issue.priority === "REGRESSION") {
    return "This test passed before but fails on the current version. It needs review because a previously working behavior appears to have broken.";
  }

  if (issue.priority === "HIGH_NEW_FAILURE") {
    return "This is a new high-severity failure in the current version. It needs attention because there is no passing baseline showing this behavior was already acceptable.";
  }

  return "This test has failed across multiple versions. It needs attention because the issue is recurring instead of resolving with later changes.";
}

function formatClassification(value: AttentionIssue["classification"]) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

async function getAttentionPageItems() {
  const models = await getModels();
  const items = await Promise.all(
    models.map(async (model) => {
      const [versions, dataset] = await Promise.all([
        getVersionsByModelId(model.id),
        getEvaluationDatasetByModelId(model.id),
      ]);
      const currentVersion =
        versions.find(
          (version) => version.id === model.current_model_version_id,
        ) ?? versions[0];

      if (!currentVersion) {
        return [];
      }

      return getAttentionIssues(dataset, currentVersion.id).map((issue) => ({
        projectId: model.id,
        projectName: model.name,
        currentVersion: currentVersion.version,
        issue,
      }));
    }),
  );

  return items
    .flat()
    .sort((a, b) => {
      const priorityDifference =
        priorityRank[a.issue.priority] - priorityRank[b.issue.priority];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (
        new Date(b.issue.fact.evaluatedAt).getTime() -
        new Date(a.issue.fact.evaluatedAt).getTime()
      );
    });
}

export default async function AttentionPage() {
  let items: AttentionPageItem[] = [];
  let error: string | null = null;

  try {
    items = await getAttentionPageItems();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Attention data could not load from Supabase.";
  }

  if (error) {
    return <EmptyState title="Attention review unavailable" description={error} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing needs attention"
        description="Stored evaluation facts do not show current regressions, high-priority new failures, or repeated failures."
        action={{ href: "/dashboard", label: "Back to Dashboard" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-md border border-amber-200 bg-amber-50 p-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-amber-950 transition-colors hover:text-amber-800"
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Back to Dashboard
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
              Attention review
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
              Things needing attention
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950">
              Only current-version issues that require review appear here:
              regressions, high-priority new failures, and repeated failures.
            </p>
          </div>
          <div className="inline-flex h-10 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-stone-950 shadow-sm ring-1 ring-amber-200">
            {items.length} {items.length === 1 ? "item" : "items"}
          </div>
        </div>
      </header>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="flex items-start gap-3 border-b border-stone-200 p-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-700">
            <AlertTriangle
              className="size-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-stone-950">
              Review queue
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Items are ordered by severity and recency, with the report link
              kept next to the explanation.
            </p>
          </div>
        </div>

        <div className="divide-y divide-stone-200">
          {items.map((item) => (
            <article
              key={item.issue.id}
              className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={priorityTone[item.issue.priority]}>
                    {priorityLabel[item.issue.priority]}
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    {formatClassification(item.issue.classification)}
                  </StatusBadge>
                  {item.issue.fact.severity ? (
                    <StatusBadge tone="danger">
                      {item.issue.fact.severity}
                    </StatusBadge>
                  ) : null}
                </div>
                <h3 className="mt-3 text-base font-semibold text-stone-950">
                  {item.issue.fact.testName}
                </h3>
                <p className="mt-1 text-sm font-medium text-stone-600">
                  {item.projectName} · Current version {item.currentVersion}
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700">
                  {explainIssue(item.issue)}
                </p>
                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Expected
                    </dt>
                    <dd className="mt-1 text-stone-700">
                      {item.issue.fact.expectedResult ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Actual
                    </dt>
                    <dd className="mt-1 text-stone-700">
                      {item.issue.fact.actualResult ?? "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </div>

              <aside className="rounded-md border border-stone-200 bg-stone-50 p-4">
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Why it appears here
                    </dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {priorityLabel[item.issue.priority]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Previous relevant version
                    </dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {item.issue.previousRelevantVersion ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      Current result
                    </dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {item.issue.fact.result}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/reports/${item.issue.fact.evaluationId}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
                  >
                    Open report
                    <ArrowRight
                      className="size-4"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </Link>
                  <Link
                    href={`/projects/${item.projectId}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                  >
                    Project
                  </Link>
                </div>
              </aside>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
