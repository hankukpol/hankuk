import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPeriodWithSessions } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {isActive ? "활성" : "비활성"}
    </span>
  );
}

function SessionStatusBadge({ isCancelled, isLocked }: { isCancelled: boolean; isLocked: boolean }) {
  if (isCancelled) {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
        취소됨
      </span>
    );
  }

  if (isLocked) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        잠금
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
      정상
    </span>
  );
}

export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const { id: rawId } = await params;
  const periodId = Number(rawId);
  if (Number.isNaN(periodId)) notFound();

  const period = await getPeriodWithSessions(periodId);
  if (!period) notFound();

  const totalSessions = period.sessions.length;
  const activeSessions = period.sessions.filter((session) => !session.isCancelled).length;
  const lockedSessions = period.sessions.filter((session) => session.isLocked).length;

  const sessionsByExamType = {
    GONGCHAE: period.sessions.filter((session) => session.examType === "GONGCHAE"),
    GYEONGCHAE: period.sessions.filter((session) => session.examType === "GYEONGCHAE"),
  } as const;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/periods" className="transition hover:text-ember">
          시험 기간 관리
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">{period.name}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            시험 기간 상세
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{period.name}</h1>
          <p className="mt-2 text-sm text-slate">
            {formatDate(period.startDate)} ~ {formatDate(period.endDate)} · {period.totalWeeks}주
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/periods/${period.id}/stats`}
            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition hover:bg-ember/20"
          >
            성적 통계
          </Link>
          <Link
            href={`/admin/periods/${period.id}/sessions`}
            className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
          >
            회차 관리
          </Link>
          <Link
            href={`/admin/periods/${period.id}/edit`}
            className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            수정
          </Link>
          <Link
            href="/admin/periods"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            목록
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">상태</p>
          <div className="mt-2">
            <StatusBadge isActive={period.isActive} />
          </div>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 회차</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{totalSessions}</p>
          <p className="mt-1 text-xs text-slate">활성 {activeSessions}개</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">잠금 회차</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-amber-600">{lockedSessions}</p>
          <p className="mt-1 text-xs text-slate">채점 잠금 상태</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">직렬</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {period.isGongchaeEnabled && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                공채
              </span>
            )}
            {period.isGyeongchaeEnabled && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                경채
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate">기간 정보</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate">기간명</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{period.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">시작일</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDate(period.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">종료일</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDate(period.endDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">총 주차</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{period.totalWeeks}주</dd>
          </div>
        </dl>
      </div>

      {(["GONGCHAE", "GYEONGCHAE"] as const).map((examType) => {
        const sessions = sessionsByExamType[examType];
        if (!period.isGongchaeEnabled && examType === "GONGCHAE") return null;
        if (!period.isGyeongchaeEnabled && examType === "GYEONGCHAE") return null;

        return (
          <div key={examType} className="mt-6">
            <h2 className="text-lg font-semibold text-ink">
              {EXAM_TYPE_LABEL[examType]} 회차
              <span className="ml-2 text-sm font-normal text-slate">({sessions.length}개)</span>
            </h2>

            {sessions.length === 0 ? (
              <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
                등록된 회차가 없습니다.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead>
                    <tr>
                      {[
                        "주차",
                        "과목",
                        "시험일",
                        "상태",
                        "취소 사유",
                        "성적 입력",
                      ].map((header) => (
                        <th
                          key={header}
                          className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {sessions.map((session) => (
                      <tr key={session.id} className="transition hover:bg-mist/30">
                        <td className="px-4 py-3 font-medium tabular-nums text-ink">{session.week}주차</td>
                        <td className="px-4 py-3 text-ink">
                          {getSubjectDisplayLabel(session.subject, session.displaySubjectName)}
                          {session.displaySubjectName && (
                            <span className="ml-1 text-xs text-slate">({SUBJECT_LABEL[session.subject]})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">{formatDate(session.examDate)}</td>
                        <td className="px-4 py-3">
                          <SessionStatusBadge
                            isCancelled={session.isCancelled}
                            isLocked={session.isLocked}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate">{session.cancelReason ?? "-"}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/scores/input?sessionId=${session.id}`}
                            className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:border-forest hover:bg-forest/5"
                          >
                            성적 입력
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
