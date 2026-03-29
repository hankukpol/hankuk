"use client";

import { Megaphone, Pin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  PortalEmptyState,
  portalChipClass,
  portalInsetClass,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import type { AnnouncementItem } from "@/lib/services/announcement.service";

type StudentAnnouncementBoardProps = {
  announcements: AnnouncementItem[];
};

type VisibilityFilter = "ALL" | "PINNED";

function getScopeLabel(announcement: AnnouncementItem) {
  return announcement.scope === "GLOBAL"
    ? "전체 공지"
    : announcement.divisionName || "지점 공지";
}

function getAnnouncementDate(announcement: AnnouncementItem) {
  return announcement.publishedAt ?? announcement.createdAt;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPreviewText(content: string, maxLength = 96) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

export function StudentAnnouncementBoard({
  announcements,
}: StudentAnnouncementBoardProps) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(
    announcements[0]?.id ?? null,
  );

  const visibleAnnouncements = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return announcements
      .filter((announcement) => visibilityFilter === "ALL" || announcement.isPinned)
      .filter((announcement) => {
        if (!keyword) {
          return true;
        }

        return (
          announcement.title.toLowerCase().includes(keyword) ||
          announcement.content.toLowerCase().includes(keyword) ||
          getScopeLabel(announcement).toLowerCase().includes(keyword)
        );
      });
  }, [announcements, searchKeyword, visibilityFilter]);

  useEffect(() => {
    if (visibleAnnouncements.length === 0) {
      if (selectedAnnouncementId !== null) {
        setSelectedAnnouncementId(null);
      }
      return;
    }

    if (!visibleAnnouncements.some((announcement) => announcement.id === selectedAnnouncementId)) {
      setSelectedAnnouncementId(visibleAnnouncements[0].id);
    }
  }, [selectedAnnouncementId, visibleAnnouncements]);

  const selectedAnnouncement =
    visibleAnnouncements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null;

  return (
    <div className="grid gap-3">
      <section className={portalSectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-[17px] font-bold text-[var(--foreground)]">
            공지 목록
          </h3>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[300px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                className="w-full rounded-[10px] border border-[var(--border)] bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition focus:border-[var(--division-color)]"
                placeholder="제목 또는 내용 검색"
              />
            </label>

            <div className="flex justify-end">
              <select
                value={visibilityFilter}
                onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}
                className="rounded-[10px] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--division-color)]"
              >
                <option value="ALL">전체 공지</option>
                <option value="PINNED">중요 공지만</option>
              </select>
            </div>
          </div>
        </div>

        {visibleAnnouncements.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-[10px] border border-[var(--border)]">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-[#F4F4F2] text-left text-[var(--muted)]">
                <tr>
                  <th className="w-[72px] px-4 py-3 font-medium">번호</th>
                  <th className="px-4 py-3 font-medium">제목</th>
                  <th className="w-[140px] px-4 py-3 font-medium">구분</th>
                  <th className="w-[170px] px-4 py-3 font-medium">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleAnnouncements.map((announcement, index) => {
                  const isSelected = selectedAnnouncement?.id === announcement.id;

                  return (
                    <tr
                      key={announcement.id}
                      onClick={() => setSelectedAnnouncementId(announcement.id)}
                      className={`cursor-pointer transition ${
                        isSelected ? "bg-[#F4F4F2]" : "hover:bg-[#F4F4F2]/60"
                      }`}
                    >
                      <td className="px-4 py-4 align-top text-[var(--muted)]">
                        {visibleAnnouncements.length - index}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="max-w-[420px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-[var(--foreground)]">{announcement.title}</p>
                            {announcement.isPinned ? (
                              <span className="inline-flex items-center gap-1 rounded-[10px] border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                <Pin className="h-3 w-3" />
                                중요
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12px] leading-[1.5] text-[var(--muted)]">
                            {getPreviewText(announcement.content)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={portalChipClass}>{getScopeLabel(announcement)}</span>
                      </td>
                      <td className="px-4 py-4 align-top text-[var(--muted)]">
                        {formatDateTime(getAnnouncementDate(announcement))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3">
            <PortalEmptyState
              title="조건에 맞는 공지가 없습니다."
              description="검색어나 필터를 바꿔 다시 확인해 주세요."
            />
          </div>
        )}
      </section>

      <section className={portalSectionClass}>
        {selectedAnnouncement ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={portalChipClass}>{getScopeLabel(selectedAnnouncement)}</span>
              {selectedAnnouncement.isPinned ? (
                <span className="inline-flex items-center gap-1 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700">
                  <Pin className="h-3 w-3" />
                  중요 공지
                </span>
              ) : null}
            </div>

            <h3 className="mt-3 text-[20px] font-bold text-[var(--foreground)]">
              {selectedAnnouncement.title}
            </h3>

            <div className={`${portalInsetClass} mt-3`}>
              <p className="whitespace-pre-line text-[14px] leading-[1.7] text-[var(--foreground)]">
                {selectedAnnouncement.content}
              </p>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <div className={portalInsetClass}>
                <p className="text-[12px] font-medium text-[var(--muted)]">
                  공개 시각
                </p>
                <p className="mt-1.5 text-[14px] font-semibold text-[var(--foreground)]">
                  {formatDateTime(getAnnouncementDate(selectedAnnouncement))}
                </p>
              </div>

              <div className={portalInsetClass}>
                <p className="text-[12px] font-medium text-[var(--muted)]">
                  작성자
                </p>
                <p className="mt-1.5 text-[14px] font-semibold text-[var(--foreground)]">
                  {selectedAnnouncement.createdByName || "관리자"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[#F4F4F2] px-3.5 py-3 text-[13px] text-[var(--muted)]">
              <Megaphone className="h-4 w-4 text-[var(--muted)]" />
              최신 공지가 위에서부터 순서대로 정렬됩니다.
            </div>
          </>
        ) : (
          <PortalEmptyState
            title="선택된 공지가 없습니다."
            description="위 목록에서 공지를 선택하면 상세 내용을 볼 수 있습니다."
          />
        )}
      </section>
    </div>
  );
}
