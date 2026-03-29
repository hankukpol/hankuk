import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { BarComparisonChart, StudentPairRadarChart } from "@/components/analytics/charts";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  formatScore,
} from "@/lib/analytics/presentation";
import type { StudentComparisonData } from "@/lib/analytics/analysis";

type Props = {
  data: StudentComparisonData;
};

type Leader = "a" | "b" | "tie" | "none";

function compareMetric(
  left: number | null,
  right: number | null,
  options?: { lowerIsBetter?: boolean },
): Leader {
  if (left === null || right === null) {
    return "none";
  }

  if (Math.abs(left - right) < 0.1) {
    return "tie";
  }

  if (options?.lowerIsBetter) {
    return left < right ? "a" : "b";
  }

  return left > right ? "a" : "b";
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatScoreLabel(value: number | null) {
  return value === null ? "-" : formatScore(value);
}

function formatSignedDelta(value: number | null) {
  if (value === null) {
    return "-";
  }

  if (Math.abs(value) < 0.1) {
    return "0.0";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function deltaClassName(value: number | null) {
  if (value === null || Math.abs(value) < 0.1) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return value > 0
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-sky-200 bg-sky-50 text-sky-700";
}

function leaderCopy(leader: Leader, leftLabel: string, rightLabel: string) {
  if (leader === "a") {
    return `${leftLabel} 우세`;
  }

  if (leader === "b") {
    return `${rightLabel} 우세`;
  }

  if (leader === "tie") {
    return "동률";
  }

  return "비교 없음";
}

function SummaryMetricCard(props: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  leader: Leader;
}) {
  return (
    <article className="rounded-[24px] border border-ink/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{props.label}</p>
          <p className="mt-2 text-sm font-semibold text-ink">{leaderCopy(props.leader, props.leftLabel, props.rightLabel)}</p>
        </div>
        <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-1 text-[11px] font-semibold text-slate">
          {props.leftLabel} / {props.rightLabel}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
          <p className="text-xs font-medium text-amber-900/70">{props.leftLabel}</p>
          <p className="mt-1 text-xl font-semibold text-ink">{props.leftValue}</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
          <p className="text-xs font-medium text-sky-900/70">{props.rightLabel}</p>
          <p className="mt-1 text-xl font-semibold text-ink">{props.rightValue}</p>
        </div>
      </div>
    </article>
  );
}

function StudentSummaryCard(props: {
  label: string;
  accentClassName: string;
  student: StudentComparisonData["studentA"];
  recentCount: number;
}) {
  const { student, recentCount } = props;

  return (
    <section className={`rounded-[28px] border p-6 ${props.accentClassName}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate">{props.label}</p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">{student.student.name}</h3>
          <p className="mt-1 text-sm text-slate">{student.student.examNumber}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[student.student.currentStatus]}`}>
          {STATUS_LABEL[student.student.currentStatus]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate">
        <span className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1">
          {EXAM_TYPE_LABEL[student.student.examType]}
        </span>
        <span className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1">
          {student.student.generation ? `${student.student.generation}기` : "기수 미설정"}
        </span>
        <span className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1">
          {student.student.className ?? "반 미지정"}
        </span>
        {!student.student.isActive ? (
          <span className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1">비활성</span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs text-slate">전체 평균</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatScoreLabel(student.overallAvg)}점</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs text-slate">출결률</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatPercent(student.attendanceRate)}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs text-slate">최근 {recentCount}회 평균</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatScoreLabel(student.recentAverage)}점</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs text-slate">취약 과목</p>
          <p className="mt-1 text-lg font-semibold text-ink">{student.weakSubjects.length}개</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs font-medium text-slate">강점 과목</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {student.strongSubject ? SUBJECT_LABEL[student.strongSubject.subject] : "데이터 없음"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {student.strongSubject ? `${formatScoreLabel(student.strongSubject.average)}점` : "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/90 px-4 py-3">
          <p className="text-xs font-medium text-slate">주의 과목</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {student.weakSubject ? SUBJECT_LABEL[student.weakSubject.subject] : "데이터 없음"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {student.weakSubject ? `${formatScoreLabel(student.weakSubject.average)}점` : "-"}
          </p>
        </div>
      </div>
    </section>
  );
}

export function StudentComparisonAnalysis({ data }: Props) {
  const leftLabel = data.studentA.student.name;
  const rightLabel = data.studentB.student.name;
  const subjectBarData = data.subjectRows.map((row) => ({
    subject: row.subject,
    studentA: row.studentAAverage ?? 0,
    studentB: row.studentBAverage ?? 0,
  }));
  const summaryMetrics = [
    {
      id: "overall",
      label: "종합 평균",
      leader: compareMetric(data.studentA.overallAvg, data.studentB.overallAvg),
      leftValue: `${formatScoreLabel(data.studentA.overallAvg)}점`,
      rightValue: `${formatScoreLabel(data.studentB.overallAvg)}점`,
    },
    {
      id: "attendance",
      label: "출결 안정성",
      leader: compareMetric(data.studentA.attendanceRate, data.studentB.attendanceRate),
      leftValue: formatPercent(data.studentA.attendanceRate),
      rightValue: formatPercent(data.studentB.attendanceRate),
    },
    {
      id: "recent",
      label: `최근 ${data.recentCount}회 평균`,
      leader: compareMetric(data.studentA.recentAverage, data.studentB.recentAverage),
      leftValue: `${formatScoreLabel(data.studentA.recentAverage)}점`,
      rightValue: `${formatScoreLabel(data.studentB.recentAverage)}점`,
    },
    {
      id: "weak-subjects",
      label: "취약 과목 수",
      leader: compareMetric(
        data.studentA.weakSubjects.length,
        data.studentB.weakSubjects.length,
        { lowerIsBetter: true },
      ),
      leftValue: `${data.studentA.weakSubjects.length}개`,
      rightValue: `${data.studentB.weakSubjects.length}개`,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
              학생 비교 분석
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-ink">{leftLabel} vs {rightLabel}</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              {data.selectedPeriod ? `${data.selectedPeriod.name} 기간 기준` : "비교 가능한 기간이 없습니다."}
              {" · "}
              최근 {data.recentCount}회 평균을 함께 표시합니다.
            </p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm text-slate">
            <p>좌측 수험번호: <strong className="text-ink">{data.studentA.student.examNumber}</strong></p>
            <p className="mt-1">우측 수험번호: <strong className="text-ink">{data.studentB.student.examNumber}</strong></p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudentSummaryCard
          label="비교 A"
          accentClassName="border-amber-200 bg-amber-50/60"
          student={data.studentA}
          recentCount={data.recentCount}
        />
        <StudentSummaryCard
          label="비교 B"
          accentClassName="border-sky-200 bg-sky-50/60"
          student={data.studentB}
          recentCount={data.recentCount}
        />
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-ink">비교 신호</h3>
          <p className="mt-1 text-sm text-slate">누가 더 안정적으로 유지되는지 바로 확인할 수 있는 핵심 지표입니다.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-4">
          {summaryMetrics.map((metric) => (
            <SummaryMetricCard
              key={metric.id}
              label={metric.label}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              leftValue={metric.leftValue}
              rightValue={metric.rightValue}
              leader={metric.leader}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold text-ink">과목별 레이더 비교</h3>
          <p className="mt-1 text-sm text-slate">같은 기간 기준 평균 점수를 한 눈에 비교합니다.</p>
          <div className="mt-4">
            <StudentPairRadarChart
              data={data.radarData}
              studentAName={leftLabel}
              studentBName={rightLabel}
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold text-ink">과목별 평균 바 차트</h3>
          <p className="mt-1 text-sm text-slate">좌우 학생의 과목별 평균을 같은 축으로 비교합니다.</p>
          <div className="mt-4">
            <BarComparisonChart
              data={subjectBarData}
              xKey="subject"
              bars={[
                { dataKey: "studentA", color: "#C2410C", name: leftLabel },
                { dataKey: "studentB", color: "#2563EB", name: rightLabel },
              ]}
            />
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-ink">과목별 격차 요약</h3>
            <p className="mt-1 text-sm text-slate">전체 평균과 최근 {data.recentCount}회 평균의 격차를 함께 봅니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
              양수: {leftLabel} 우세
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
              음수: {rightLabel} 우세
            </span>
          </div>
        </div>
        <div className="mt-5">
          <ResponsiveTable
            data={data.subjectRows}
            keyExtractor={(row) => row.subject}
            caption="학생 과목별 비교 표"
            cardTitle={(row) => SUBJECT_LABEL[row.subject]}
            cardDescription={(row) => `전체 격차 ${formatSignedDelta(row.averageDelta)}점`}
            columns={[
              {
                id: "subject",
                header: "과목",
                cell: (row) => <span className="font-semibold">{SUBJECT_LABEL[row.subject]}</span>,
                mobileLabel: "과목",
              },
              {
                id: "studentA",
                header: leftLabel,
                cell: (row) => `${formatScoreLabel(row.studentAAverage)}점`,
                mobileLabel: `${leftLabel} 평균`,
              },
              {
                id: "studentB",
                header: rightLabel,
                cell: (row) => `${formatScoreLabel(row.studentBAverage)}점`,
                mobileLabel: `${rightLabel} 평균`,
              },
              {
                id: "delta",
                header: "격차",
                cell: (row) => (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${deltaClassName(row.averageDelta)}`}>
                    {formatSignedDelta(row.averageDelta)}점
                  </span>
                ),
                mobileLabel: "전체 격차",
              },
              {
                id: "studentARecent",
                header: `${leftLabel} 최근 ${data.recentCount}회`,
                cell: (row) => `${formatScoreLabel(row.studentARecentAverage)}점`,
                mobileLabel: `${leftLabel} 최근`,
              },
              {
                id: "studentBRecent",
                header: `${rightLabel} 최근 ${data.recentCount}회`,
                cell: (row) => `${formatScoreLabel(row.studentBRecentAverage)}점`,
                mobileLabel: `${rightLabel} 최근`,
              },
              {
                id: "recentDelta",
                header: "최근 격차",
                cell: (row) => (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${deltaClassName(row.recentDelta)}`}>
                    {formatSignedDelta(row.recentDelta)}점
                  </span>
                ),
                mobileLabel: "최근 격차",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}


