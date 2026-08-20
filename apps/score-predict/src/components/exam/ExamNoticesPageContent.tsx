"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { richTextToPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";

interface NoticeItem {
  id: number;
  title: string;
  content: string;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoticesResponse {
  notices: NoticeItem[];
  error?: string;
}

interface ExamNoticesPageContentProps {
  embedded?: boolean;
}

const PAGE_SIZE = 10;

function getVisiblePageNumbers(currentPage: number, pageCount: number): number[] {
  const visibleCount = Math.min(5, pageCount);
  const start = Math.max(1, Math.min(currentPage - 2, pageCount - visibleCount + 1));
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

function formatBoardDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDetailDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function ExamNoticesPageContent({ embedded = false }: ExamNoticesPageContentProps) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/notices", { method: "GET", cache: "no-store" });
        const data = (await response.json()) as NoticesResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "공지사항을 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setNotices(data.notices ?? []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "공지사항을 불러오지 못했습니다.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredNotices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return notices;
    return notices.filter((notice) =>
      `${notice.title} ${richTextToPlainText(notice.content)}`.toLocaleLowerCase("ko-KR").includes(normalized)
    );
  }, [notices, query]);

  const selectedNoticeHtml = useMemo(
    () => (selectedNotice ? sanitizeRichTextHtml(selectedNotice.content) : ""),
    [selectedNotice]
  );

  const pageCount = Math.max(1, Math.ceil(filteredNotices.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageNotices = filteredNotices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visiblePageNumbers = getVisiblePageNumbers(currentPage, pageCount);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
    setPage(1);
  }

  function openNotice(notice: NoticeItem) {
    setSelectedNotice(notice);
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        공지사항을 불러오는 중입니다.
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (selectedNotice) {
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {selectedNotice.priority > 0 ? (
              <span className="rounded-md bg-service-600 px-2 py-1 font-semibold text-white">공지</span>
            ) : null}
            <span>작성자 관리자</span>
            <span>등록일 {formatDetailDate(selectedNotice.createdAt)}</span>
          </div>
          <h1 className="mt-3 text-xl font-semibold leading-snug text-slate-900">{selectedNotice.title}</h1>
        </header>

        <div
          className="min-h-48 overflow-x-auto whitespace-pre-wrap break-words px-5 py-8 text-sm leading-7 text-slate-700 sm:px-6 [&_a]:font-medium [&_a]:text-service-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-service-200 [&_blockquote]:bg-slate-50 [&_blockquote]:px-4 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: selectedNoticeHtml }}
        />

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <p className="text-xs text-slate-500">최종 수정 {formatDetailDate(selectedNotice.updatedAt)}</p>
          <button
            type="button"
            onClick={() => setSelectedNotice(null)}
            className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 focus-visible:ring-offset-2"
          >
            목록
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!embedded ? <h1 className="user-page-title">공지사항</h1> : null}
          <p className={`${embedded ? "" : "mt-1 "}text-sm text-slate-600`}>서비스 이용에 필요한 안내를 확인해 주세요.</p>
        </div>

        <form onSubmit={handleSearch} className="flex w-full sm:max-w-sm" role="search">
          <label htmlFor="notice-search" className="sr-only">
            공지사항 검색
          </label>
          <input
            id="notice-search"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="제목 또는 내용 검색"
            className="min-w-0 flex-1 rounded-l-md border border-r-0 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-service-600 focus:ring-2 focus:ring-service-100"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-r-md bg-service-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-service-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 focus-visible:ring-offset-2"
          >
            <Search className="size-4" aria-hidden="true" />
            검색
          </button>
        </form>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-700">
            전체 <span className="font-semibold text-service-700 tabular-nums">{filteredNotices.length}</span>건
          </p>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setQueryInput("");
                setPage(1);
              }}
              className="text-xs font-medium text-slate-600 underline-offset-4 hover:text-service-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600"
            >
              검색 초기화
            </button>
          ) : null}
        </div>

        <div className="hidden md:block">
          <table className="data-table w-full table-fixed">
            <caption className="sr-only">공지사항 목록</caption>
            <colgroup>
              <col className="w-24" />
              <col />
              <col className="w-28" />
              <col className="w-36" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="px-4 py-3 text-center font-semibold">번호</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">제목</th>
                <th scope="col" className="px-4 py-3 text-center font-semibold">작성자</th>
                <th scope="col" className="px-4 py-3 text-center font-semibold">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pageNotices.map((notice, index) => {
                const number = filteredNotices.length - ((currentPage - 1) * PAGE_SIZE + index);
                return (
                  <tr key={notice.id} className="transition-colors hover:bg-service-50">
                    <td className="text-slate-500 tabular-nums">
                      {notice.priority > 0 ? (
                        <span className="inline-flex rounded-md bg-service-600 px-2 py-1 text-xs font-semibold text-white">공지</span>
                      ) : number}
                    </td>
                    <td className="">
                      <button
                        type="button"
                        onClick={() => openNotice(notice)}
                        // 글자만 있는 링크형 버튼이라 줄높이(17px)가 그대로 터치 영역이 된다.
                        // 셀 padding(14px)만큼 음수 마진 + 패딩을 주어 행 높이는 그대로 두고
                        // 히트 영역만 45px로 넓힌다. 표는 md 이상에서만 보이므로 태블릿 기준이다.
                        className="-my-[14px] block max-w-full truncate py-[14px] text-left font-medium text-slate-900 hover:text-service-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600"
                      >
                        {notice.title}
                      </button>
                    </td>
                    <td className="text-slate-600">관리자</td>
                    <td className="text-slate-500 tabular-nums">{formatBoardDate(notice.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-200 md:hidden">
          {pageNotices.map((notice, index) => {
            const number = filteredNotices.length - ((currentPage - 1) * PAGE_SIZE + index);
            return (
              <li key={notice.id}>
                <button
                  type="button"
                  onClick={() => openNotice(notice)}
                  className="block w-full px-4 py-4 text-left transition-colors hover:bg-service-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-service-600"
                >
                  <span className="block truncate text-sm font-semibold text-slate-900">{notice.title}</span>
                  <span className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    {notice.priority > 0 ? (
                      <span className="rounded-md bg-service-600 px-2 py-1 font-semibold text-white">공지</span>
                    ) : (
                      <span className="tabular-nums">번호 {number}</span>
                    )}
                    <span>관리자</span>
                    <span className="tabular-nums">{formatBoardDate(notice.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {pageNotices.length < 1 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-600">
            {query ? "검색 결과가 없습니다." : "등록된 공지사항이 없습니다."}
          </div>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label="공지사항 페이지">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          {visiblePageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
              aria-current={pageNumber === currentPage ? "page" : undefined}
              className={`size-10 rounded-md border text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 ${
 pageNumber === currentPage
 ? "border-service-700 bg-service-700 text-white"
 : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
 }`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage === pageCount}
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="다음 페이지"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
