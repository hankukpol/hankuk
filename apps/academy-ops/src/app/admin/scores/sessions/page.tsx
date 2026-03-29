import Link from "next/link";
import { AdminRole, ExamType, Prisma, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
  type ExamSubjectCatalog,
} from "@/lib/exam-subjects/service";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";
import {
  buildScoreSubjectFilterOptions,
  buildScoreSubjectFilterSourceItems,
} from "@/lib/scores/subject-filter";
import { PeriodBatchLock } from "./period-batch-lock";
import { SessionLockToggle } from "./session-lock-toggle";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SessionRow = {
  id: number;
  examType: ExamType;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: Date;
  isCancelled: boolean;
  isLocked: boolean;
  period: { id: number; name: string; isActive: boolean };
  _count: { scores: number };
};

type PeriodGroup = {
  id: number;
  name: string;
  isActive: boolean;
  sessions: SessionRow[];
  lockedCount: number;
  missingCount: number;
};

type SubjectFilterOption = {
  value: string;
  label: string;
};

type SubjectLabelMap = Record<string, string>;

function formatDate(date: Date) {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${weekday})`;
}

function getSessionSubjectLabel(
  session: Pick<SessionRow, "subject" | "displaySubjectName">,
  subjectLabelMap: SubjectLabelMap,
) {
  return session.displaySubjectName?.trim() || subjectLabelMap[session.subject] || session.subject;
}

function buildSubjectFilterOptions(subjectCatalog: ExamSubjectCatalog): SubjectFilterOption[] {
  return buildScoreSubjectFilterOptions(buildScoreSubjectFilterSourceItems(subjectCatalog), {
    excludeValues: [Subject.CUMULATIVE],
  });
}

function buildWhere(input: {
  examTypeFilter: string;
  subjectFilter: string;
  dateFrom: string;
  dateTo: string;
  periodFilter: string;
}, allowedSubjectKeys: Set<string>): Prisma.ExamSessionWhereInput {
  const where: Prisma.ExamSessionWhereInput = {};

  if (input.examTypeFilter === "GONGCHAE") where.examType = ExamType.GONGCHAE;
  if (input.examTypeFilter === "GYEONGCHAE") where.examType = ExamType.GYEONGCHAE;
  if (input.subjectFilter && allowedSubjectKeys.has(input.subjectFilter)) {
    where.subject = input.subjectFilter as Subject;
  }
  if (input.periodFilter) {
    const parsed = Number.parseInt(input.periodFilter, 10);
    if (!Number.isNaN(parsed)) where.periodId = parsed;
  }

  const dateRange: { gte?: Date; lte?: Date } = {};
  if (input.dateFrom) {
    const from = new Date(input.dateFrom);
    if (!Number.isNaN(from.getTime())) {
      from.setHours(0, 0, 0, 0);
      dateRange.gte = from;
    }
  }
  if (input.dateTo) {
    const to = new Date(input.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      dateRange.lte = to;
    }
  }
  if (Object.keys(dateRange).length > 0) {
    where.examDate = dateRange;
  }

  return where;
}

function SessionTable({
  sessions,
  subjectLabelMap,
}: {
  sessions: SessionRow[];
  subjectLabelMap: SubjectLabelMap;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
      <div className="overflow-x-auto">
        <SessionTableInner sessions={sessions} showPeriod={false} subjectLabelMap={subjectLabelMap} />
      </div>
    </div>
  );
}

function SessionTableInner({
  sessions,
  showPeriod = true,
  subjectLabelMap,
}: {
  sessions: SessionRow[];
  showPeriod?: boolean;
  subjectLabelMap: SubjectLabelMap;
}) {
  return (
    <table className="w-full min-w-[740px] text-sm">
      <thead>
        <tr className="border-b border-ink/10">
          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">날짜</th>
          {showPeriod && <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">기간</th>}
          <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">직렬</th>
          <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">주차</th>
          <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">과목</th>
          <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">입력 수</th>
          <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">상태</th>
          <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">관리</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink/5">
        {sessions.map((session) => {
          const subjectLabel = getSessionSubjectLabel(session, subjectLabelMap);

          return (
            <tr key={session.id} className={session.isCancelled ? "opacity-50 transition hover:bg-mist/60" : "transition hover:bg-mist/60"}>
              <td className="px-6 py-3 text-slate">{formatDate(session.examDate)}</td>
              {showPeriod && (
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-sm text-ink">
                    {session.period.name}
                    {session.period.isActive && <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">현재</span>}
                  </span>
                </td>
              )}
              <td className="px-4 py-3">
                <span className={session.examType === ExamType.GONGCHAE ? "inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest" : "inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember"}>
                  {EXAM_TYPE_LABEL[session.examType]}
                </span>
              </td>
              <td className="px-4 py-3"><span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">{session.week}주차</span></td>
              <td className="px-4 py-3 font-medium text-ink">
                {subjectLabel}
                {session.isCancelled && <span className="ml-2 text-xs text-red-500">[취소]</span>}
              </td>
              <td className="px-4 py-3 text-right">
                {session._count.scores > 0 ? (
                  <span className="font-mono font-semibold text-ink">{session._count.scores}명</span>
                ) : session.isCancelled ? (
                  <span className="text-ink/30">-</span>
                ) : (
                  <span className="font-semibold text-amber-600">미입력</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {session.isCancelled && <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">취소</span>}
                  {!session.isCancelled && <SessionLockToggle sessionId={session.id} isLocked={session.isLocked} />}
                  {!session.isCancelled && !session.isLocked && <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-[10px] font-semibold text-forest">활성</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={`/admin/scores/sessions/${session.id}`} className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink">상세</Link>
                  {!session.isCancelled && (session._count.scores === 0 ? (
                    <Link href={`/admin/scores/input?sessionId=${session.id}`} className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20">입력</Link>
                  ) : (
                    <Link href={`/admin/scores/edit?sessionId=${session.id}`} className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10">수정</Link>
                  ))}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function ScoreSessionsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const sp = await searchParams;
  const examTypeFilter = typeof sp.examType === "string" ? sp.examType : "";
  const subjectFilter = typeof sp.subject === "string" ? sp.subject : "";
  const dateFrom = typeof sp.dateFrom === "string" ? sp.dateFrom : "";
  const dateTo = typeof sp.dateTo === "string" ? sp.dateTo : "";
  const periodFilter = typeof sp.period === "string" ? sp.period : "";
  const groupByPeriod = sp.groupByPeriod !== "0";

  const academyId = await resolveVisibleScoreSessionAcademyId();
  const [periods, subjectCatalog] = await Promise.all([
    listPeriods(),
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectOptions = buildSubjectFilterOptions(subjectCatalog);
  const allowedSubjectKeys = new Set(subjectOptions.map((subject) => subject.value));
  const where = buildWhere({ examTypeFilter, subjectFilter, dateFrom, dateTo, periodFilter }, allowedSubjectKeys);
  const scopedWhere = applyScoreSessionAcademyScope(where, academyId);
  const allScopedWhere = applyScoreSessionAcademyScope({}, academyId);

  const [sessions, totalAll] = await Promise.all([
    getPrisma().examSession.findMany({
      where: scopedWhere,
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        examType: true,
        week: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
        isCancelled: true,
        isLocked: true,
        period: { select: { id: true, name: true, isActive: true } },
        _count: { select: { scores: true } },
      },
    }),
    getPrisma().examSession.count({ where: allScopedWhere }),
  ]);

  const hasFilter = Boolean(examTypeFilter || subjectFilter || dateFrom || dateTo || periodFilter);
  const totalFiltered = sessions.length;
  const periodOptions = periods.map((period) => ({ id: period.id, name: period.name, isActive: period.isActive }));

  const periodGroupMap = new Map<number, PeriodGroup>();
  for (const session of sessions) {
    const periodId = session.period.id;
    if (!periodGroupMap.has(periodId)) {
      periodGroupMap.set(periodId, {
        id: periodId,
        name: session.period.name,
        isActive: session.period.isActive,
        sessions: [],
        lockedCount: 0,
        missingCount: 0,
      });
    }

    const group = periodGroupMap.get(periodId)!;
    group.sessions.push(session);
    if (session.isLocked && !session.isCancelled) group.lockedCount += 1;
    if (!session.isCancelled && session._count.scores === 0) group.missingCount += 1;
  }

  const periodGroups = Array.from(periodGroupMap.values());

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">성적 관리</div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 회차 목록</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 선택된 지점 컨텍스트에 속한 회차만 조회합니다. 입력 현황과 잠금 상태를 확인하고 성적 입력 또는 수정 화면으로 바로 이동할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/exams/morning" className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10">아침 모의고사로 이동</Link>
          <Link href="/admin/scores/input" className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20">성적 입력</Link>
          <Link href="/admin/scores/edit" className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember">성적 수정</Link>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-sky-200 bg-sky-50 p-4">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <p className="text-sm text-sky-700">
          회차는 현재 지점 기준으로만 조회됩니다. 아래 필터에서 기간, 직렬, 과목, 날짜 범위를 선택해 필요한 회차만 빠르게 찾을 수 있습니다.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
        <span className="font-semibold">회차 상태:</span>
        <span><span className="font-semibold text-forest">활성</span> / <span className="font-semibold text-ember">잠금</span> / <span className="font-semibold text-red-600">취소</span>로 구분됩니다.</span>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">필터</h2>
        <form method="GET" className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="period">기간</label>
              <select id="period" name="period" defaultValue={periodFilter} className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20">
                <option value="">전체 기간</option>
                {periodOptions.map((period) => (
                  <option key={period.id} value={period.id}>{period.name}{period.isActive ? " (현재)" : ""}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="examType">직렬</label>
              <select id="examType" name="examType" defaultValue={examTypeFilter} className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20">
                <option value="">전체</option>
                <option value="GONGCHAE">공채</option>
                <option value="GYEONGCHAE">경채</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="subject">과목</label>
              <select id="subject" name="subject" defaultValue={subjectFilter} className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20">
                <option value="">전체</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.value} value={subject.value}>{subject.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="dateFrom">시작일</label>
              <input id="dateFrom" name="dateFrom" type="date" defaultValue={dateFrom} className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate" htmlFor="dateTo">종료일</label>
              <input id="dateTo" name="dateTo" type="date" defaultValue={dateTo} className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm text-ink focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate">
              <input type="checkbox" name="groupByPeriod" value="1" defaultChecked={groupByPeriod} className="h-4 w-4 rounded border-ink/20 accent-ember" />
              기간별로 묶기
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button type="submit" className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-5 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20">검색</button>
            {hasFilter && <Link href="/admin/scores/sessions" className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink">필터 초기화</Link>}
          </div>
        </form>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">회차 목록 {hasFilter ? `(${totalFiltered}건)` : `(최대 200건 / 전체 ${totalAll}건)`}</h2>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            {hasFilter ? "조건에 맞는 회차가 없습니다." : "등록된 회차가 없습니다."}
          </div>
        ) : groupByPeriod ? (
          <div className="space-y-6">
            {periodGroups.map((group) => (
              <div key={group.id}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{group.name}</h3>
                    {group.isActive && <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">현재 기간</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate">
                    <span className="rounded-full bg-ink/5 px-2.5 py-1 font-semibold">총 {group.sessions.length}회차</span>
                    {group.missingCount > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">미입력 {group.missingCount}</span>}
                    {group.lockedCount > 0 && <span className="rounded-full bg-ink/5 px-2.5 py-1 font-semibold text-slate">잠금 {group.lockedCount}</span>}
                  </div>
                  <PeriodBatchLock periodId={group.id} periodName={group.name} totalSessions={group.sessions.filter((session) => !session.isCancelled).length} lockedCount={group.lockedCount} />
                  <div className="flex-1 border-b border-ink/10" />
                </div>
                <SessionTable sessions={group.sessions} subjectLabelMap={subjectLabelMap} />
              </div>
            ))}
            {sessions.length === 200 && <p className="rounded-[20px] border border-ink/10 bg-white px-6 py-3 text-xs text-slate">최대 200건까지만 표시합니다. 더 좁은 범위가 필요하면 필터를 조정해 주세요.</p>}
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <SessionTableInner sessions={sessions} subjectLabelMap={subjectLabelMap} />
            </div>
            {sessions.length === 200 && <p className="border-t border-ink/10 px-6 py-3 text-xs text-slate">최대 200건까지만 표시합니다. 더 좁은 범위가 필요하면 필터를 조정해 주세요.</p>}
          </div>
        )}
      </section>
    </div>
  );
}





