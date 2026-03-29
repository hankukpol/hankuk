import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamNoticesPageContent from "@/components/exam/ExamNoticesPageContent";
import { getExamFeatureAccess } from "@/lib/exam-feature-access";

export const dynamic = "force-dynamic";

export default async function ExamNoticesPage() {
  const access = await getExamFeatureAccess("notices");

  if (!access.enabled) {
    return (
      <ExamFeatureDisabledNotice
        title={`${access.label}이 비활성화되었습니다.`}
        message={access.lockedMessage}
      />
    );
  }

  return <ExamNoticesPageContent embedded={false} />;
}
