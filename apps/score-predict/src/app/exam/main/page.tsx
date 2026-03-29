import { getServerSession } from "next-auth";
import ExamFeatureDisabledNotice from "@/components/exam/ExamFeatureDisabledNotice";
import ExamFunctionArea from "@/components/landing/ExamFunctionArea";
import VisitorTracker from "@/components/VisitorTracker";
import { authOptions } from "@/lib/auth";
import { getExamSurfaceState } from "@/lib/exam-surface";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

async function getHasSubmission(userId: number): Promise<boolean> {
  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const submissionCount = await prisma.submission.count({
    where: activeExam
      ? {
          userId,
          examId: activeExam.id,
        }
      : {
          userId,
        },
  });

  return submissionCount > 0;
}

export default async function ExamMainPage() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id ?? 0);
  const isAuthenticated = Number.isInteger(userId) && userId > 0;
  const isAdmin = session?.user?.role === "ADMIN";
  const hasSubmission = isAuthenticated ? await getHasSubmission(userId) : false;
  const settings = await getSiteSettingsUncached();
  const examSurfaceState = getExamSurfaceState(settings);

  if (!examSurfaceState.tabEnabled.main) {
    return (
      <ExamFeatureDisabledNotice
        title="\ud480\uc11c\ube44\uc2a4 \uba54\uc778\uc774 \ube44\ud65c\uc131\ud654\ub418\uc5c8\uc2b5\ub2c8\ub2e4."
        message={examSurfaceState.tabLockedMessage}
      />
    );
  }

  return (
    <>
      <VisitorTracker />
      <ExamFunctionArea
        isAuthenticated={isAuthenticated}
        hasSubmission={hasSubmission}
        isAdmin={isAdmin}
        finalPredictionEnabled={examSurfaceState.finalPredictionEnabled}
        commentsEnabled={examSurfaceState.commentsEnabled}
        tabEnabled={examSurfaceState.tabEnabled}
        tabLockedMessage={examSurfaceState.tabLockedMessage}
      />
    </>
  );
}
