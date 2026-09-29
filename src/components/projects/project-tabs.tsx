import Link from "next/link";

const tabs = [
  { key: "overview", label: "Overview", section: "overview" },
  { key: "tests", label: "Tests", path: "tests" },
  { key: "runs", label: "Runs", section: "runs" },
  { key: "compare", label: "Compare", section: "compare" },
  { key: "memory", label: "Memory", section: "memory" },
] as const;

export function ProjectTabs({
  active,
  projectId,
}: Readonly<{
  active: "overview" | "tests" | "runs" | "compare" | "memory";
  projectId?: string;
}>) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-stone-200"
      aria-label="Project"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const href =
          projectId && "path" in tab
            ? `/projects/${projectId}/${tab.path}`
            : projectId && "section" in tab
              ? `/projects/${projectId}#${tab.section}`
              : "section" in tab
                ? `#${tab.section}`
                : "#";

        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
              isActive
                ? "border-stone-950 text-stone-950"
                : "border-transparent text-stone-500 hover:text-stone-950",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
