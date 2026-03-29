"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UserRole = "USER" | "ADMIN";

interface UserRow {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  submissionCount: number;
  commentCount: number;
}

interface UsersResponse {
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  users: UserRow[];
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

type TempPasswordInfo = {
  userName: string;
  password: string;
} | null;

const PAGE_LIMIT = 20;

function formatDateText(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

export default function AdminUsersPage() {
  const { enabled: usersEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("users");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const { confirm, modalProps } = useConfirmModal();
  const [draftRoles, setDraftRoles] = useState<Record<number, UserRole>>({});
  const [tempPasswordInfo, setTempPasswordInfo] = useState<TempPasswordInfo>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    if (searchKeyword) params.set("search", searchKeyword);
    if (roleFilter) params.set("role", roleFilter);
    return params.toString();
  }, [page, roleFilter, searchKeyword]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/users?${queryString}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as UsersResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "사용자 목록을 불러오지 못했습니다.");
      }

      setUsers(data.users ?? []);
      setPage(data.pagination?.page ?? 1);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotalCount(data.pagination?.totalCount ?? 0);
      setDraftRoles(
        Object.fromEntries((data.users ?? []).map((item) => [item.id, item.role] as const))
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "사용자 목록 조회에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!usersEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void loadUsers();
  }, [isFeatureLoading, loadUsers, usersEnabled]);

  if (isFeatureLoading || (usersEnabled && isLoading)) {
    return (
      <p className="text-sm text-slate-600">
        사용자 관리 페이지를 불러오는 중입니다...
      </p>
    );
  }

  if (!usersEnabled) {
    return <AdminFeatureDisabledState feature="users" />;
  }

  async function handleUpdateRole(user: UserRow) {
    const nextRole = draftRoles[user.id];
    if (!nextRole || nextRole === user.role) {
      setNotice({ type: "error", message: "변경할 역할이 없습니다." });
      return;
    }

    const ok = await confirm({
      title: "권한 변경",
      description: `${user.name}님의 권한을 ${
        nextRole === "ADMIN" ? "관리자" : "일반 사용자"
      }로 변경하시겠습니까?`,
    });
    if (!ok) return;

    setUpdatingUserId(user.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "사용자 역할 변경에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `${user.name}님의 권한이 ${
          nextRole === "ADMIN" ? "관리자" : "일반 사용자"
        }로 변경되었습니다.`,
      });
      await loadUsers();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "사용자 역할 변경에 실패했습니다.",
      });
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleResetPassword(user: UserRow) {
    const ok = await confirm({
      title: "비밀번호 초기화",
      description: `${user.name}님의 비밀번호를 초기화하시겠습니까?`,
    });
    if (!ok) return;

    setUpdatingUserId(user.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        tempPassword?: string | null;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "비밀번호 초기화에 실패했습니다.");
      }

      const tempPassword = data.tempPassword ?? "";
      setTempPasswordInfo({ userName: user.name, password: tempPassword });
      setCopied(false);
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "비밀번호 초기화에 실패했습니다.",
      });
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleDownloadCsv() {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword) params.set("search", searchKeyword);
      if (roleFilter) params.set("role", roleFilter);

      const response = await fetch(`/api/admin/users/export?${params.toString()}`);
      if (!response.ok) throw new Error("다운로드에 실패했습니다.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `회원목록_${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "CSV 다운로드에 실패했습니다.",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDeleteUser(user: UserRow) {
    const ok = await confirm({
      title: "사용자 삭제",
      description: `${user.name} 사용자를 삭제하시겠습니까? 삭제 시 제출/댓글 데이터도 함께 삭제됩니다.`,
      variant: "danger",
    });
    if (!ok) return;

    setDeletingUserId(user.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/users?id=${user.id}&confirm=true`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "사용자 삭제에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `${user.name} 사용자가 삭제되었습니다.`,
      });
      await loadUsers();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "사용자 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">사용자 관리</h1>
          <p className="mt-1 text-sm text-slate-600">
            사용자 검색, 권한 변경, 비밀번호 초기화, 계정 삭제를 관리합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleDownloadCsv()}
          disabled={isDownloading || isLoading}
          className="shrink-0"
        >
          {isDownloading ? "다운로드 중..." : "CSV 다운로드"}
        </Button>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="이름 또는 연락처 검색"
          />
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value as "" | UserRole);
              setPage(1);
            }}
          >
            <option value="">전체</option>
            <option value="USER">일반 사용자</option>
            <option value="ADMIN">관리자</option>
          </select>
          <Button
            type="button"
            onClick={() => {
              setSearchKeyword(searchInput.trim());
              setPage(1);
            }}
          >
            검색
          </Button>
        </div>
      </section>

      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600">사용자 목록을 불러오는 중입니다...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3">제출</th>
                <th className="px-4 py-3">댓글</th>
                <th className="px-4 py-3">권한</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={8}>
                    조회된 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const rowBusy = updatingUserId === user.id || deletingUserId === user.id;

                  return (
                    <tr key={user.id} className="bg-white">
                      <td className="px-4 py-3 text-slate-700">{user.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                      <td className="px-4 py-3 text-slate-700">{user.phone}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateText(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{user.submissionCount}</td>
                      <td className="px-4 py-3 text-slate-700">{user.commentCount}</td>
                      <td className="px-4 py-3">
                        <select
                          value={draftRoles[user.id] ?? user.role}
                          onChange={(event) =>
                            setDraftRoles((prev) => ({
                              ...prev,
                              [user.id]: event.target.value as UserRole,
                            }))
                          }
                          disabled={rowBusy}
                          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                          <option value="USER">일반 사용자</option>
                          <option value="ADMIN">관리자</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              rowBusy || (draftRoles[user.id] ?? user.role) === user.role
                            }
                            onClick={() => void handleUpdateRole(user)}
                          >
                            권한 저장
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rowBusy}
                            onClick={() => void handleResetPassword(user)}
                          >
                            비밀번호 초기화
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-rose-600 hover:text-rose-700"
                            disabled={rowBusy}
                            onClick={() => void handleDeleteUser(user)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          총 {totalCount.toLocaleString("ko-KR")}명 · {page}/{totalPages} 페이지
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canGoPrev}
            onClick={() => setPage((prev) => prev - 1)}
          >
            이전
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canGoNext}
            onClick={() => setPage((prev) => prev + 1)}
          >
            다음
          </Button>
        </div>
      </section>

      <ConfirmModal {...modalProps} />

      {tempPasswordInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              임시 비밀번호 발급 완료
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium">{tempPasswordInfo.userName}</span>님의
              비밀번호가 초기화되었습니다. 아래 임시 비밀번호를 카카오톡 또는 문자로
              전달해 주세요.
            </p>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-xs font-medium text-amber-700">임시 비밀번호</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-amber-900">
                {tempPasswordInfo.password}
              </p>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              로그인 후 반드시 새 비밀번호로 변경하도록 안내해 주세요.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  void navigator.clipboard.writeText(tempPasswordInfo.password).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? "복사됨" : "클립보드 복사"}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => setTempPasswordInfo(null)}
              >
                확인
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
