"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isRouteActive,
  navigationItems,
  secondaryNavigationItems,
  primaryAction,
} from "@/components/layout/navigation";
import { MoreHorizontal, X } from "lucide-react";

export function MobileNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const mobileItems = navigationItems.filter((item) =>
    ["/", "/projects", "/tests", "/reports"].includes(item.href),
  );

  const remainingNavItems = navigationItems.filter(
    (item) => !mobileItems.some((m) => m.href === item.href),
  );

  const moreItems = [
    primaryAction,
    ...remainingNavItems,
    ...secondaryNavigationItems,
  ];

  const moreActive = moreItems.some((item) => isRouteActive(pathname, item));

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end bg-stone-950/40 p-3 lg:hidden"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More navigation routes"
            className="w-full max-w-lg mx-auto rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-sm font-semibold text-stone-950">
                Navigation & Tools
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                aria-label="Close menu"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
              {moreItems.map((item) => {
                const active = isRouteActive(pathname, item);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors",
                      active
                        ? "bg-stone-950 text-white"
                        : "bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-stone-950",
                    ].join(" ")}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-stone-50 lg:hidden"
        aria-label="Mobile"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5 items-center gap-1 px-2 py-2">
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

          <button
            type="button"
            onClick={() => setIsOpen(true)}
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
          </button>
        </div>
      </nav>
    </>
  );
}
