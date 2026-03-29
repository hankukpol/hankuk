import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamInputPageContent from "@/components/exam/ExamInputPageContent";
import { getExamFeatureAccess } from "@/lib/exam-feature-access";

export const dynamic = "force-dynamic";

export default async function ExamInputPage() {
  const access = await getExamFeatureAccess("input");

  if (!access.enabled) {
    return (
      <ExamFeatureDisabledNotice
        title={`${access.label}이 비활성화되었습니다.`}
        message={access.lockedMessage}
      />
    );
  }

  return <ExamInputPageContent embedded={false} />;
}
