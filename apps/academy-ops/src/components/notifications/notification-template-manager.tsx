"use client";

import { useMemo, useState, useTransition } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import {
  renderNotificationTemplateContent,
  type NotificationTemplateSummary,
} from "@/lib/notifications/templates";
import { NotificationType } from "@prisma/client";

type NotificationTemplateManagerProps = {
  initialTemplates: NotificationTemplateSummary[];
};

type DraftState = {
  content: string;
  solapiTemplateId: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  ALIMTALK: "AlimTalk",
  SMS: "SMS",
};

function buildDraftState(templates: NotificationTemplateSummary[]) {
  return Object.fromEntries(
    templates.map((template) => [
      template.id,
      {
        content: template.content,
        solapiTemplateId: template.solapiTemplateId ?? "",
      } satisfies DraftState,
    ]),
  ) as Record<string, DraftState>;
}

export function NotificationTemplateManager({
  initialTemplates,
}: NotificationTemplateManagerProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(
    buildDraftState(initialTemplates),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [testingTemplateId, setTestingTemplateId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const templateCards = useMemo(
    () =>
      templates.map((template) => {
        const draft = drafts[template.id] ?? {
          content: template.content,
          solapiTemplateId: template.solapiTemplateId ?? "",
        };
        const preview = renderNotificationTemplateContent(
          draft.content,
          template.sampleValues,
        );
        const isDirty =
          draft.content !== template.content ||
          draft.solapiTemplateId !== (template.solapiTemplateId ?? "");
        const unattributedFallback =
          !draft.solapiTemplateId.trim() && template.envFallbackTemplateId;

        return {
          template,
          draft,
          preview,
          isDirty,
          unattributedFallback,
        };
      }),
    [drafts, templates],
  );

  function updateDraft(templateId: string, patch: Partial<DraftState>) {
    setDrafts((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] ?? { content: "", solapiTemplateId: "" }),
        ...patch,
      },
    }));
  }

  function handleSave(templateId: string) {
    const draft = drafts[templateId];

    if (!draft) {
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setActiveTemplateId(templateId);

    startTransition(async () => {
      try {
        const response = await fetchJson<{ template: NotificationTemplateSummary }>(
          `/api/notification-templates/${templateId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: draft.content,
              solapiTemplateId: draft.solapiTemplateId,
            }),
          },
          {
            defaultError: "Failed to save the notification template.",
          },
        );

        setTemplates((current) =>
          current.map((template) =>
            template.id === templateId ? response.template : template,
          ),
        );
        setDrafts((current) => ({
          ...current,
          [templateId]: {
            content: response.template.content,
            solapiTemplateId: response.template.solapiTemplateId ?? "",
          },
        }));
        setNotice("Template saved.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to save the notification template.",
        );
      } finally {
        setActiveTemplateId(null);
      }
    });
  }

  function handleTestSend(templateType: NotificationType) {
    setNotice(null);
    setErrorMessage(null);
    setTestingTemplateId(templateType);

    startTransition(async () => {
      try {
        const response = await fetchJson<{
          success: boolean;
          simulated: boolean;
          sentTo: string;
          channel: string;
          message: string;
          note?: string;
        }>(
          "/api/notifications/test",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateType }),
          },
          { defaultError: "테스트 발송에 실패했습니다." },
        );

        const channelLabel = response.channel === "ALIMTALK" ? "알림톡" : "SMS";
        const modeLabel = response.simulated ? " (시뮬레이션)" : "";
        setNotice(
          `테스트 발송 완료${modeLabel}: ${response.sentTo} (${channelLabel})${response.note ? ` — ${response.note}` : ""}`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "테스트 발송에 실패했습니다.",
        );
      } finally {
        setTestingTemplateId(null);
      }
    });
  }

  return (
    <section className="mt-8 space-y-6">
      {notice ? (
        <div className="rounded-[24px] border border-forest/20 bg-forest/10 px-4 py-4 text-sm text-forest">
          {notice}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {templateCards.map(({ template, draft, preview, isDirty, unattributedFallback }) => (
          <article
            key={template.id}
            className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-ink">{template.label}</h2>
                  <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    {CHANNEL_LABEL[template.channel] ?? template.channel}
                  </span>
                  {template.usesDefault ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      Default fallback
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-7 text-slate">{template.description}</p>
                <p className="mt-2 text-xs text-slate">
                  Updated: {template.updatedAt ? new Date(template.updatedAt).toLocaleString("ko-KR") : "-"}
                  {template.updatedBy ? ` / ${template.updatedBy}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Content</label>
                <textarea
                  value={draft.content}
                  onChange={(event) =>
                    updateDraft(template.id, { content: event.target.value })
                  }
                  rows={5}
                  className="min-h-[140px] w-full rounded-[24px] border border-ink/10 bg-mist px-4 py-3 text-sm leading-7 text-ink"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Solapi template id
                </label>
                <input
                  type="text"
                  value={draft.solapiTemplateId}
                  onChange={(event) =>
                    updateDraft(template.id, {
                      solapiTemplateId: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
                  placeholder="Optional"
                />
                <p className="mt-2 text-xs text-slate">
                  Leave empty to keep using SMS fallback only.
                </p>
                {unattributedFallback ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Legacy env fallback detected: {template.envFallbackTemplateId}
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-medium text-ink">Available variables</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {template.variables.map((variable) => (
                    <span
                      key={variable}
                      className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate"
                    >
                      {`{${variable}}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  setPreviewTemplateId((current) =>
                    current === template.id ? null : template.id,
                  )
                }
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest hover:text-forest"
              >
                {previewTemplateId === template.id ? "Hide preview" : "Preview"}
              </button>
              <button
                type="button"
                onClick={() => handleTestSend(template.type)}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testingTemplateId === template.type && isPending ? "발송 중..." : "테스트 발송"}
              </button>
              <button
                type="button"
                onClick={() => handleSave(template.id)}
                disabled={!isDirty || isPending}
                className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-60"
              >
                {activeTemplateId === template.id && isPending ? "Saving..." : "Save"}
              </button>
            </div>

            {previewTemplateId === template.id ? (
              <div className="mt-5 rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  Preview
                </p>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">
                  {preview}
                </pre>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
