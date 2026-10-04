import type { Guidance, Onboarding } from "./types";

export function getDeploymentGuidance(operation: Onboarding): Guidance {
  const setup = `/model-upload?operation=${operation.id}`;
  if (operation.settings.deleting) return { title: "Finish deleting your model", message: "Model cleanup did not finish. Return to your model to retry deletion.", action: "Manage model", href: setup, automatic: false };
  const automatic = ["queued", "validating", "preparing", "evaluating"].includes(operation.stage);
  const base = { automatic, href: setup, action: "Continue setup" };
  switch (operation.stage) {
    case "draft": if (operation.settings.source === "upload" && operation.artifact_bytes) return { ...base, title: "Model uploaded", message: "Your model is saved for this project and version. Add or review tests, then generate a report.", action: "Generate report", href: `/run-evaluation?project=${operation.model_id}&version=${operation.model_version_id}` }; return { ...base, title: "Finish your setup", message: "Add your model and reviewed tests. Your saved details are ready to continue." };
    case "uploading": return { ...base, title: "Resume your model upload", message: "Return to the upload page and select the same folder to resume saved progress.", action: "Resume upload" };
    case "validating": return { ...base, title: "Checking your model", message: "We’re checking model files and compatibility. No action needed; you can leave and return.", action: null, href: null };
    case "queued": return { ...base, title: "Your evaluation is queued", message: "Your model and tests are saved. Preparation will continue automatically.", action: null, href: null };
    case "preparing": return { ...base, title: "Preparing your model", message: "We’re loading your model. No action needed; you can leave and return.", action: null, href: null };
    case "evaluating": return { ...base, title: "Testing your model", message: `${operation.completed_tests} of ${operation.total_tests} cases completed. Results are saved as each test finishes.`, action: null, href: null };
    case "failed": return { ...base, title: "Your setup needs attention", message: operation.error || "Preparation stopped. Your model and tests are saved.", action: "Fix and retry" };
    case "cancelled": return { ...base, title: "Evaluation cancelled", message: "Your project, model details, and completed results are saved.", action: "Review and restart" };
    case "ready": return operation.baseline_version_id && !operation.reviewed_at
      ? { ...base, title: "Your comparison is ready", message: "Review the shared tests to see improvements and regressions. Changed tests are listed separately.", action: "View comparison", href: `/compare?project=${operation.model_id}&from=${operation.baseline_version_id}&to=${operation.model_version_id}` }
      : operation.reviewed_at
      ? { ...base, title: "Compare your next version", message: "Upload an updated model and reuse your tests to see what changed.", action: "Upload another version", href: `/model-upload?project=${operation.model_id}` }
      : { ...base, title: "Your report is ready", message: "Review the results to see which cases passed and which need attention.", action: "View report", href: `/reports/${operation.evaluation_id}` };
  }
}
