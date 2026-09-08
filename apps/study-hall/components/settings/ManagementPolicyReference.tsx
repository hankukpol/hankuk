import "./management-policy.css";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getPeriods } from "@/lib/services/period.service";
import { listPointRules } from "@/lib/services/point.service";
export async function ManagementPolicyReference({divisionSlug}: {divisionSlug: string}) {
  const policy = await getManagementPolicy(divisionSlug);
  if (!policy) return null;
  const [periods, rules] = await Promise.all([getPeriods(divisionSlug), listPointRules(divisionSlug, {activeOnly:true})]);
  return <div className="restart-policy">
    <section className="admin-section"><h2 className="admin-section-title">시간표</h2>
      <div className="admin-table-frame"><table><thead><tr><th>교시</th><th>시간</th><th>평일</th><th>토요일</th><th>일요일</th></tr></thead><tbody>{periods.filter((p) => p.isActive).map((p) => {
        const control = policy.controlledPeriods.find((c) => c.periodId === p.id);
        return <tr key={p.id}><td>{p.name}</td><td>{p.startTime}–{p.endTime}</td><td>{p.id === policy.morningExam.periodId ? "아침모의고사 의무" : control ? control.optional ? "신청자 시간통제" : "시간통제 의무" : "자율자습"}</td><td>{control?.weekdays.includes(6) ? "시간통제 의무" : "자율자습"}</td><td>자율자습</td></tr>;
      })}</tbody></table></div><p className="admin-help">{policy.breaks.map((b) => `${b.name} ${b.startTime}–${b.endTime}`).join(" · ")}. 학원 마감 {policy.closingTime}. 교시 사이 휴식·식사시간에는 본 자습실 출입이 가능합니다.</p></section>
    <section className="admin-section"><h2 className="admin-section-title">상점·벌점 규칙</h2><div className="admin-table-frame"><table><thead><tr><th>구분</th><th>항목</th><th>점수</th><th>적용 기준</th></tr></thead><tbody>{rules.map((r) => <tr key={r.id}><td>{r.category}</td><td className="admin-table-name">{r.name}</td><td>{r.points > 0 ? "+" : ""}{r.points}</td><td className="admin-table-name whitespace-normal">{r.description}</td></tr>)}</tbody></table></div></section>
    {policy.guidance.map((g) => <section className="admin-section" key={g.title}><h2 className="admin-section-title">{g.title}</h2><p>{g.text}</p></section>)}
  </div>;
}
