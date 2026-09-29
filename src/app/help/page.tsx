import { PageHeading } from "@/components/models/page-heading";

const helpItems = [
  {
    term: "Project",
    description: "The AI app you want to test.",
  },
  {
    term: "Test",
    description: "A question or task your AI should handle.",
  },
  {
    term: "Version",
    description: "A particular version of your AI setup.",
  },
  {
    term: "Run",
    description: "Testing many cases against one version.",
  },
  {
    term: "Regression",
    description:
      "Something that worked before but now performs worse in the new version.",
  },
  {
    term: "Pass Rate",
    description: "The share of saved tests that passed for a version.",
  },
  {
    term: "Evaluation Check",
    description: "How a response is judged, such as correctness or relevance.",
  },
  {
    term: "Memory",
    description:
      "Past failures, fixes, and version changes that can help investigate current issues.",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Help"
        title="Help"
        description="Short explanations for the words ModelLedger uses in the product."
      />
      <section className="grid gap-3 md:grid-cols-2">
        {helpItems.map((item) => (
          <article
            key={item.term}
            className="rounded-md border border-stone-200 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-stone-950">
              {item.term}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {item.description}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
