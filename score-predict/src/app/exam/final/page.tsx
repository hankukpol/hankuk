import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamFinalPageContent from "@/components/exam/ExamFinalPageContent";
import { getExamFeatureAccess } from "@/lib/exam-feature-access";

export const dynamic = "force-dynamic";

export default async function ExamFinalPage() {
  const access = await getExamFeatureAccess("final");

  if (!access.enabled) {
    return (
      <ExamFeatureDisabledNotice
        title={`${access.label}이 비활성화되었습니다.`}
        message={access.lockedMessage}
      />
    );
  }

  return <ExamFinalPageContent embedded={false} />;
}
