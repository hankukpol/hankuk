import { notFound } from "next/navigation";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { isExamPreviewEnabled } from "@/lib/exam-preview/gate";
import { LearningProvider } from "@/components/exams/preview/LearningProvider";
import { LearningAdmin } from "@/components/exams/preview/LearningAdmin";
export default async function LearningPage({
  params,
}: {
  params: { division: string };
}) {
  if (!isExamPreviewEnabled()) notFound();
  await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");
  return (
    <LearningProvider division={params.division}>
      <LearningAdmin division={params.division} />
    </LearningProvider>
  );
}
