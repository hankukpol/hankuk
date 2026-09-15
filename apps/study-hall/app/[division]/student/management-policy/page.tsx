import { redirect } from "next/navigation";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getDivisionSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getPeriods } from "@/lib/services/period.service";

export default async function StudentManagementPolicyPage({ params }: { params: { division: string } }) {
  const session = await requireDivisionStudentAccess(params.division);
  const [policy, settings, division, student, periods] = await Promise.all([
    getManagementPolicy(params.division), getDivisionSettings(params.division), getDivisionTheme(params.division),
    getStudentDetail(params.division, session.studentId), getPeriods(params.division),
  ]);
  if (!policy) redirect(`/${params.division}/student`);
  return <StudentPortalFrame division={{ slug: params.division, ...division }} student={student} current="management-policy" title="관리규정"
    attendanceEnabled={settings.featureFlags.attendanceManagement} pointsEnabled={settings.featureFlags.pointManagement} examsEnabled={settings.featureFlags.examManagement}>
    <section><h2 className="admin-section-title">{policy.version}</h2><p className="admin-help">적용 시작일 {policy.effectiveFrom}</p></section>
    <section><h2 className="admin-section-title">관리 시간표</h2><div className="admin-table-frame"><table><thead><tr><th>교시</th><th>시간</th><th>요일</th><th>대상</th></tr></thead><tbody>{policy.controlledPeriods.map(item => {
      const period = periods.find(p => p.id === item.periodId);
      return period ? <tr key={period.id}><th scope="row">{period.name}</th><td>{period.startTime}~{period.endTime}</td><td>{item.weekdays.map(d => ["일","월","화","수","목","금","토"][d]).join("·")}</td><td>{item.optional ? "기존 개별 관리" : "전체 학생"}</td></tr> : null;
    })}</tbody></table></div></section>
    <section className="admin-section"><h2 className="admin-section-title">출결·휴무</h2><ul className="space-y-2">
      <li>지각 기준: {policy.lateArrivalPolicy === "after_start" ? "교시 시작 후" : `교시 시작 ${settings.tardyMinutes}분 후`}</li>
      <li>월 휴무권 {settings.holidayLimit}회, 반휴권 {settings.halfDayLimit}회</li>
      <li>병가: {policy.healthExemptFromLimit !== false ? "확인된 병가는 횟수 제한 및 휴무권 차감 제외" : `월 ${settings.healthLimit}회 한도`}</li>
      <li>출결 벌점: {policy.managerConfirmsAttendance ? "관리자 확인 후 확정" : "출결 저장·마감 시 적용"}</li>
    </ul></section>
    <section className="admin-section"><h2 className="admin-section-title">휴대폰</h2><p>일반 반출 {policy.phone.shortLoanMinutes}분, 장소 {policy.phone.loanPlace || "관리자 지정 장소"}</p><p>교시 시작 {policy.phone.resubmitBeforeMinutes}분 전까지 재반납</p></section>
    <section className="admin-section"><h2 className="admin-section-title">학습 운영</h2><p>교시별 순찰 {policy.patrolsPerPeriod}회, 일일 학습목표 {policy.dailyGoalCount}개</p><p>이의신청은 {policy.appealDays}일 이내</p>{policy.breaks.map((b,i) => <p key={i}>{b.name}: {b.startTime}~{b.endTime}</p>)}</section>
    {policy.guidance.map((g,i) => <section key={i} className="admin-section"><h2 className="admin-section-title">{g.title}</h2><p className="whitespace-pre-wrap break-keep">{g.text}</p></section>)}
  </StudentPortalFrame>;
}
