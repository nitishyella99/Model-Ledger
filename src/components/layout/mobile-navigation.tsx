"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isRouteActive,
  navigationItems,
} from "@/components/layout/navigation";
import { MoreHorizontal } from "lucide-react";

export function MobileNavigation() {
  const pathname = usePathname();
  const mobileItems = navigationItems.filter((item) =>
    ["/", "/tests", "/reports"].includes(item.href),
  );
  const moreActive = ["/projects", "/runs", "/versions", "/compare", "/memory", "/evaluations", "/settings", "/help", "/profile"].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-stone-50 lg:hidden"
      aria-label="Mobile"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-4 items-center gap-1 px-2 py-2">
        {mobileItems.map((item) => {
          const active = isRouteActive(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-stone-950 text-white"
                  : "text-stone-600 hover:bg-white hover:text-stone-950",
              ].join(" ")}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}

        <Link
          href="/projects"
          title="More"
          aria-current={moreActive ? "page" : undefined}
          aria-label="More"
          className={[
            "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors",
            moreActive
              ? "bg-stone-950 text-white"
              : "text-stone-600 hover:bg-white hover:text-stone-950",
          ].join(" ")}
        >
          <MoreHorizontal className="size-4" strokeWidth={1.8} aria-hidden="true" />
          <span>More</span>
        </Link>
      </div>
    </nav>
  );
}
