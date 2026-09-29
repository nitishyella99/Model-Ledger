import "server-only";

import { getModels } from "@/lib/data/models";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionsByModelId } from "@/lib/data/versions";

export async function getRunEvaluationDialogProjects() {
  const models = await getModels();

  return Promise.all(
    models.map(async (model) => {
      const [versions, testCases] = await Promise.all([
        getVersionsByModelId(model.id),
        getTestCasesByModelId(model.id),
      ]);
      return {
        id: model.id,
        name: model.name,
        versions: versions.map((version) => ({
          id: version.id,
          version: version.version,
          configured: true,
        })),
        testCases: testCases.map((testCase) => ({
          id: testCase.id,
          modelVersionId: testCase.model_version_id,
          name: testCase.name,
        })),
      };
    }),
  );
}
