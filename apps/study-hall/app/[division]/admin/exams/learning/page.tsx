import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { LearningProvider } from "@/components/exams/preview/LearningProvider";
import { LearningAdmin } from "@/components/exams/preview/LearningAdmin";
export default async function LearningPage({
  params,
}: {
  params: { division: string };
}) {
  await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");
  return (
    <LearningProvider division={params.division} preview={false}>
      <LearningAdmin division={params.division} previewOnly={false} />
    </LearningProvider>
  );
}
