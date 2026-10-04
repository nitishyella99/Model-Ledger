"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { getPageTitle } from "@/components/layout/navigation";

export function Topbar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/95 backdrop-blur supports-[backdrop-filter]:bg-stone-50/85">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
            ModelLedger
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-stone-950">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <UserButton userProfileMode="navigation" userProfileUrl="/profile" />
          <Link
            href="/run-evaluation"
            className="hidden h-9 items-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px sm:inline-flex"
          >
            <PlayCircle className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Generate Report
          </Link>
        </div>
      </div>
    </header>
  );
}
