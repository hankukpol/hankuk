"use client";

import { KeyRound, LoaderCircle, Plus, RefreshCcw, Save, Search, Trash2, UserX } from "lucide-react";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";
import { type FormEvent, useId, useState } from "react";
import { toast } from "@/lib/sonner";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { DivisionStaffAccount } from "@/lib/services/division-staff.service";

type StaffForm = { email: string; password: string; name: string; role: "ADMIN" | "ASSISTANT"; isActive: boolean };
function toForm(member?: DivisionStaffAccount): StaffForm {
  return { email: member?.email ?? "", password: "", name: member?.name ?? "", role: member?.role ?? "ASSISTANT", isActive: member?.isActive ?? true };
}

export function StaffManager({ divisionSlug, initialStaff }: { divisionSlug: string; initialStaff: DivisionStaffAccount[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [editing, setEditing] = useState<DivisionStaffAccount>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(toForm());
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const formId = useId();
  const passwordFormId = useId();
  const { confirm, confirmDialog } = useConfirmDialog();
  const endpoint = "/api/" + divisionSlug + "/admin/staff";
  const filtered = staff.filter((member) => (!role || member.role === role)
    && (!status || member.isActive === (status === "active"))
    && (member.name + " " + (member.email ?? "")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  async function refreshStaff() {
    setRefreshing(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "직원 목록을 불러오지 못했습니다.");
      setStaff(data.staff);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "직원 목록을 불러오지 못했습니다."); }
    finally { setRefreshing(false); }
  }

  function openEditor(member?: DivisionStaffAccount) {
    setEditing(member); setForm(toForm(member)); setError(""); setOpen(true);
  }

  async function closeEditor() {
    if (busy || passwordOpen) return;
    if (JSON.stringify(form) !== JSON.stringify(toForm(editing)) && !await confirm({
      title: "변경사항 폐기", description: "저장하지 않은 직원 정보가 있습니다.", confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning",
    })) return;
    setOpen(false); setForm(toForm()); setError("");
  }

  async function closePassword() {
    if (busy) return;
    if (password && !await confirm({ title: "변경사항 폐기", description: "입력한 비밀번호를 폐기하시겠습니까?", confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning" })) return;
    setPasswordOpen(false); setPassword(""); setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(editing ? endpoint + "/" + editing.id : endpoint, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { name: form.name, role: form.role, isActive: form.isActive } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      if (data.staff) setStaff((current) => editing ? current.map((member) => member.id === editing.id ? data.staff : member) : [...current, data.staff]);
      toast.success(editing ? "직원 정보를 수정했습니다." : "직원을 추가했습니다.");
      setOpen(false); setForm(toForm());
      await refreshStaff();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장에 실패했습니다."); }
    finally { setBusy(false); }
  }

  async function handleAction(type: "delete" | "deactivate") {
    if (!editing || busy) return;
    if (!await confirm({
      title: type === "delete" ? "계정 영구 삭제" : "계정 비활성화",
      description: type === "delete" ? editing.name + " 계정을 영구 삭제합니다. 삭제한 계정은 복구할 수 없습니다." : editing.name + " 계정의 로그인을 차단합니다. 계정 데이터는 유지됩니다.",
      confirmLabel: type === "delete" ? "영구 삭제" : "비활성화", variant: "danger",
    })) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint + "/" + editing.id + (type === "delete" ? "?permanent=true" : ""), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      setStaff((current) => type === "delete" ? current.filter((member) => member.id !== editing.id) : current.map((member) => member.id === editing.id ? { ...member, isActive: false } : member));
      setOpen(false); setForm(toForm());
      toast.success(type === "delete" ? "계정을 삭제했습니다." : "계정을 비활성화했습니다.");
      await refreshStaff();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "처리에 실패했습니다."); }
    finally { setBusy(false); }
  }

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint + "/" + editing.id + "/password", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "비밀번호 변경에 실패했습니다.");
      toast.success("비밀번호를 변경했습니다."); setPassword(""); setPasswordOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "비밀번호 변경에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <section className="admin-section">
        <MobileWorkspaceTools title="직원 조회·추가">
        <div className="admin-workspace-toolbar">
          <div><h2 className="admin-section-title">직원 목록</h2><p className="admin-help mt-1">전체 {staff.length}명 · 조회 {filtered.length}명</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="admin-text-action inline-flex items-center gap-2" disabled={refreshing || busy} onClick={() => void refreshStaff()}>{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침</button>
            <button type="button" className="admin-button admin-button-primary" onClick={() => openEditor()}><Plus className="h-4 w-4" />직원 추가</button>
          </div>
        </div>
        <div id={formId + "-filters"}><div className="admin-filter-bar">
          <label className="admin-field flex-1"><span className="admin-label">직원 검색</span><span className="relative block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-admin-text-muted" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일" className="w-full pl-11" /></span></label>
          <label className="admin-field"><span className="admin-label">권한</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="">전체 권한</option><option value="ADMIN">관리자</option><option value="ASSISTANT">조교</option></select></label>
          <label className="admin-field"><span className="admin-label">상태</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select></label>
          {query || role || status ? <button type="button" className="admin-text-action inline-flex items-center gap-2" onClick={() => { setQuery(""); setRole(""); setStatus(""); }}>필터 초기화</button> : null}
        </div></div>
        </MobileWorkspaceTools>
        {filtered.length ? <div className="admin-table-frame"><table aria-label="직원 목록">
          <thead><tr><th scope="col">직원</th><th scope="col" className="hidden md:table-cell">이메일</th><th scope="col">권한</th><th scope="col">상태</th></tr></thead>
          <tbody>{filtered.map((member) => <tr key={member.id}>
            <td className="admin-table-name"><button type="button" className="admin-table-link" aria-label={member.name + " 수정"} onClick={() => openEditor(member)}>{member.name}</button><span className="admin-help block break-all md:hidden">{member.email ?? "이메일 없음"}</span></td>
            <td className="hidden md:table-cell"><span className="block whitespace-normal break-all">{member.email ?? "이메일 없음"}</span></td>
            <td>{member.role === "ADMIN" ? "관리자" : "조교"}</td><td><span className={member.isActive ? "text-admin-success" : "text-admin-text-muted"}>{member.isActive ? "활성" : "비활성"}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="admin-empty-state">{staff.length ? "검색 조건에 맞는 직원이 없습니다." : "등록된 직원이 없습니다."}</p>}
      </section>

      <SlideOver open={open} title={editing ? "직원 정보 수정" : "직원 추가"} onClose={() => void closeEditor()}>
        <form id={formId} onSubmit={handleSubmit} className="space-y-6">
          {error && !passwordOpen ? <p role="alert" className="admin-notice admin-notice-danger">{error}</p> : null}
          <fieldset disabled={busy} className="admin-panel">
            <label className="admin-form-row"><span className="admin-form-row-label">이름</span><span className="admin-form-row-control w-full md:w-auto"><input className="w-full" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">권한</span><span className="admin-form-row-control w-full md:w-auto"><select className="w-full" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffForm["role"] })}><option value="ADMIN">관리자</option><option value="ASSISTANT">조교</option></select></span></label>
            <label className="admin-form-row"><span className="admin-form-row-label">이메일</span><span className="admin-form-row-control w-full md:w-auto"><input className="w-full" type="email" autoComplete="off" required={!editing} disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></span></label>
            {!editing ? <label className="admin-form-row"><span className="admin-form-row-label">초기 비밀번호</span><span className="admin-form-row-control w-full md:w-auto"><input className="w-full" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><span className="admin-help mt-2 block">8자 이상</span></span></label> : null}
            <label className="admin-form-row"><span className="admin-form-row-label">로그인 허용</span><span className="admin-form-row-control flex w-full items-center gap-3 md:w-auto"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>활성 계정</span></span></label>
          </fieldset>
          {editing ? <section className="admin-section"><h3 className="admin-section-title">계정 보안</h3><div className="flex flex-wrap items-center gap-4">
            <button type="button" className="admin-text-action inline-flex items-center gap-2" disabled={busy} onClick={() => { setError(""); setPassword(""); setPasswordOpen(true); }}><KeyRound className="h-4 w-4" />비밀번호 재설정</button>
            {editing.isActive ? <button type="button" className="admin-text-action inline-flex items-center gap-2" disabled={busy} onClick={() => void handleAction("deactivate")}><UserX className="h-4 w-4" />비활성화</button> : null}
            <button type="button" className="admin-button admin-button-danger-outline" disabled={busy} onClick={() => void handleAction("delete")}><Trash2 className="h-4 w-4" />계정 삭제</button>
          </div></section> : null}
          <DialogActions><button type="button" className="admin-button" disabled={busy} onClick={() => void closeEditor()}>취소</button><button type="submit" form={formId} className="admin-button admin-button-primary" disabled={busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editing ? "변경 저장" : "직원 추가"}</button></DialogActions>
        </form>
      </SlideOver>
      <SlideOver open={passwordOpen} title="비밀번호 재설정" description={editing?.name} onClose={() => void closePassword()}>
        <form id={passwordFormId} onSubmit={handlePasswordReset} className="space-y-6">
          {error ? <p role="alert" className="admin-notice admin-notice-danger">{error}</p> : null}
          <label className="admin-field"><span className="admin-label">새 비밀번호</span><input type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full" /><span className="admin-help">8자 이상</span></label>
          <DialogActions><button type="button" className="admin-button" disabled={busy} onClick={() => void closePassword()}>취소</button><button type="submit" form={passwordFormId} className="admin-button admin-button-primary" disabled={busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}비밀번호 변경</button></DialogActions>
        </form>
      </SlideOver>
      {confirmDialog}
    </>
  );
}
