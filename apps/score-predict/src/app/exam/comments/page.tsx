import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamCommentsPageContent from "@/components/exam/ExamCommentsPageContent";
import { getExamFeatureAccess } from "@/lib/exam-feature-access";

export const dynamic = "force-dynamic";

export default async function ExamCommentsPage() {
  const access = await getExamFeatureAccess("comments");

  if (!access.enabled) {
    return (
      <ExamFeatureDisabledNotice
        title={`${access.label}이 비활성화되었습니다.`}
        message={access.lockedMessage}
      />
    );
  }

  return <ExamCommentsPageContent embedded={false} />;
}
