import { AppShell } from "@/components/layout/app-shell";

// Templates refresh when switching between the public site and workspace routes.
// Keeping this out of the root layout prevents a cached layout retaining the wrong shell.
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
