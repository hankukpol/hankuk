import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { ScoreCorrectionForm } from "./correction-form";

export const dynamic = "force-dynamic";

export default async function ScoreCorrectionPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              성적 오류 신고는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <div className="mt-8">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              성적 오류 신고
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 이용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 성적 오류를 신고할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/score-correction" />
        </div>
      </main>
    );
  }

  // Fetch last 20 scores for this student
  const scores = await getPrisma().score.findMany({
    where: { examNumber: viewer.examNumber },
    include: {
      session: {
        select: {
          examDate: true,
          subject: true,
          displaySubjectName: true,
        },
      },
    },
    orderBy: { session: { examDate: "desc" } },
    take: 20,
  });

  const scoreRows = scores.map((s) => ({
    id: s.id,
    examDate: formatDate(s.session.examDate),
    subject: s.session.subject,
    subjectLabel:
      s.session.displaySubjectName ||
      SUBJECT_LABEL[s.session.subject] ||
      s.session.subject,
    finalScore: s.finalScore,
    rawScore: s.rawScore,
  }));

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                Score Correction
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                성적 오류 신고
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                입력 오류가 있는 성적을 신고해 주세요. 담당자가 확인 후 처리합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 카드로 돌아가기
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>
        </section>

        {/* 안내 박스 */}
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">신고 방법 안내</p>
          <p className="mt-2 text-sm text-amber-700">
            아래 목록에서 오류가 있는 성적의 "오류 신고" 버튼을 클릭하여 실제 점수와 사유를 입력해 주세요.
            성적 오류는 확인 후 수정되며 1~2 영업일이 소요될 수 있습니다.
          </p>
        </div>

        {/* 성적 목록 + 신고 폼 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">최근 성적 목록</h2>
            <p className="mt-2 text-sm text-slate">
              최근 20개의 성적이 표시됩니다. 오류가 있는 항목의 "오류 신고" 버튼을 클릭하세요.
            </p>
          </div>
          <ScoreCorrectionForm scores={scoreRows} />
        </section>
      </div>
    </main>
  );
}
