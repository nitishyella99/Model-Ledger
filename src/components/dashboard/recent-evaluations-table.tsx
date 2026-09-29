import { StatusBadge } from "@/components/dashboard/status-badge";

type RecentEvaluationRow = Readonly<{
  id: string;
  test: string;
  version: string;
  result: "pass" | "fail";
  severity: string;
  issueType: string;
  date: string;
}>;

type RecentEvaluationsTableProps = Readonly<{
  rows: RecentEvaluationRow[];
}>;

export function RecentEvaluationsTable({
  rows,
}: RecentEvaluationsTableProps) {
  return (
    <section
      aria-labelledby="recent-evaluations-title"
      className="rounded-md border border-stone-200 bg-white"
    >
      <div className="border-b border-stone-200 p-4">
        <h3
          id="recent-evaluations-title"
          className="text-sm font-semibold text-stone-950"
        >
          Recent activity
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Latest stored evaluation outcomes.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Test
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
                  Issue Type
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {rows.map((row) => (
                <tr key={row.id} className="align-middle">
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-stone-950 sm:px-4">
                    {row.test}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600 sm:px-4">
                    {row.version}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                    <StatusBadge tone={row.result === "pass" ? "success" : "danger"}>
                      {row.result.toUpperCase()}
                    </StatusBadge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600 sm:px-4">
                    {row.severity.toUpperCase()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600 sm:px-4">
                    {row.issueType}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600 sm:px-4">
                    {row.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-sm leading-6 text-stone-600">
          No evaluation results are available yet.
        </div>
      )}
    </section>
  );
}
