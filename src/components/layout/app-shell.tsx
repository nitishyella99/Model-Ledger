import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Sidebar } from "@/components/layout/sidebar";
import {
  submitAutomaticEvaluationAction,
  type RunEvaluationActionState,
} from "@/app/run-evaluation/actions";
import { getRunEvaluationDialogProjects } from "@/lib/data/run-dialog-options";

type AppShellProps = Readonly<{
  children: React.ReactNode;
}>;

const initialRunEvaluationActionState: RunEvaluationActionState = {
  status: "idle",
};

export async function AppShell({ children }: AppShellProps) {
  let runEvaluationProjects: Awaited<
    ReturnType<typeof getRunEvaluationDialogProjects>
  > = [];

  try {
    runEvaluationProjects = await getRunEvaluationDialogProjects();
  } catch {
    runEvaluationProjects = [];
  }

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950">
      <Sidebar
        runEvaluationAction={submitAutomaticEvaluationAction}
        runEvaluationInitialState={initialRunEvaluationActionState}
        runEvaluationProjects={runEvaluationProjects}
      />
      <div className="min-h-[100dvh] lg:pl-60">
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          <div className="min-h-[calc(100dvh-2.5rem)]">{children}</div>
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
