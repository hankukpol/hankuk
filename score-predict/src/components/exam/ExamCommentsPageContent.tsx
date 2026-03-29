"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface CommentItem {
  id: number;
  userId: number;
  maskedName: string;
  content: string;
  createdAt: string;
  isMine: boolean;
}

interface CommentsResponse {
  examId: number;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  comments: CommentItem[];
}

interface ExamCommentsPageContentProps {
  embedded?: boolean;
}

const COMMENT_LIMIT = 20;
const MAX_COMMENT_LENGTH = 500;

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "방금 전";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function mergeComments(current: CommentItem[], incoming: CommentItem[], prepend: boolean): CommentItem[] {
  const merged = prepend ? [...incoming, ...current] : [...current, ...incoming];
  const map = new Map<number, CommentItem>();

  for (const comment of merged) {
    map.set(comment.id, comment);
  }

  return Array.from(map.values()).sort((a, b) => b.id - a.id);
}

export default function ExamCommentsPageContent({ embedded = false }: ExamCommentsPageContentProps) {
  const router = useRouter();
  const tenant = useTenantConfig();
  const { showErrorToast } = useToast();

  const [content, setContent] = useState("");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const latestCommentId = comments.length > 0 ? comments[0].id : null;
  const latestCommentIdRef = useRef<number | null>(latestCommentId);
  const remainingChars = useMemo(() => MAX_COMMENT_LENGTH - content.length, [content.length]);

  const fetchComments = useCallback(
    async (targetPage: number, append = false) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      try {
        const response = await fetch(`/api/comments?page=${targetPage}&limit=${COMMENT_LIMIT}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as CommentsResponse & { error?: string };

        if (!response.ok) {
          if (response.status === 401) {
            if (embedded) {
              setErrorMessage("로그인이 필요합니다.");
            } else {
              router.replace(
                `${withTenantPrefix("/login", tenant.type)}?callbackUrl=${encodeURIComponent(
                  withTenantPrefix("/exam/comments", tenant.type)
                )}`
              );
            }
            return;
          }
          throw new Error(data.error ?? "댓글을 불러오지 못했습니다.");
        }

        const pagination = data.pagination;
        if (pagination) {
          setPage(pagination.page);
          setTotalCount(pagination.totalCount);
          setTotalPages(pagination.totalPages);
        }

        if (append) {
          setComments((prev) => mergeComments(prev, data.comments, false));
        } else {
          setComments(data.comments.sort((a, b) => b.id - a.id));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "댓글을 불러오지 못했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [embedded, router, showErrorToast, tenant.type]
  );

  useEffect(() => {
    latestCommentIdRef.current = latestCommentId;
  }, [latestCommentId]);

  const pollNewComments = useCallback(async () => {
    setIsPolling(true);

    try {
      const currentLatestCommentId = latestCommentIdRef.current;
      const query = currentLatestCommentId ? `after=${currentLatestCommentId}` : `page=1&limit=${COMMENT_LIMIT}`;
      const response = await fetch(`/api/comments?${query}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as CommentsResponse & { error?: string };

      if (!response.ok) {
        return;
      }

      if (!currentLatestCommentId && data.pagination) {
        setPage(data.pagination.page);
        setTotalCount(data.pagination.totalCount);
        setTotalPages(data.pagination.totalPages);
      }

      if (data.comments.length > 0) {
        setComments((prev) => mergeComments(prev, data.comments, true));
        if (currentLatestCommentId) {
          setTotalCount((prev) => prev + data.comments.length);
        }
      }
    } catch {
      // 폴링은 조용히 실패 처리
    } finally {
      setIsPolling(false);
    }
  }, []);

  useEffect(() => {
    void fetchComments(1);
  }, [fetchComments]);

  useEffect(() => {
    const interval = setInterval(() => {
      void pollNewComments();
    }, 30000);

    return () => clearInterval(interval);
  }, [pollNewComments]);

  async function handleSubmitComment() {
    const trimmed = content.trim();
    if (!trimmed) {
      setErrorMessage("댓글 내용을 입력해주세요.");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setErrorMessage(`댓글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해주세요.`);
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = (await response.json()) as { comment?: CommentItem; error?: string };

      if (!response.ok || !data.comment) {
        throw new Error(data.error ?? "댓글 등록에 실패했습니다.");
      }

      setContent("");
      setComments((prev) => mergeComments(prev, [data.comment as CommentItem], true));
      setTotalCount((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "댓글 등록에 실패했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: number) {
    const confirmed = window.confirm("댓글을 삭제하시겠습니까?");
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/comments?id=${commentId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "댓글 삭제에 실패했습니다.");
      }

      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      const message = error instanceof Error ? error.message : "댓글 삭제에 실패했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    }
  }

  const canLoadMore = page < totalPages;

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        댓글을 불러오는 중입니다...
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-slate-900">댓글</h1>
          <p className="text-sm text-slate-500">
            총 댓글 수: <span className="font-semibold text-slate-700">{totalCount.toLocaleString()}개</span>
            {isPolling ? " · 새 댓글 확인 중..." : ""}
          </p>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="댓글을 입력해주세요..."
            maxLength={MAX_COMMENT_LENGTH}
            className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs ${remainingChars < 0 ? "text-rose-600" : "text-slate-500"}`}>
              {content.length}/{MAX_COMMENT_LENGTH}
            </p>
            <Button type="button" disabled={isSubmitting} onClick={handleSubmitComment}>
              {isSubmitting ? "등록 중..." : "등록"}
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">댓글 목록 (최신순)</h2>

        {comments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">등록된 댓글이 없습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {comments.map((comment) => (
              <li key={comment.id} className="py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{comment.maskedName}</p>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-500">{formatRelativeTime(comment.createdAt)}</p>
                    {comment.isMine ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{comment.content}</p>
              </li>
            ))}
          </ul>
        )}

        {canLoadMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingMore}
              onClick={() => void fetchComments(page + 1, true)}
            >
              {isLoadingMore ? "불러오는 중..." : "더보기"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
