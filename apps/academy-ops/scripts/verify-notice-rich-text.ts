import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, NoticeTargetType } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import { richTextToPlainText, sanitizeRichTextHtml } from "../src/lib/rich-text";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

async function main() {
  loadLocalEnv();

  const prisma = getPrisma();
  const richHtml = [
    "<h2>Important update</h2>",
    '<p><strong>Bring ID</strong> before class. <a href="https://example.com/guide" target="_blank">Guide</a></p>',
    "<ul><li>First item</li><li>Second item</li></ul>",
    "<script>alert(1)</script>",
    '<p><img src="x" onerror="alert(1)" /></p>',
  ].join("");

  const sanitized = sanitizeRichTextHtml(richHtml);
  assert.ok(sanitized.includes("<h2>Important update</h2>"));
  assert.ok(sanitized.includes("<strong>Bring ID</strong>"));
  assert.ok(sanitized.includes("<ul><li>First item</li><li>Second item</li></ul>"));
  assert.ok(!sanitized.includes("<script"));
  assert.ok(!sanitized.includes("onerror"));
  assert.ok(!sanitized.includes("<img"));
  assert.ok(sanitized.includes('target="_blank"'));
  assert.match(sanitized, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/);

  const plainText = richTextToPlainText(richHtml);
  assert.ok(plainText.includes("Important update"));
  assert.ok(plainText.includes("Bring ID"));
  assert.ok(plainText.includes("Guide (https://example.com/guide)"));
  assert.ok(plainText.includes("- First item"));
  assert.ok(plainText.includes("- Second item"));

  const stamp = Date.now();
  const created = await prisma.notice.create({
    data: {
      title: `VERIFY-NOTICE-${stamp}`,
      content: sanitized,
      targetType: NoticeTargetType.GONGCHAE,
      isPublished: false,
      publishedAt: null,
    },
  });

  try {
    const draftList = await prisma.notice.findMany({
      where: {
        isPublished: false,
      },
      select: {
        id: true,
      },
    });
    assert.ok(draftList.some((notice) => notice.id === created.id));

    const beforePublish = await prisma.notice.findMany({
      where: {
        isPublished: true,
        targetType: {
          in: [NoticeTargetType.ALL, NoticeTargetType.GONGCHAE],
        },
      },
      select: {
        id: true,
      },
    });
    assert.ok(!beforePublish.some((notice) => notice.id === created.id));

    const normalizedPlainText = sanitizeRichTextHtml("First paragraph\n\nSecond paragraph");
    await prisma.notice.update({
      where: {
        id: created.id,
      },
      data: {
        title: `VERIFY-NOTICE-${stamp}-UPDATED`,
        content: normalizedPlainText,
      },
    });

    const updated = await prisma.notice.findUniqueOrThrow({
      where: {
        id: created.id,
      },
      select: {
        title: true,
        content: true,
      },
    });

    assert.equal(updated.title, `VERIFY-NOTICE-${stamp}-UPDATED`);
    assert.ok(updated.content.includes("<p>First paragraph</p>"));
    assert.ok(updated.content.includes("<p>Second paragraph</p>"));

    await prisma.notice.update({
      where: {
        id: created.id,
      },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    const publishedAdminList = await prisma.notice.findMany({
      where: {
        isPublished: true,
      },
      select: {
        id: true,
      },
    });
    const gongchaeNotices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        targetType: {
          in: [NoticeTargetType.ALL, NoticeTargetType.GONGCHAE],
        },
      },
      select: {
        id: true,
        title: true,
      },
    });
    const gyeongchaeNotices = await prisma.notice.findMany({
      where: {
        isPublished: true,
        targetType: {
          in: [NoticeTargetType.ALL, NoticeTargetType.GYEONGCHAE],
        },
      },
      select: {
        id: true,
      },
    });

    const publishedNotice = gongchaeNotices.find((notice) => notice.id === created.id);

    assert.ok(publishedAdminList.some((notice) => notice.id === created.id));
    assert.ok(publishedNotice, "Published notice should be visible to the matching exam type.");
    assert.equal(publishedNotice?.title, `VERIFY-NOTICE-${stamp}-UPDATED`);
    assert.ok(!gyeongchaeNotices.some((notice) => notice.id === created.id));

    console.log(
      JSON.stringify(
        {
          verified: true,
          noticeId: created.id,
          sanitizedLength: sanitized.length,
          plainTextPreview: plainText.slice(0, 120),
          publishedAdminVisible: true,
          gongchaeVisible: true,
          gyeongchaeVisible: false,
          examTypeCheck: ExamType.GONGCHAE,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.notice.delete({
      where: {
        id: created.id,
      },
    }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});