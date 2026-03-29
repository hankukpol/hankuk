import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentAbsenceNotePanel } from "@/components/student-portal/student-absence-note-panel";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalAbsenceNotePageData } from "@/student-portal-api-data";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

function readPeriodId(searchParams: PageProps["searchParams"]) {
  const value = searchParams?.periodId;
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  const periodId = Number(raw);
  return Number.isInteger(periodId) && periodId > 0 ? periodId : undefined;
}

export default async function StudentAbsenceNotesPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-amber-700">
              학생 사유서 안내
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              사유서 화면은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 시험과 사유서 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
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
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-forest">
              학생 포털 로그인
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              사유서는 로그인 후 제출하고 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 시험별 사유서를 제출하고 승인 상태를 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/absence-notes" />
        </div>
      </main>
    );
  }

  const requestedPeriodId = readPeriodId(searchParams);
  const data = await getStudentPortalAbsenceNotePageData({
    examNumber: viewer.examNumber,
    periodId: requestedPeriodId,
  });

  if (!data) {
    return null;
  }

  if (requestedPeriodId !== undefined && !data.periods.some((period) => period.id === requestedPeriodId)) {
    redirect("/student/absence-notes");
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-forest">
                학생 사유서
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {data.student.name}의 사유서
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                시험별 사유서를 제출하고, 승인 상태와 출결 반영 결과를 함께 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/attendance"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                출결 보기
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">조회 기간</p>
              <p className="mt-3 text-xl font-semibold">{data.selectedPeriod?.name ?? "기간 미선택"}</p>
            </article>
            <article className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-600">검토 대기</p>
              <p className="mt-3 text-xl font-semibold text-amber-700">
                {data.notes.filter((n) => n.status === "PENDING").length}건
              </p>
            </article>
            <article className="rounded-[24px] border border-forest/20 bg-forest/10 p-4">
              <p className="text-sm text-forest">승인됨</p>
              <p className="mt-3 text-xl font-semibold text-forest">
                {data.notes.filter((n) => n.status === "APPROVED").length}건
              </p>
            </article>
            <article className="rounded-[24px] border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-600">반려됨</p>
              <p className="mt-3 text-xl font-semibold text-red-700">
                {data.notes.filter((n) => n.status === "REJECTED").length}건
              </p>
            </article>
          </div>
        </section>

        <form className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">조회 기간</label>
            <select
              name="periodId"
              defaultValue={data.selectedPeriod?.id ? String(data.selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              기간 적용
            </button>
          </div>
        </form>

        <StudentAbsenceNotePanel
          sessionOptions={data.sessionOptions.map((session) => ({
            ...session,
            examDate: session.examDate.toISOString(),
          }))}
          notes={data.notes.map((note) => ({
            ...note,
            submittedAt: note.submittedAt ? note.submittedAt.toISOString() : null,
            approvedAt: note.approvedAt ? note.approvedAt.toISOString() : null,
            session: {
              ...note.session,
              examDate: note.session.examDate.toISOString(),
            },
          }))}
        />
      </div>
    </main>
  );
}