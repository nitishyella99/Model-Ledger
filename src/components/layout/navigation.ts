import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ClipboardList,
  FileText,
  GitCompareArrows,
  GitBranch,
  HelpCircle,
  LayoutDashboard,
  Settings,
  Sparkles,
  UserCircle,
  WandSparkles,
  Upload,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/projects",
    label: "Projects",
    title: "Projects",
    icon: Archive,
  },
  {
    href: "/tests",
    label: "Test Cases",
    title: "Test Cases",
    icon: ClipboardList,
  },
  {
    href: "/reports",
    label: "Reports",
    title: "Reports",
    icon: FileText,
  },
  {
    href: "/versions",
    label: "Versions",
    title: "Versions",
    icon: GitBranch,
  },
  {
    href: "/compare",
    label: "Compare",
    title: "Compare Versions",
    icon: GitCompareArrows,
  },
  {
    href: "/memory",
    label: "Memory",
    title: "Memory",
    icon: Archive,
  },
];

export const secondaryNavigationItems: NavigationItem[] = [
  {
    href: "/model-upload",
    label: "Upload Model",
    title: "Upload Model",
    icon: Upload,
  },
  {
    href: "/test-case-generator",
    label: "Test Generator",
    title: "Test Case Generator",
    icon: Sparkles,
  },
  {
    href: "/settings",
    label: "Settings",
    title: "Settings",
    icon: Settings,
  },
  {
    href: "/help",
    label: "Help",
    title: "Help",
    icon: HelpCircle,
  },
  {
    href: "/profile",
    label: "Profile",
    title: "Profile",
    icon: UserCircle,
  },
];

export const primaryAction: NavigationItem = {
  href: "/run-evaluation",
  label: "Generate Report",
  title: "Generate Report",
  icon: WandSparkles,
};

export function isRouteActive(pathname: string, item: NavigationItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getPageTitle(pathname: string) {
  if (pathname === "/projects/new") return "Model Setup";
  if (pathname === primaryAction.href) {
    return primaryAction.title;
  }

  if (pathname === "/attention") {
    return "Things Needing Attention";
  }

  if (pathname.startsWith("/reports/") || pathname.startsWith("/evaluations/")) {
    return "Evaluation Report";
  }

  return (
    [...navigationItems, ...secondaryNavigationItems].find((item) =>
      isRouteActive(pathname, item),
    )?.title ?? "ModelLedger"
  );
}
