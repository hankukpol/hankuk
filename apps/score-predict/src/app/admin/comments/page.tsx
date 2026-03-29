"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ExamOption {
  id: number;
  year: number;
  round: number;
  name: string;
}

interface CommentRow {
  id: number;
  examId: number;
  userId: number;
  userName: string;
  userPhone: string;
  content: string;
  createdAt: string;
  examName: string;
}

interface CommentsResponse {
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  comments: CommentRow[];
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_LIMIT = 20;

function formatDateTimeText(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export default function AdminCommentsPage() {
  const { enabled: commentsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("comments");
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    if (selectedExamId) params.set("examId", String(selectedExamId));
    if (searchKeyword) params.set("search", searchKeyword);
    return params.toString();
  }, [page, searchKeyword, selectedExamId]);

  const isAllChecked =
    comments.length > 0 && comments.every((comment) => selectedIds.includes(comment.id));

  const loadExamOptions = useCallback(async () => {
    const response = await fetch("/api/admin/exam?feature=comments", {
      method: "GET",
      cache: "no-store",
    });
    const data = (await response.json()) as { exams?: ExamOption[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "시험 목록을 불러오지 못했습니다.");
    }
    setExamOptions(data.exams ?? []);
  }, []);

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/admin/comments?${queryString}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = (await response.json()) as CommentsResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "댓글 목록을 불러오지 못했습니다.");
    }

    setComments(data.comments ?? []);
    setPage(data.pagination?.page ?? 1);
    setTotalPages(data.pagination?.totalPages ?? 1);
    setTotalCount(data.pagination?.totalCount ?? 0);
    setSelectedIds([]);
  }, [queryString]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!commentsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      try {
        await loadExamOptions();
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "시험 목록 조회에 실패했습니다.",
        });
      }
    })();
  }, [commentsEnabled, isFeatureLoading, loadExamOptions]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!commentsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadComments();
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "댓글 목록 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [commentsEnabled, isFeatureLoading, loadComments]);

  if (isFeatureLoading || (commentsEnabled && isLoading)) {
    return (
      <p className="text-sm text-slate-600">댓글 관리 페이지를 불러오는 중입니다...</p>
    );
  }

  if (!commentsEnabled) {
    return <AdminFeatureDisabledState feature="comments" />;
  }

  function toggleSelectedId(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds(() => {
      if (isAllChecked) return [];
      return comments.map((comment) => comment.id);
    });
  }

  async function handleDeleteSingle(id: number) {
    const ok = await confirm({
      title: "댓글 삭제",
      description: "댓글을 삭제하시겠습니까?",
      variant: "danger",
    });
    if (!ok) return;

    setIsDeleting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/comments?id=${id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        success?: boolean;
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "댓글 삭제에 실패했습니다.");
      }

      setNotice({ type: "success", message: "댓글을 삭제했습니다." });
      await loadComments();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "댓글 삭제에 실패했습니다.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      setNotice({ type: "error", message: "삭제할 댓글을 선택해 주세요." });
      return;
    }

    const ok = await confirm({
      title: "선택 댓글 삭제",
      description: `선택한 댓글 ${selectedIds.length}개를 삭제하시겠습니까?`,
      variant: "danger",
    });
    if (!ok) return;

    setIsDeleting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "선택 댓글 삭제에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `${data.deletedCount ?? 0}개의 댓글을 삭제했습니다.`,
      });
      await loadComments();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "선택 댓글 삭제에 실패했습니다.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">댓글 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          부적절 댓글 삭제와 댓글 운영 상태를 관리합니다.
        </p>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[220px_1fr_auto]">
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedExamId}
          onChange={(event) => {
            setSelectedExamId(Number(event.target.value) || "");
            setPage(1);
          }}
        >
          <option value="">전체 시험</option>
          {examOptions.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.year}년 {exam.round}차
            </option>
          ))}
        </select>
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="내용, 작성자명, 연락처 검색"
        />
        <Button
          type="button"
          onClick={() => {
            setSearchKeyword(searchInput.trim());
            setPage(1);
          }}
        >
          검색
        </Button>
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
        <p className="text-sm text-slate-600">댓글 목록을 불러오는 중입니다...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={isAllChecked} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3">작성자</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">시험</th>
                <th className="px-4 py-3">내용</th>
                <th className="px-4 py-3">작성일</th>
                <th className="px-4 py-3 text-right">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comments.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={7}>
                    조회된 댓글이 없습니다.
                  </td>
                </tr>
              ) : (
                comments.map((comment) => (
                  <tr key={comment.id} className="bg-white">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(comment.id)}
                        onChange={() => toggleSelectedId(comment.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {comment.userName}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{comment.userPhone}</td>
                    <td className="px-4 py-3 text-slate-700">{comment.examName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="line-clamp-1">{comment.content}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTimeText(comment.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:text-rose-700"
                        disabled={isDeleting}
                        onClick={() => void handleDeleteSingle(comment.id)}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-600">
            총 {totalCount.toLocaleString("ko-KR")}개 · {page}/{totalPages} 페이지
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting || selectedIds.length === 0}
            onClick={() => void handleDeleteSelected()}
          >
            선택 삭제
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
          >
            이전
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            다음
          </Button>
        </div>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
