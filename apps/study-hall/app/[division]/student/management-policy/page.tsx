import { redirect } from "next/navigation";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { getPointAggregationInfo } from "@/lib/point-aggregation-mode";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getDivisionSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getPeriods } from "@/lib/services/period.service";
import { getNextWarningStage, getWarningStageLabel, toDemeritPoints } from "@/lib/student-meta";
import { POINT_WORDS } from "@/lib/student-words";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 학생용 관리규정. 학생이 가장 궁금한 "벌점 몇 점이면 무슨 단계인지"를 맨 위에 둔다(운영자 요청 2026-10-07).
 * 기준 점수는 학원 설정(division_settings)에서 읽고, 단계 이름은 관리규정이 덮어쓴 이름을 쓴다.
 */
export default async function StudentManagementPolicyPage({ params }: { params: { division: string } }) {
  const session = await requireDivisionStudentAccess(params.division);
  const [policy, settings, division, student, periods] = await Promise.all([
    getManagementPolicy(params.division), getDivisionSettings(params.division), getDivisionTheme(params.division),
    getStudentDetail(params.division, session.studentId), getPeriods(params.division),
  ]);
  if (!policy) redirect(`/${params.division}/student`);

  const labels = student.warningStageLabels ?? policy.warningLabels;
  const stageLabel = (stage: string) => labels?.[stage] ?? getWarningStageLabel(stage);
  const stages = [
    { stage: "WARNING_1", threshold: settings.warnLevel1 },
    { stage: "WARNING_2", threshold: settings.warnLevel2 },
    { stage: "INTERVIEW", threshold: settings.warnInterview },
    { stage: "WITHDRAWAL", threshold: settings.warnWithdraw },
  ];
  const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
  const next = getNextWarningStage(demerit, settings, labels);
  const aggregation = getPointAggregationInfo(policy);

  return <StudentPortalFrame division={{ slug: params.division, ...division }} student={student} current="management-policy" title="관리규정"
    description={`${policy.version} · ${policy.effectiveFrom}부터 적용`}
    attendanceEnabled={settings.featureFlags.attendanceManagement} pointsEnabled={settings.featureFlags.pointManagement} examsEnabled={settings.featureFlags.examManagement}>
    <section className="admin-panel" aria-label="벌점과 경고 단계">
      <div className="admin-panel-header">
        <div className="min-w-0">
          <h2 className="admin-section-title">벌점과 경고 단계</h2>
          <p className="admin-help mt-1">벌점은 {aggregation.label} 기준으로 셉니다. {aggregation.description}</p>
        </div>
      </div>
      <div className="admin-table-frame">
        <table aria-label="경고 단계 기준">
          <thead><tr><th scope="col">단계</th><th scope="col">벌점 기준</th></tr></thead>
          <tbody>{stages.map((item) => <tr key={item.stage}><th scope="row">{stageLabel(item.stage)}</th><td className="admin-table-amount">{item.threshold}점 이상</td></tr>)}</tbody>
        </table>
      </div>
      <div className="admin-panel-row">
        <span className="admin-label w-28 shrink-0">내 벌점</span>
        <span><strong className={demerit > 0 ? "text-admin-danger" : undefined}>{demerit}점</strong>
          <span className="admin-help ml-2">{next ? POINT_WORDS.nextStage(next.label, next.pointsRemaining) : POINT_WORDS.topStage}</span></span>
      </div>
    </section>

    <section className="admin-panel" aria-label="관리 시간표">
      <div className="admin-panel-header"><h2 className="admin-section-title">관리 시간표</h2></div>
      <div className="admin-table-frame"><table><thead><tr><th>교시</th><th>시간</th><th>요일</th><th>대상</th></tr></thead><tbody>{policy.controlledPeriods.map(item => {
        const period = periods.find(p => p.id === item.periodId);
        return period ? <tr key={period.id}><th scope="row">{period.name}</th><td>{period.startTime}~{period.endTime}</td><td>{item.weekdays.map(d => WEEKDAYS[d]).join("·")}</td><td>{item.optional ? "정해진 학생만" : "모든 학생"}</td></tr> : null;
      })}</tbody></table></div>
    </section>

    <section className="admin-panel" aria-label="출결·휴무·휴대폰">
      <div className="admin-panel-header"><h2 className="admin-section-title">출결·휴무·휴대폰</h2></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">지각</span><span>{policy.lateArrivalPolicy === "after_start" ? "교시가 시작된 뒤에 오면 지각" : `교시 시작 ${settings.tardyMinutes}분 뒤부터 지각`}</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">휴무</span><span>한 달에 휴무 {settings.holidayLimit}번, 반휴 {settings.halfDayLimit}번</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">병가</span><span>{policy.healthExemptFromLimit !== false ? "확인된 병가는 휴무 횟수에서 빼지 않아요" : `한 달에 ${settings.healthLimit}번까지`}</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">출결 벌점</span><span>{policy.managerConfirmsAttendance ? "선생님이 확인한 뒤에 정해져요" : "출석을 저장하거나 하루를 마감할 때 정해져요"}</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">휴대폰</span><span>잠깐 꺼내 쓰기 {policy.phone.shortLoanMinutes}분({policy.phone.loanPlace || "선생님이 정한 장소"}) · 교시 시작 {policy.phone.resubmitBeforeMinutes}분 전까지 다시 제출</span></div>
    </section>

    <section className="admin-panel" aria-label="학습 운영">
      <div className="admin-panel-header"><h2 className="admin-section-title">학습 운영</h2></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">순찰</span><span>교시마다 {policy.patrolsPerPeriod}번</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">학습 목표</span><span>하루 {policy.dailyGoalCount}개</span></div>
      <div className="admin-panel-row"><span className="admin-label w-28 shrink-0">이의신청</span><span>{policy.appealDays}일 안에</span></div>
      {policy.breaks.map((b, i) => <div key={i} className="admin-panel-row"><span className="admin-label w-28 shrink-0">{b.name}</span><span>{b.startTime}~{b.endTime}</span></div>)}
    </section>

    {policy.guidance.map((g, i) => <section key={i} className="admin-panel" aria-label={g.title}>
      <div className="admin-panel-header"><h2 className="admin-section-title">{g.title}</h2></div>
      <p className="admin-panel-row block whitespace-pre-wrap break-keep">{g.text}</p>
    </section>)}
  </StudentPortalFrame>;
}
