"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { RunEvaluationDialog } from "@/components/evaluations/run-evaluation-dialog";
import {
  isRouteActive,
  navigationItems,
  primaryAction,
  secondaryNavigationItems,
} from "@/components/layout/navigation";
import type {
  RunEvaluationActionState,
  submitAutomaticEvaluationAction,
} from "@/app/run-evaluation/actions";

type SidebarProps = Readonly<{
  runEvaluationAction: typeof submitAutomaticEvaluationAction;
  runEvaluationInitialState: RunEvaluationActionState;
  runEvaluationProjects: ComponentProps<typeof RunEvaluationDialog>["projects"];
}>;

export function Sidebar({
  runEvaluationAction,
  runEvaluationInitialState,
  runEvaluationProjects,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-[100dvh] w-60 shrink-0 border-r border-stone-200 bg-stone-100/80 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col">
      <div className="flex h-16 items-center border-b border-stone-200 px-5">
        <Link
          href="/"
          className="flex items-center gap-3 text-sm font-semibold tracking-tight text-stone-950"
          aria-label="ModelLedger overview"
        >
          <span className="flex size-8 items-center justify-center rounded-md border border-stone-300 bg-stone-950 text-[11px] font-bold text-white">
            ML
          </span>
          <span>ModelLedger</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-6 px-3 py-4" aria-label="Main">
        <div className="space-y-1">
          <RunEvaluationDialog
            action={runEvaluationAction}
            initialState={runEvaluationInitialState}
            projects={runEvaluationProjects}
            label={primaryAction.label}
            variant="sidebar"
          />
          {navigationItems.map((item) => {
            const active = isRouteActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-stone-950 text-white"
                    : "text-stone-600 hover:bg-white hover:text-stone-950",
                ].join(" ")}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto border-t border-stone-200 pt-4">
          {secondaryNavigationItems.map((item) => {
            const active = isRouteActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-stone-950 text-white"
                    : "text-stone-600 hover:bg-white hover:text-stone-950",
                ].join(" ")}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
