import Link from "next/link";
import { AdminRole } from "@prisma/client";
import {
  BarComparisonChart,
  RadarComparisonChart,
} from "@/components/analytics/charts";
import { AppointmentManager } from "@/components/counseling/appointment-manager";
import { BulkCounselingForm } from "@/components/counseling/bulk-counseling-form";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import {
  buildHref,
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { requireAdminContext } from "@/lib/auth";
import {
  getCounselingDashboard,
  getCounselingProfile,
  listAppointments,
  listCounselingStudents,
} from "@/lib/counseling/service";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminCounselingPage({ searchParams }: PageProps) {
  const search = readStringParam(searchParams, "search") ?? "";
  const examNumber = readStringParam(searchParams, "examNumber") ?? "";
  const action = readStringParam(searchParams, "action") ?? "";

  const [context, { examType }] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getAnalyticsContext(searchParams),
  ]);

  const [students, profile, dashboard, allAppointments] = await Promise.all([
    search
      ? listCounselingStudents({ examType, search, page: 1, pageSize: 10 })
      : Promise.resolve(null),
    examNumber ? getCounselingProfile(examNumber) : Promise.resolve(null),
    getCounselingDashboard(),
    listAppointments(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-14 면담 지원
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 면담 지원</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        면담 예약, 상담 기록, 출결과 성적 요약을 한 화면에서 확인하고 관리합니다.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          prefetch={false}
          href="/admin/counseling/follow-ups"
          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
        >
          후속 연락 대상 확인 →
        </Link>
        <Link
          prefetch={false}
          href="/admin/counseling/pipeline"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/40 hover:bg-forest/20"
        >
          파이프라인 보기 →
        </Link>
        <Link
          prefetch={false}
          href="/admin/counseling/conversion-stats"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/20"
        >
          전환율 분석 →
        </Link>
      </div>

      <section className="mt-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">오늘 면담 일정</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.todayScheduled.length}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">당일 예약된 상담 일정</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">이번 주 면담 완료</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.thisWeekDoneCount}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">이번 주에 기록된 상담 건수</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/10 p-6">
            <p className="text-sm text-slate">등록 학생</p>
            <p className="mt-3 text-3xl font-semibold text-forest">
              {dashboard.registeredStudentCount}
              <span className="ml-1 text-base font-normal text-slate">명</span>
            </p>
            <p className="mt-2 text-xs text-slate">면담 기록을 등록할 수 있는 활성 학생 명단</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6">
            <p className="text-sm text-slate">이번 달 면담 완료</p>
            <p className="mt-3 text-3xl font-semibold">
              {dashboard.thisMonthCount}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-2 text-xs text-slate">이번 달 누적 상담 건수</p>
          </article>
        </div>

        <details
          className={`group rounded-[28px] border transition ${
            dashboard.thisWeekScheduled.length > 0
              ? "border-sky-200 bg-sky-50/60"
              : "border-ink/10 bg-white"
          }`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm text-slate">이번 주 예약 면담</p>
              <p className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-3xl font-semibold ${
                    dashboard.thisWeekScheduled.length > 0 ? "text-sky-700" : ""
                  }`}
                >
                  {dashboard.thisWeekScheduled.length}
                </span>
                <span className="text-base font-normal text-slate">건 예정</span>
              </p>
              <p className="mt-1 text-xs text-slate">클릭해서 예약 학생 목록 확인</p>
            </div>
            <span className="text-slate transition-transform group-open:rotate-180">▼</span>
          </summary>

          <div className="border-t border-sky-200/70 px-6 pb-5 pt-4">
            {dashboard.thisWeekScheduled.length === 0 ? (
              <p className="text-sm text-slate">이번 주 예약된 면담이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {dashboard.thisWeekScheduled.map((appt) => {
                  const d = new Date(appt.scheduledAt);
                  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
                  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  return (
                    <Link
                      prefetch={false}
                      key={appt.id}
                      href={buildHref("/admin/counseling", {
                        examType: appt.student.examType,
                        examNumber: appt.student.examNumber,
                        search: appt.student.examNumber,
                      })}
                      className="flex items-center gap-4 rounded-2xl border border-sky-200/80 bg-white px-4 py-3 text-sm transition hover:border-sky-400 hover:bg-sky-50"
                    >
                      <span className="w-28 shrink-0 font-semibold text-sky-800">{dateLabel}</span>
                      <span className="font-semibold">{appt.student.examNumber} · {appt.student.name}</span>
                      <span className="text-slate">{appt.counselorName}</span>
                      {appt.agenda ? (
                        <span className="ml-auto rounded-full border border-sky-200 bg-sky-50 px-3 py-0.5 text-xs text-sky-700">
                          {appt.agenda}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      </section>

      {dashboard.todayScheduled.length > 0 ? (
        <section className="mt-6 rounded-[28px] border border-sky-200 bg-sky-50/60 p-5">
          <h2 className="text-sm font-semibold text-sky-800">
            오늘 면담 일정 ({dashboard.todayScheduled.length}건)
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.todayScheduled.map((appt) => (
              <Link
                prefetch={false}
                key={appt.id}
                href={buildHref("/admin/counseling", {
                  examType: appt.student.examType,
                  examNumber: appt.student.examNumber,
                  search: appt.student.examNumber,
                })}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  appt.student.examNumber === examNumber
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-sky-300 bg-white text-sky-800 hover:border-sky-500 hover:bg-sky-50"
                }`}
              >
                {appt.student.examNumber} · {appt.student.name}
                {appt.agenda ? (
                  <span className="ml-2 text-xs font-normal opacity-70">· {appt.agenda}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,1),rgba(255,255,255,0.98),rgba(236,253,245,0.95))] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  우선순위 1 · 예약 중심
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-ink">
                  학생 검색 후 바로 예약하거나 즉시 면담하세요
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate">
                  예약 면담 관리가 가장 많이 쓰이는 흐름이고, 예약 없이 바로 면담하는 경우도 학생 검색이 먼저입니다.
                  그래서 검색과 예약 진입을 같은 영역으로 묶고, 일괄 등록은 보조 카드로 분리했습니다.
                </p>
              </div>

              {profile ? (
                <div className="min-w-[280px] rounded-[24px] border border-sky-200 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                    현재 선택 학생
                  </p>
                  <p className="mt-3 text-lg font-semibold text-ink">{profile.student.name}</p>
                  <p className="mt-1 text-sm text-slate">
                    {profile.student.examNumber} · {EXAM_TYPE_LABEL[profile.student.examType]}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      prefetch={false}
                      href={buildHref("/admin/counseling", {
                        examType,
                        search: search || profile.student.examNumber,
                        examNumber: profile.student.examNumber,
                      })}
                      className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                    >
                      바로 면담 보기
                    </Link>
                    <Link
                      prefetch={false}
                      href={buildHref("/admin/counseling", {
                        examType,
                        search: search || profile.student.examNumber,
                        examNumber: profile.student.examNumber,
                        action: "appointment",
                      })}
                      className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
                    >
                      예약 잡기
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="min-w-[280px] rounded-[24px] border border-dashed border-sky-200 bg-white/75 p-4 text-sm text-slate">
                  학생을 먼저 찾으면 아래에서 바로 예약을 잡거나, 예약 없이 면담 기록 입력으로 이어질 수 있습니다.
                </div>
              )}
            </div>

            <form className="mt-6 grid gap-4 rounded-[24px] border border-white/80 bg-white/80 p-5 md:grid-cols-[180px_minmax(0,1fr)_140px]">
              <div>
                <label className="mb-2 block text-sm font-medium">직렬</label>
                <select
                  name="examType"
                  defaultValue={examType}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
                  <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">학생 검색</label>
                <input
                  type="text"
                  name="search"
                  defaultValue={search}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  placeholder="수험번호 또는 이름을 입력하세요"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
                >
                  검색
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate">
              <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-sky-700">
                1순위 예약 면담 관리
              </span>
              <span className="rounded-full border border-white/90 bg-white/75 px-3 py-1">
                2순위 학생 검색 · 즉시 면담
              </span>
              <span className="rounded-full border border-white/90 bg-white/75 px-3 py-1">
                3순위 일괄 면담 기록 등록
              </span>
            </div>

            {search && students ? (
              <section className="mt-6 rounded-[24px] border border-white/80 bg-white/85 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    {students.totalCount === 0
                      ? "검색된 학생이 없습니다."
                      : `${students.totalCount}명 검색됨${students.totalCount > 10 ? " · 상위 10명만 표시" : ""}`}
                  </p>
                  <p className="text-xs text-slate">
                    학생을 선택한 뒤 바로 면담하거나, 예약 잡기로 예약 폼을 즉시 열 수 있습니다.
                  </p>
                </div>

                {students.rows.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {students.rows.map((student) => (
                      <div
                        key={student.examNumber}
                        className={`rounded-[22px] border p-4 transition ${
                          student.examNumber === examNumber
                            ? "border-sky-300 bg-sky-50/70"
                            : "border-ink/10 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-ink">
                                {student.examNumber} · {student.name}
                              </p>
                              {student.currentStatus !== "NORMAL" ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs ${
                                    STATUS_BADGE_CLASS[student.currentStatus]
                                  }`}
                                >
                                  {STATUS_LABEL[student.currentStatus]}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate">
                              {EXAM_TYPE_LABEL[student.examType]}
                              {student.examNumber === examNumber
                                ? " · 현재 선택된 학생"
                                : " · 선택 후 바로 예약 또는 면담 가능"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              prefetch={false}
                              href={buildHref("/admin/counseling", {
                                examType,
                                search,
                                examNumber: student.examNumber,
                              })}
                              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                            >
                              바로 면담
                            </Link>
                            <Link
                              prefetch={false}
                              href={buildHref("/admin/counseling", {
                                examType,
                                search,
                                examNumber: student.examNumber,
                                action: "appointment",
                              })}
                              className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
                            >
                              예약 잡기
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-slate">
                    다른 수험번호나 이름으로 다시 검색해 주세요.
                  </div>
                )}
              </section>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-sky-200/70 bg-white/70 px-5 py-4 text-sm text-slate">
                수험번호나 이름으로 검색하면 여기서 바로 예약 동선과 즉시 면담 동선이 시작됩니다.
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">예약 면담 관리</h2>
                <p className="mt-1 text-sm text-slate">
                  선택 학생 예약, 일정 변경, 완료 처리까지 가장 자주 쓰는 기능을 먼저 배치했습니다.
                </p>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                1순위
              </span>
            </div>
            <AppointmentManager
              key={`${examNumber || "none"}:${action || "default"}`}
              appointments={allAppointments.map((a) => ({
                id: a.id,
                examNumber: a.examNumber,
                scheduledAt: a.scheduledAt.toISOString(),
                counselorName: a.counselorName,
                agenda: a.agenda,
                status: a.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
                cancelReason: a.cancelReason,
                student: a.student,
              }))}
              defaultCounselorName={context.adminUser.name}
              defaultExamNumber={examNumber}
              defaultStudentName={profile?.student.name ?? ""}
              defaultOpenCreateForm={action === "appointment"}
            />
          </section>
        </div>

        <section className="self-start rounded-[28px] border border-ink/10 bg-white p-6 xl:sticky xl:top-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-sm">
              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                후순위 업무
              </span>
              <h2 className="mt-3 text-xl font-semibold">일괄 면담 기록 등록</h2>
              <p className="mt-2 text-sm text-slate">
                동일한 내용을 여러 학생에게 한 번에 남겨야 할 때만 쓰는 보조 기능으로 위치를 뒤로 내렸습니다.
              </p>
            </div>
            <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              3순위
            </span>
          </div>
          <BulkCounselingForm
            defaultCounselorName={context.adminUser.name}
            students={dashboard.bulkStudents.map((s) => ({
              examNumber: s.examNumber,
              name: s.name,
              currentStatus: s.currentStatus,
              examType: s.examType,
            }))}
          />
        </section>
      </section>

      {!profile ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          학생을 검색하고 선택하면 면담 기록과 성적 요약이 표시됩니다.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">학생</p>
              <p className="mt-4 text-2xl font-semibold">
                {profile.student.name}{" "}
                <span className="text-base font-normal text-slate">
                  ({profile.student.examNumber})
                </span>
              </p>
              <p className="mt-2 text-xs text-slate">{profile.student.phone ?? "-"}</p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">최근 4주 결시</p>
              <p className="mt-4 text-2xl font-semibold">{profile.attendanceSummary.absentCount}회</p>
              <p className="mt-2 text-xs text-slate">
                현재 상태{" "}
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    STATUS_BADGE_CLASS[profile.student.currentStatus]
                  }`}
                >
                  {STATUS_LABEL[profile.student.currentStatus]}
                </span>
              </p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">누적 포인트</p>
              <p className="mt-4 text-2xl font-semibold">{profile.totalPoints.toLocaleString("ko-KR")}P</p>
              <p className="mt-2 text-xs text-slate">최근 포인트 지급 이력 기준</p>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
              <p className="text-sm text-slate">면담 기록</p>
              <p className="mt-4 text-2xl font-semibold">{profile.counselingRecords.length}건</p>
              <p className="mt-2 text-xs text-slate">
                최근 기록 {profile.counselingRecords[0] ? formatDateTime(profile.counselingRecords[0].counseledAt) : "-"}
              </p>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-xl font-semibold">최근 4주 강점 / 약점</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-forest/20 bg-forest/10 p-4">
                  <p className="text-sm font-semibold text-forest">강점 과목</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {profile.strengths.length === 0 ? <p>-</p> : null}
                    {profile.strengths.map((row) => (
                      <p key={row.subject}>
                        {SUBJECT_LABEL[row.subject]} · {row.average ?? "-"}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-700">보완 과목</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {profile.weaknesses.length === 0 ? <p>-</p> : null}
                    {profile.weaknesses.map((row) => (
                      <p key={row.subject}>
                        {SUBJECT_LABEL[row.subject]} · {row.average ?? "-"}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-xl font-semibold">최근 주차 평균</h2>
              <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">주차</th>
                      <th className="px-4 py-3 font-semibold">평균</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {profile.recentWeeklySummary.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate">
                          최근 주차 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : null}
                    {profile.recentWeeklySummary.map((row) => (
                      <tr key={row.week}>
                        <td className="px-4 py-3">{row.week}</td>
                        <td className="px-4 py-3">{row.average ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {profile.monthlyAnalysis ? (
            <section className="grid gap-6 xl:grid-cols-2">
              <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">이번 달 과목별 비교</h2>
                <div className="mt-4">
                  <RadarComparisonChart data={profile.monthlyAnalysis.radarData} />
                </div>
              </article>
              <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">이번 달 평균 비교</h2>
                <div className="mt-4">
                  <BarComparisonChart
                    data={profile.monthlyAnalysis.barData}
                    xKey="subject"
                    bars={[
                      { dataKey: "studentAverage", color: "#EA580C", name: "학생 평균" },
                      { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                      { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                    ]}
                  />
                </div>
              </article>
            </section>
          ) : null}

          <CounselingPanel
            examNumber={profile.student.examNumber}
            defaultCounselorName={context.adminUser.name}
            targetScores={profile.student.targetScores}
            subjects={EXAM_TYPE_SUBJECTS[profile.student.examType]}
            records={profile.counselingRecords.map((record) => ({
              id: record.id,
              examNumber: record.examNumber,
              counselorName: record.counselorName,
              content: record.content,
              recommendation: record.recommendation,
              counseledAt: record.counseledAt.toISOString(),
              nextSchedule: record.nextSchedule ? record.nextSchedule.toISOString() : null,
            }))}
          />
        </div>
      )}
    </div>
  );
}
