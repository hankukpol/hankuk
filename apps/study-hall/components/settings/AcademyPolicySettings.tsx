"use client";

import Link from "next/link";
import { ArrowUpRight, Save } from "lucide-react";
import { useConfigurationReview } from "./ConfigurationReview";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AdminTabs } from "@/components/ui/AdminTabs";
import { academyPolicyInputSchema, createAcademyPolicyDraft, type AcademyPolicyInput, type AcademyPolicyPeriod, type AcademyPolicyRule } from "@/lib/academy-policy-settings";
import { kstDate, type ManagementPolicy } from "@/lib/management-policy";

type Props = { divisionSlug: string; initial: { policy: ManagementPolicy | null; revision: string; periods: AcademyPolicyPeriod[]; rules: AcademyPolicyRule[] } };
type Tab = "general" | "attendance" | "phone" | "leave" | "guidance";
const tabs = [
  { id: "general", label: "운영 방식" }, { id: "attendance", label: "교시·출결" },
  { id: "phone", label: "휴대폰" }, { id: "leave", label: "휴무·경고" }, { id: "guidance", label: "규정 안내" },
];
function editable(policy: ManagementPolicy): AcademyPolicyInput {
  const { optionalEnrollments: _enrollments, ...value } = policy;
  void _enrollments; // Student applications are not editable policy settings.
  return value;
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <div className="admin-form-row"><div className="admin-form-row-label">{label}</div><div className="admin-form-row-control">{children}{help && <p className="admin-help">{help}</p>}</div></div>;
}
export function AcademyPolicySettings({ divisionSlug, initial }: Props) {
  const {review, dialog} = useConfigurationReview(divisionSlug);
  const [form, setForm] = useState<AcademyPolicyInput>(() => initial.policy ? editable(initial.policy) : createAcademyPolicyDraft(kstDate(), initial.periods));
  const [tab, setTab] = useState<Tab>("general");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof AcademyPolicyInput>(key: K, value: AcademyPolicyInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const boolean = (label: string, checked: boolean, onChange: (value: boolean) => void) => <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} disabled={pending} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
  const number = (label: string, value: number, onChange: (value: number) => void, min = 1) => <input aria-label={label} type="number" min={min} max={10000} value={Number.isNaN(value) ? "" : value} onChange={e => onChange(e.target.valueAsNumber)} />;
  const rule = (label: string, value: string | null, onChange: (value: string) => void) => <select aria-label={label} value={value ?? ""} onChange={e => onChange(e.target.value)}><option value="">부여하지 않음</option>{initial.rules.filter(r => r.points < 0 || r.id === value).map(r => <option key={r.id} value={r.id}>{r.name} ({r.points}점){!r.isActive ? " · 비활성" : ""}</option>)}</select>;
  async function save() {
    setError("");
    const parsed = academyPolicyInputSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요."); return; }
    setPending(true);
    try {
      const result = await review("관리규정 변경", current => ({...current,settings:{...current.settings,managementPolicy:parsed.data}}));
      if (result?.status !== "APPLIED") return;
      const response = await fetch(`/api/${divisionSlug}/settings/management-policy`, {cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      setForm(editable(data.policy));
      toast.success("이 학원의 운영 규정을 저장했습니다.");
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  return <div className="admin-flat-page">{dialog}
    <div className="admin-workspace-toolbar">
      {boolean("학원 운영 규정 사용", form.enabled !== false, enabled => update("enabled", enabled))}
      <Link href={`/${divisionSlug}/admin/settings`} className="admin-text-action">전체 설정</Link>
    </div>
    <AdminTabs items={tabs} activeId={tab} onChange={id => setTab(id as Tab)} label="학원 규정 설정" idPrefix="academy-policy" variant="secondary" scrollable />
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="admin-panel" role="tabpanel" id="academy-policy-panel-general" aria-labelledby="academy-policy-tab-general" hidden={tab !== "general"}>
          <Field label="규정 이름"><input aria-label="규정 이름" value={form.version} maxLength={100} onChange={e => update("version", e.target.value)} /></Field>
          <Field label="적용 시작일"><input aria-label="규정 적용 시작일" type="date" value={form.effectiveFrom} onChange={e => update("effectiveFrom", e.target.value)} /></Field>
          <Field label="상벌점 집계">{boolean("월별로 집계", form.monthlyPoints, value => update("monthlyPoints", value))}{boolean("상점과 벌점을 상계하지 않고 별도 관리", form.separateMeritDemerit, value => update("separateMeritDemerit", value))}</Field>
          <Field label="출결 벌점 확정">{boolean("관리자가 확인한 뒤 확정", form.managerConfirmsAttendance, value => update("managerConfirmsAttendance", value))}<p className="admin-help">해제하면 출결 저장·마감 시 연결한 벌점 규칙을 자동 적용합니다.</p></Field>
          <Field label="하루 마감 시각"><input aria-label="하루 마감 시각" type="time" value={form.closingTime} onChange={e => update("closingTime", e.target.value)} /></Field>
        </div>
        <div role="tabpanel" id="academy-policy-panel-attendance" aria-labelledby="academy-policy-tab-attendance" hidden={tab !== "attendance"} className="space-y-4">
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">교시별 출결 관리</h2>
            <Link className="admin-button" href={`/${divisionSlug}/admin/settings/periods`}>시간표 추가·수정<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          {!initial.periods.length && <p className="admin-empty-state">시간표에서 교시를 먼저 등록해 주세요.</p>}
          {!!initial.periods.length && <div className="admin-table-frame" role="region" aria-label="교시별 출결 관리 설정" tabIndex={0}>
            <table className="w-full"><thead><tr><th scope="col">교시·시간</th><th scope="col">관리</th><th scope="col">적용 요일</th><th scope="col">대상</th></tr></thead><tbody>
              {initial.periods.map(period => {
                const selected = form.controlledPeriods.find(p => p.periodId === period.id);
                const change = (next: typeof selected) => {
                  const controlled = form.controlledPeriods.filter(p => p.periodId !== period.id);
                  if (next) controlled.push(next);
                  setForm(current => ({ ...current, controlledPeriods: controlled, attendancePeriodIds: controlled.map(p => p.periodId) }));
                };
                return <tr key={period.id}>
                  <th scope="row"><span className="whitespace-nowrap">{period.name}</span><span className="admin-help block whitespace-nowrap">{period.startTime}~{period.endTime}</span></th>
                  <td><label className="flex min-h-11 items-center justify-center"><input aria-label={`${period.name} 관리`} type="checkbox" checked={!!selected} onChange={e => change(e.target.checked ? { periodId: period.id, weekdays: [1,2,3,4,5], optional: false } : undefined)} /></label></td>
                  <td><div className="flex flex-nowrap justify-center gap-x-2">{["일","월","화","수","목","금","토"].map((day,index) => <label key={day} className="flex min-h-11 items-center gap-2 whitespace-nowrap"><input type="checkbox" aria-label={`${period.name} ${day}요일`} disabled={!selected} checked={selected?.weekdays.includes(index) ?? false} onChange={e => { if (selected) change({ ...selected, weekdays: e.target.checked ? [...selected.weekdays,index].sort() : selected.weekdays.filter(d => d !== index) }); }} /><span>{day}</span></label>)}</div></td>
                  <td>{selected ? (selected.optional ? "기존 개별 관리" : "전체 학생") : "—"}</td>
                </tr>;
              })}
            </tbody></table>
          </div>}
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">출결 판정·벌점 연결</h2>
            <Link className="admin-button" href={`/${divisionSlug}/admin/points/rules`}>상벌점 항목·점수 수정<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="admin-panel">
            <Field label="아침모의고사 교시"><select aria-label="아침모의고사 교시" value={form.morningExam.periodId} onChange={e => update("morningExam", { ...form.morningExam, periodId: e.target.value })}><option value="">없음</option>{initial.periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="성적·출결 연동" help="미응시는 시험 설정의 벌점만 적용합니다.">{boolean("성적 등록 시 아침시험 자동 출석", !!form.morningExam.syncAttendance, checked => update("morningExam", { ...form.morningExam, syncAttendance: checked }))}</Field>
            <Field label="관리일 전체 결석">{rule("관리일 전체 결석 규칙", form.fullDayAbsenceRuleId, value => update("fullDayAbsenceRuleId", value))}</Field>
            <Field label="교시별 결석">{rule("교시별 결석 규칙", form.partialAbsenceRuleId, value => update("partialAbsenceRuleId", value || null))}</Field>
            <Field label="지각">{rule("지각 벌점 규칙", form.tardyRuleId, value => update("tardyRuleId", value))}</Field>
          </div>
        </div>
        <div className="admin-panel" role="tabpanel" id="academy-policy-panel-phone" aria-labelledby="academy-policy-tab-phone" hidden={tab !== "phone"}>
          <Field label="일반 반출 시간(분)">{number("일반 반출 시간", form.phone.shortLoanMinutes, value => update("phone", { ...form.phone, shortLoanMinutes: value }))}</Field>
          <Field label="기본 반출 장소"><input aria-label="기본 반출 장소" value={form.phone.loanPlace ?? ""} maxLength={100} onChange={e => update("phone", { ...form.phone, loanPlace: e.target.value })} /></Field>
          <Field label="일괄 대여">{boolean("휴대폰 일괄 대여 허용", form.phone.allowBulkRental, value => update("phone", { ...form.phone, allowBulkRental: value }))}</Field>
          <Field label="반복 예외 검토"><div className="grid grid-cols-2 gap-4"><label><span className="admin-label">최근 일수</span>{number("반복 반출 검토 기간", form.phone.repeatDays, value => update("phone", { ...form.phone, repeatDays: value }))}</label><label><span className="admin-label">누적 횟수</span>{number("반복 반출 검토 횟수", form.phone.repeatCount, value => update("phone", { ...form.phone, repeatCount: value }))}</label></div></Field>
          <Field label="재반납 안내(시작 전 분)">{number("재반납 안내 분", form.phone.resubmitBeforeMinutes, value => update("phone", { ...form.phone, resubmitBeforeMinutes: value }), 0)}</Field>
        </div>
        <div role="tabpanel" id="academy-policy-panel-leave" aria-labelledby="academy-policy-tab-leave" hidden={tab !== "leave"} className="space-y-4">
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">휴무·경고 처리</h2>
            <Link className="admin-button" href={`/${divisionSlug}/admin/settings/rules`} aria-label="휴무·반휴권 한도, 미사용 상점, 경고 기준 설정">한도·상점·경고 기준 설정<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="admin-panel">
            <Field label="반휴 적용 교시 수" help="당일 관리 대상 교시의 앞부분부터 적용합니다.">{number("반휴 적용 교시 수", form.halfDayPeriodCount ?? 3, value => update("halfDayPeriodCount", value))}</Field>
            <Field label="휴무 사전 신청">{boolean("당일 휴무 신청은 사유 확인", form.holidayPriorNotice, value => update("holidayPriorNotice", value))}</Field>
            <Field label="병가 처리">{boolean("확인된 병가는 횟수 제한·휴무권 차감에서 제외", form.healthExemptFromLimit !== false, value => update("healthExemptFromLimit", value))}</Field>
            {(["WARNING_1","WARNING_2","INTERVIEW","WITHDRAWAL"] as const).map((key, i) => <Field key={key} label={`경고 ${i + 1}단계 이름`}><input aria-label={`경고 ${i + 1}단계 이름`} value={form.warningLabels[key] ?? ""} maxLength={40} onChange={e => update("warningLabels", { ...form.warningLabels, [key]: e.target.value })} /></Field>)}
            <Field label="중도퇴실 규칙">{rule("중도퇴실 규칙", form.earlyExit.ruleId, value => update("earlyExit", { ...form.earlyExit, ruleId: value }))}</Field>
            {([["windowDays","중도퇴실 검토 기간(일)"],["interviewCount","면담 검토 횟수"],["missionCount","개선미션 검토 횟수"],["missionDays","개선미션 기간(일)"]] as const).map(([key,label]) => <Field key={key} label={label}>{number(label, form.earlyExit[key], value => update("earlyExit", { ...form.earlyExit, [key]: value }))}</Field>)}
            <Field label="무단입실 규칙">{rule("무단입실 규칙", form.unauthorizedEntry.ruleId, value => update("unauthorizedEntry", { ...form.unauthorizedEntry, ruleId: value }))}</Field>
            <Field label="무단입실 월 검토 횟수">{number("무단입실 월 검토 횟수", form.unauthorizedEntry.monthlyReviewCount, value => update("unauthorizedEntry", { ...form.unauthorizedEntry, monthlyReviewCount: value }))}</Field>
          </div>
        </div>
        <div role="tabpanel" id="academy-policy-panel-guidance" aria-labelledby="academy-policy-tab-guidance" hidden={tab !== "guidance"} className="space-y-4">
          <p className="admin-help">학생 관리규정 화면에 게시할 운영 안내입니다.</p>
          <div className="admin-panel">
            <Field label="교시별 순찰 횟수">{number("교시별 순찰 횟수", form.patrolsPerPeriod, value => update("patrolsPerPeriod", value))}</Field>
            <Field label="일일 학습목표 개수">{number("일일 학습목표 개수", form.dailyGoalCount, value => update("dailyGoalCount", value))}</Field>
            <Field label="이의신청 기간(일)">{number("이의신청 기간", form.appealDays, value => update("appealDays", value))}</Field>
          </div>
          <section className="admin-section space-y-4" aria-label="휴식 시간 설정">
            <div className="admin-workspace-toolbar"><h2 className="admin-section-title">휴식 시간</h2><button type="button" className="admin-button" onClick={() => update("breaks", [...form.breaks, { name: "휴식", startTime: "12:00", endTime: "13:00" }])}>휴식 안내 추가</button></div>
            <div className="admin-table-frame"><table className="w-full"><thead><tr><th scope="col">이름</th><th scope="col">시작</th><th scope="col">종료</th><th scope="col">관리</th></tr></thead><tbody>
              {!form.breaks.length && <tr><td colSpan={4}><p className="admin-empty-state">등록된 휴식 시간이 없습니다.</p></td></tr>}
              {form.breaks.map((item,index) => <tr key={index}><td className="min-w-32"><input className="w-full" aria-label={`휴식 ${index + 1} 이름`} value={item.name} onChange={e => update("breaks", form.breaks.map((b,i) => i === index ? { ...b, name: e.target.value } : b))} /></td>{(["startTime","endTime"] as const).map(key => <td key={key} className="min-w-40"><input className="w-full" aria-label={`휴식 ${index + 1} ${key === "startTime" ? "시작" : "종료"}`} type="time" value={item[key]} onChange={e => update("breaks", form.breaks.map((b,i) => i === index ? { ...b, [key]: e.target.value } : b))} /></td>)}<td><button type="button" className="admin-button whitespace-nowrap" aria-label={`휴식 ${index + 1} 삭제`} onClick={() => update("breaks", form.breaks.filter((_,i) => i !== index))}>삭제</button></td></tr>)}
            </tbody></table></div>
          </section>
          <section className="admin-section space-y-4" aria-label="학생 게시 안내 설정">
            <div className="admin-workspace-toolbar"><h2 className="admin-section-title">학생 게시 안내</h2><button type="button" className="admin-button" onClick={() => update("guidance", [...form.guidance, { title: "", text: "" }])}>규정 안내 추가</button></div>
            <div className="admin-table-frame"><table className="w-full table-fixed"><thead><tr><th scope="col">게시 내용</th><th scope="col" className="w-20">관리</th></tr></thead><tbody>
              {!form.guidance.length && <tr><td colSpan={2}><p className="admin-empty-state">등록된 안내가 없습니다.</p></td></tr>}
              {form.guidance.map((item,index) => <tr key={index}><td><div className="space-y-2 text-left"><div><span className="admin-label block">제목</span><input className="w-full" aria-label={`안내 ${index + 1} 제목`} value={item.title} maxLength={100} onChange={e => update("guidance", form.guidance.map((g,i) => i === index ? { ...g, title: e.target.value } : g))} /></div><div><span className="admin-label block">내용</span><textarea className="w-full" rows={3} aria-label={`안내 ${index + 1} 내용`} value={item.text} maxLength={2000} onChange={e => update("guidance", form.guidance.map((g,i) => i === index ? { ...g, text: e.target.value } : g))} /></div></div></td><td><button type="button" className="admin-button whitespace-nowrap" aria-label={`안내 ${index + 1} 삭제`} onClick={() => update("guidance", form.guidance.filter((_,i) => i !== index))}>삭제</button></td></tr>)}
            </tbody></table></div>
          </section>
        </div>
        {error && <p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-admin-line-soft pt-4">
          <button className="admin-button admin-button-primary" type="submit"><Save size={16} aria-hidden="true" />{pending ? "저장 중…" : "학원 규정 저장"}</button>
        </div>
      </fieldset>
    </form>
  </div>;
}
