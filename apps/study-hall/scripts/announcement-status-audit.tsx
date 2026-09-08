import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnouncementBadges } from "../components/announcements/AnnouncementManager";
import type { AnnouncementItem } from "../lib/services/announcement.service";

Object.assign(globalThis, { React });
const base: AnnouncementItem = {
  id: "ui-fixture", divisionId: "ui-division", divisionName: "검증용 지점", scope: "DIVISION",
  title: "검증용 공지", content: "저장하지 않는 표시 검사", createdById: "ui-admin", createdByName: "검증",
  createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z",
  publishedAt: "2099-01-01T00:00:00Z", isPublished: false, isPinned: true,
};
for (const isPublished of [false, true]) {
  for (const isPinned of [false, true]) {
    const html = renderToStaticMarkup(<AnnouncementBadges announcement={{ ...base, isPublished, isPinned }} />);
    assert.equal(html.includes(isPublished ? "공개 중" : "예약 공지"), true);
    assert.equal((html.match(/상단 고정/g) ?? []).length, isPinned ? 1 : 0);
  }
}
console.log("Announcement status/pin combinations: 4 passed; no API or database writes.");
