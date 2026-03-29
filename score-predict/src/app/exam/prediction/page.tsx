import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamPredictionPageContent from "@/components/exam/ExamPredictionPageContent";
import { getExamFeatureAccess } from "@/lib/exam-feature-access";

export const dynamic = "force-dynamic";

export default async function ExamPredictionPage() {
  const access = await getExamFeatureAccess("prediction");

  if (!access.enabled) {
    return (
      <ExamFeatureDisabledNotice
        title={`${access.label}이 비활성화되었습니다.`}
        message={access.lockedMessage}
      />
    );
  }

  return <ExamPredictionPageContent embedded={false} />;
}
