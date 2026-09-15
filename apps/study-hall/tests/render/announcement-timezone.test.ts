import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnouncementManager } from "../../components/announcements/AnnouncementManager";
import type { AnnouncementItem } from "../../lib/services/announcement.service";

Object.defineProperty(globalThis, "React", { value: React, configurable: true });

test("announcement board uses the same KST text across host timezones and midnight", () => {
  const previous = process.env.TZ;
  const announcement: AnnouncementItem = {
    id: "a1", title: "검증 공지", content: "내용", scope: "DIVISION", isPinned: false,
    isPublished: true, publishedAt: "2026-09-14T15:00:00.000Z", createdAt: "2026-09-14T15:00:00.000Z",
    updatedAt: "2026-09-14T15:00:00.000Z", divisionId: "division-police",
    divisionName: "검증 학원", createdById: "admin-1", createdByName: "관리자",
  };
  try {
    const output = ["UTC", "Asia/Seoul", "America/Los_Angeles"].map((tz) => {
      process.env.TZ = tz;
      return renderToStaticMarkup(React.createElement(AnnouncementManager, {
        divisionSlug: "police", canManageGlobal: false, initialAnnouncements: [announcement],
      }));
    });
    assert.equal(output[0], output[1]);
    assert.equal(output[0], output[2]);
    assert.match(output[0], /09-15 00:00/);
    assert.doesNotMatch(output[0], /AM|PM|오전|오후|24:00/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
