import { ArrowRight, Check, GitCompareArrows, LockKeyhole } from "lucide-react";
import Link from "next/link";

export const authAppearance = {
  variables: {
    colorPrimary: "#303c2e",
    colorText: "#1c1917",
    colorTextSecondary: "#78716c",
    colorBackground: "#ffffff",
    borderRadius: "0.625rem",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "none" },
    card: { width: "100%", boxShadow: "none", border: "none", padding: "0" },
    headerTitle: { fontSize: "1.5rem", fontWeight: "600", letterSpacing: "-0.025em" },
    headerSubtitle: { fontSize: "0.875rem", color: "#78716c" },
    socialButtonsBlockButton: "min-h-11 border-stone-200 shadow-none",
    formFieldInput: "min-h-11 border-stone-200 shadow-none",
    formButtonPrimary: "min-h-11 shadow-none",
    footer: { background: "#ffffff" },
    footerActionLink: "text-[#303c2e] underline-offset-4",
  },
};

export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section aria-label="Your ModelLedger account" className="flex min-w-0 flex-col px-6 py-7 sm:px-12 lg:px-14 lg:py-10 xl:px-20">
        <Link href="/" aria-label="ModelLedger home" className="flex items-center gap-3 text-stone-950">
          <span className="flex size-9 items-center justify-center rounded-lg bg-stone-950 text-xs font-bold tracking-tight text-white">ML</span>
          <span className="text-lg font-semibold tracking-tight">ModelLedger</span>
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12 lg:py-16">{children}</div>
        <p className="flex items-center justify-center gap-2 text-xs text-stone-500 lg:justify-start">
          <LockKeyhole className="size-3.5" aria-hidden="true" />Your models, tests, and reports. Your private workspace.
        </p>
      </section>
      <aside aria-labelledby="product-introduction" className="relative flex min-w-0 flex-col justify-center overflow-hidden bg-[#253329] px-6 py-14 text-white sm:px-12 lg:m-3 lg:ml-0 lg:rounded-2xl lg:px-12 lg:py-14 xl:px-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-44 -top-44 size-[560px] rounded-full border border-white/[0.06]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-[400px] rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto w-full max-w-[560px]">
          <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[#c1d0b7]">
            <span className="size-1.5 rounded-full bg-[#c1d0b7]" aria-hidden="true" />A clearer view of your models
          </p>
          <h1 id="product-introduction" className="max-w-lg text-4xl font-medium leading-[1.12] tracking-[-0.04em] sm:text-5xl xl:text-[58px]">
            Test your AI.<br />Compare versions.<br /><span className="text-[#c1d0b7]">Know what changed.</span>
          </h1>
          <p className="mt-6 max-w-[440px] text-base leading-7 text-[#d1d9d0]">ModelLedger is your workspace for testing AI models. Bring your test cases, run evaluations, and compare results to catch regressions before you ship.</p>
          <div className="mt-10 rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <span className="flex items-center gap-2 text-sm font-medium"><GitCompareArrows className="size-4 text-[#c1d0b7]" aria-hidden="true" />Version comparison</span>
              <span className="text-xs text-[#b3c0b0]">Example</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="rounded-md border border-white/15 px-3 py-1.5 text-sm">V1</span><ArrowRight className="size-4 text-[#b3c0b0]" aria-hidden="true" />
              <span className="rounded-md bg-[#c1d0b7] px-3 py-1.5 text-sm font-semibold text-[#253329]">V2</span>
              <span className="ml-auto text-xs text-[#b3c0b0]">Same tests. Clear changes.</span>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-[#e1e7de]">
              {["Spot improvements and regressions", "Review failed cases and expected answers", "Keep a report for every evaluation"].map((item) => (
                <li key={item} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-[#c1d0b7]" aria-hidden="true" />{item}</li>
              ))}
            </ul>
          </div>
          <ol className="mt-9 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {["Create a project", "Run your tests", "Compare versions"].map((step, index) => (
              <li key={step}><span className="text-xs text-[#a7b7a2]">0{index + 1}</span><p className="mt-2 text-sm leading-5 text-[#e1e7de]">{step}</p></li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
