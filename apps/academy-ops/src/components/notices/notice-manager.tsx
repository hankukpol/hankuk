"use client";

import { NoticeTargetType } from "@prisma/client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { formatDateTime } from "@/lib/format";

type NoticeRecord = {
  id: number;
  title: string;
  content: string;
  targetType: NoticeTargetType;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoticeManagerProps = {
  initialNotices: NoticeRecord[];
  filters: {
    targetType?: NoticeTargetType;
    published?: boolean;
  };
};

type PublishedFilterLabel = "\uC804\uCCB4" | "\uAC8C\uC2DC\uB428" | "\uC784\uC2DC\uC800\uC7A5";

type NoticePublishResponse = {
  notice: NoticeRecord;
  notificationError?: string | null;
  pushSummary?: {
    status: "completed" | "skipped" | "failed";
    message: string;
  } | null;
};

const TARGET_OPTIONS: Array<{ value: NoticeTargetType; label: string }> = [
  { value: NoticeTargetType.ALL, label: "\uC804\uCCB4 \uD559\uC0DD" },
  { value: NoticeTargetType.GONGCHAE, label: "\uACF5\uCC44" },
  { value: NoticeTargetType.GYEONGCHAE, label: "\uACBD\uCC44" },
];

function sortNotices(notices: NoticeRecord[]) {
  return [...notices].sort((left, right) => {
    if (left.isPublished !== right.isPublished) {
      return Number(right.isPublished) - Number(left.isPublished);
    }

    if (left.isPinned !== right.isPinned) {
      return Number(right.isPinned) - Number(left.isPinned);
    }

    const leftTime = new Date(left.publishedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.publishedAt ?? right.createdAt).getTime();

    return rightTime - leftTime;
  });
}

function targetLabel(targetType: NoticeTargetType) {
  return TARGET_OPTIONS.find((option) => option.value === targetType)?.label ?? targetType;
}

function matchesFilters(notice: NoticeRecord, filters: NoticeManagerProps["filters"]) {
  if (filters.targetType && notice.targetType !== filters.targetType) {
    return false;
  }

  if (filters.published !== undefined && notice.isPublished !== filters.published) {
    return false;
  }

  return true;
}

function upsertNotice(
  notices: NoticeRecord[],
  notice: NoticeRecord,
  filters: NoticeManagerProps["filters"],
) {
  const next = notices.filter((item) => item.id !== notice.id);

  if (!matchesFilters(notice, filters)) {
    return sortNotices(next);
  }

  next.unshift(notice);
  return sortNotices(next);
}

function joinStatusParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatPublishStatusMessage(
  actionLabel: string,
  payload: Pick<NoticePublishResponse, "notificationError" | "pushSummary">,
) {
  const pushMessage = payload.pushSummary
    ? payload.pushSummary.status === "failed"
      ? `\uD478\uC2DC \uC2E4\uD328: ${payload.pushSummary.message}`
      : `\uD478\uC2DC: ${payload.pushSummary.message}`
    : null;
  const manualMessage = payload.notificationError
    ? `\uBB38\uC790/\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC2E4\uD328: ${payload.notificationError}`
    : null;

  return joinStatusParts([actionLabel, pushMessage, manualMessage]);
}

export function NoticeManager({ initialNotices, filters }: NoticeManagerProps) {
  const [notices, setNotices] = useState(() => sortNotices(initialNotices));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState<NoticeTargetType>(NoticeTargetType.ALL);
  const [publishOnSave, setPublishOnSave] = useState(false);
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const composerRef = useRef<HTMLElement | null>(null);

  async function requestJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "\uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }

    return payload as T;
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setTargetType(NoticeTargetType.ALL);
    setPublishOnSave(false);
  }

  function startEdit(notice: NoticeRecord) {
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setTargetType(notice.targetType);
    setPublishOnSave(false);
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function publishedFilterLabel(): PublishedFilterLabel {
    if (filters.published === true) {
      return "\uAC8C\uC2DC\uB428";
    }

    if (filters.published === false) {
      return "\uC784\uC2DC\uC800\uC7A5";
    }

    return "\uC804\uCCB4";
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNoticeMessage(nextNotice);
    setErrorMessage(nextError);
  }

  function togglePin(notice: NoticeRecord) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson<{ notice: NoticeRecord }>(
          `/api/notices/${notice.id}/pin`,
          {
            method: "PUT",
            body: JSON.stringify({ isPinned: !notice.isPinned }),
          },
        );

        setNotices((current) => upsertNotice(current, payload.notice, filters));
        setNoticeMessage(
          payload.notice.isPinned
            ? "\uACF5\uC9C0\uB97C \uC0C1\uB2E8\uC5D0 \uACE0\uC815\uD588\uC2B5\uB2C8\uB2E4."
            : "\uACF5\uC9C0 \uACE0\uC815\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.",
        );
        setErrorMessage(null);
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "\uACE0\uC815 \uC0C1\uD0DC \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
        );
      }
    });
  }

  function saveNotice() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson<{ notice: NoticeRecord }>(
          editingId ? `/api/notices/${editingId}` : "/api/notices",
          {
            method: editingId ? "PUT" : "POST",
            body: JSON.stringify({
              title,
              content,
              targetType,
            }),
          },
        );

        let finalNotice = payload.notice;
        let finalMessage = editingId
          ? "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4."
          : "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uC791\uC131\uD588\uC2B5\uB2C8\uB2E4.";

        if (publishOnSave && !payload.notice.isPublished) {
          const published = await requestJson<NoticePublishResponse>(
            `/api/notices/${payload.notice.id}/publish`,
            {
              method: "PUT",
              body: JSON.stringify({
                isPublished: true,
                sendNotification: notifyOnPublish,
              }),
            },
          );

          finalNotice = published.notice;
          finalMessage = formatPublishStatusMessage(
            editingId
              ? "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uC218\uC815\uD558\uACE0 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4."
              : "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uC791\uC131\uD558\uACE0 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4.",
            published,
          );
        }

        setNotices((current) => upsertNotice(current, finalNotice, filters));
        setNoticeMessage(finalMessage);
        setErrorMessage(null);
        resetForm();
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "\uACF5\uC9C0\uC0AC\uD56D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
        );
      }
    });
  }

  useSubmitShortcut({
    containerRef: composerRef,
    enabled: !isPending,
    onSubmit: saveNotice,
  });

  function togglePublish(notice: NoticeRecord, nextPublished: boolean) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const payload = await requestJson<NoticePublishResponse>(
          `/api/notices/${notice.id}/publish`,
          {
            method: "PUT",
            body: JSON.stringify({
              isPublished: nextPublished,
              sendNotification: nextPublished && notifyOnPublish,
            }),
          },
        );

        setNotices((current) => upsertNotice(current, payload.notice, filters));
        setNoticeMessage(
          formatPublishStatusMessage(
            nextPublished
              ? "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4."
              : "\uC784\uC2DC\uC800\uC7A5\uC73C\uB85C \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4.",
            payload,
          ),
        );
        setErrorMessage(null);
      } catch (error) {
        setNoticeMessage(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "\uAC8C\uC2DC \uC0C1\uD0DC \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
        );
      }
    });
  }

  function removeNotice(id: number) {
    confirmModal.openModal({
      badgeLabel: "\uC0AD\uC81C \uD655\uC778",
      badgeTone: "warning",
      title: "\uACF5\uC9C0 \uC0AD\uC81C",
      description: "\uC774 \uACF5\uC9C0\uC0AC\uD56D\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
      details: [
        "\uC0AD\uC81C\uD55C \uACF5\uC9C0 \uB0B4\uC6A9\uC740 \uB2E4\uC2DC \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
      ],
      cancelLabel: "\uCDE8\uC18C",
      confirmLabel: "\uC0AD\uC81C",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson<{ success: true }>(`/api/notices/${id}`, {
              method: "DELETE",
            });

            setNotices((current) => current.filter((notice) => notice.id !== id));

            if (editingId === id) {
              resetForm();
            }

            setNoticeMessage("\uACF5\uC9C0\uC0AC\uD56D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
            setErrorMessage(null);
          } catch (error) {
            setNoticeMessage(null);
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "\uACF5\uC9C0\uC0AC\uD56D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
            );
          }
        });
      },
    });
  }

  const currentPublishedFilter = publishedFilterLabel();

  return (
    <div className="space-y-8">
      <section ref={composerRef} className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {editingId ? "\uACF5\uC9C0\uC0AC\uD56D \uC218\uC815" : "\uACF5\uC9C0\uC0AC\uD56D \uC791\uC131"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              {`\uD604\uC7AC \uD544\uD130: \uB300\uC0C1 ${filters.targetType ? targetLabel(filters.targetType) : "\uC804\uCCB4"} / \uC0C1\uD0DC ${currentPublishedFilter}`}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={notifyOnPublish}
              onChange={(event) => setNotifyOnPublish(event.target.checked)}
            />
            <span>\uAC8C\uC2DC \uC2DC \uC54C\uB9BC \uBC1C\uC1A1</span>
          </label>
        </div>

        {noticeMessage ? (
          <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {noticeMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-sm font-medium">\uB300\uC0C1</label>
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value as NoticeTargetType)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">\uC81C\uBAA9</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              placeholder="\uACF5\uC9C0\uC0AC\uD56D \uC81C\uBAA9"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">\uB0B4\uC6A9</label>
          <RichTextEditor content={content} onChange={setContent} disabled={isPending} />
          <p className="mt-2 text-xs text-slate">
            \uAD75\uAC8C, \uC81C\uBAA9, \uBAA9\uB85D, \uB9C1\uD06C \uC11C\uC2DD\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAE30\uC874 \uC77C\uBC18 \uD14D\uC2A4\uD2B8 \uACF5\uC9C0\uB3C4 \uC790\uB3D9\uC73C\uB85C \uBB38\uB2E8 \uD615\uC2DD\uC73C\uB85C \uC815\uB9AC\uB429\uB2C8\uB2E4.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={publishOnSave}
              onChange={(event) => setPublishOnSave(event.target.checked)}
            />
            <span>\uC800\uC7A5 \uD6C4 \uC989\uC2DC \uAC8C\uC2DC</span>
          </label>
          <button
            type="button"
            onClick={saveNotice}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {editingId ? "\uC218\uC815 \uC800\uC7A5" : "\uACF5\uC9C0\uC0AC\uD56D \uC791\uC131"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              \uC218\uC815 \uCDE8\uC18C
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">\uACF5\uC9C0\uC0AC\uD56D \uBAA9\uB85D</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              {`\uD604\uC7AC \uD544\uD130 \uACB0\uACFC ${notices.length}\uAC1C`}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {notices.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              \uC870\uAC74\uC5D0 \uB9DE\uB294 \uACF5\uC9C0\uC0AC\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.
            </div>
          ) : null}

          {notices.map((notice) => (
            <article key={notice.id} className="rounded-[24px] border border-ink/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                      {targetLabel(notice.targetType)}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                        notice.isPublished
                          ? "border-forest/20 bg-forest/10 text-forest"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {notice.isPublished ? "\uAC8C\uC2DC\uB428" : "\uC784\uC2DC\uC800\uC7A5"}
                    </span>
                    {notice.isPinned && (
                      <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                        \uACE0\uC815
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">
                    <Link
                      href={`/admin/notices/${notice.id}`}
                      className="hover:text-forest hover:underline"
                    >
                      {notice.title}
                    </Link>
                  </h3>
                  <p className="mt-2 text-xs text-slate">
                    {`\uC791\uC131 ${formatDateTime(notice.createdAt)} / \uC218\uC815 ${formatDateTime(notice.updatedAt)}${
                      notice.publishedAt ? ` / \uAC8C\uC2DC ${formatDateTime(notice.publishedAt)}` : ""
                    }`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/notices/${notice.id}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
                  >
                    상세
                  </Link>
                  <button
                    type="button"
                    onClick={() => startEdit(notice)}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    \uC218\uC815
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(notice)}
                    disabled={isPending}
                    className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      notice.isPinned
                        ? "border-ember/30 bg-ember/5 text-ember hover:bg-ember/10"
                        : "border-ink/10 hover:border-ember/30 hover:text-ember"
                    }`}
                  >
                    {notice.isPinned ? "\uACE0\uC815 \uD574\uC81C" : "\uACE0\uC815"}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublish(notice, !notice.isPublished)}
                    disabled={isPending}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
                  >
                    {notice.isPublished ? "\uC784\uC2DC\uC800\uC7A5\uC73C\uB85C" : "\uAC8C\uC2DC"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNotice(notice.id)}
                    disabled={isPending}
                    className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-400"
                  >
                    \uC0AD\uC81C
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] bg-mist px-4 py-4">
                <RichTextViewer html={notice.content} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "\uD655\uC778"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}