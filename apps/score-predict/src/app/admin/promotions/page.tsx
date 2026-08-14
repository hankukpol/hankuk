"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CustomHtmlPromotionFrame from "@/components/landing/CustomHtmlPromotionFrame";
import {
  DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT,
  isCustomHtmlPromotionContent,
  type CustomHtmlPromotionContent,
} from "@/lib/promotions/template-registry";
import CustomHtmlPromotionEditor from "./_components/CustomHtmlPromotionEditor";
import DeletePromotionDialog from "./_components/DeletePromotionDialog";

type CampaignStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Campaign = {
  id: number;
  name: string;
  templateKey: string;
  templateVersion: number;
  status: CampaignStatus;
  draftContent: CustomHtmlPromotionContent;
  publishedVersion: number;
  updatedAt: string;
  revisions: Array<{
    id: number;
    version: number;
    content: CustomHtmlPromotionContent;
    createdAt: string;
  }>;
};

type Payload = {
  activeExam: { id: number; name: string; year: number; round: number };
  operationState: { activeCampaignId: number | null; phase: string; version: number } | null;
  campaigns: Campaign[];
};

const fieldClass =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-service-600 focus:ring-2 focus:ring-service-100";
const buttonClass =
  "inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function readHtmlContent(value: unknown) {
  return isCustomHtmlPromotionContent(value)
    ? value.htmlDocument
    : DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT.htmlDocument;
}

export default function PromotionsAdminPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [customHtml, setCustomHtml] = useState(DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT.htmlDocument);
  const [previewWidth, setPreviewWidth] = useState<390 | 768 | 1280>(1280);
  const [previewRevisionVersion, setPreviewRevisionVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async (preferredId?: number | null) => {
    const response = await fetch("/api/admin/promotions", { cache: "no-store" });
    const result = (await response.json()) as Payload & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "프로모션을 불러오지 못했습니다.");

    setData(result);
    const nextId = result.campaigns.some((campaign) => campaign.id === preferredId)
      ? preferredId ?? null
      : result.campaigns[0]?.id ?? null;
    setSelectedId(nextId);
    const selected = result.campaigns.find((campaign) => campaign.id === nextId);
    if (selected) {
      setName(selected.name);
      setCustomHtml(readHtmlContent(selected.draftContent));
    } else {
      setName("");
      setCustomHtml(DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT.htmlDocument);
    }
    setPreviewRevisionVersion(null);
  }, []);

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "프로모션을 불러오지 못했습니다."));
  }, [load]);

  const selected = useMemo(
    () => data?.campaigns.find((campaign) => campaign.id === selectedId) ?? null,
    [data, selectedId],
  );

  function selectCampaign(campaign: Campaign) {
    setSelectedId(campaign.id);
    setName(campaign.name);
    setCustomHtml(readHtmlContent(campaign.draftContent));
    setPreviewRevisionVersion(null);
    setMessage("");
  }

  async function createCampaign() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "캠페인을 만들지 못했습니다.");
      await load(result.campaign.id);
      setMessage("새 HTML/CSS 캠페인을 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "캠페인을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          action: actionName,
          expectedUpdatedAt: selected.updatedAt,
          ...(["SAVE", "PUBLISH"].includes(actionName)
            ? { name, content: { htmlDocument: customHtml } }
            : {}),
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "작업에 실패했습니다.");
      await load(result.campaign?.id ?? selected.id);
      setMessage(
        actionName === "SAVE"
          ? "임시저장했습니다. 운영 화면은 바뀌지 않습니다."
          : actionName === "PUBLISH"
            ? "HTML/CSS 랜딩을 게시했습니다. 대표 캠페인이라면 운영 화면에 즉시 반영됩니다."
            : "작업을 완료했습니다.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign() {
    if (!selected) return;
    setBusy(true);
    setDeleteError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, expectedUpdatedAt: selected.updatedAt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "프로모션을 삭제하지 못했습니다.");
      const nextId = data?.campaigns.find((campaign) => campaign.id !== selected.id)?.id ?? null;
      setDeleteOpen(false);
      await load(nextId);
      setMessage(`‘${selected.name}’ 캠페인을 삭제했습니다.`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "프로모션을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {message || "프로모션 관리 데이터를 불러오는 중입니다..."}
      </div>
    );
  }

  const previewRevision = selected?.revisions.find(
    (revision) => revision.version === previewRevisionVersion,
  ) ?? null;
  const previewHtml = previewRevision
    ? readHtmlContent(previewRevision.content)
    : customHtml;

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-service-700">
            {data.activeExam.year}년 {data.activeExam.round}차 · {data.activeExam.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">프로모션 관리</h1>
          <p className="mt-1 text-sm text-slate-600">
            HTML과 CSS 코드를 임시저장하고 미리보기한 뒤 게시합니다.
          </p>
        </div>
        <button
          type="button"
          className={`${buttonClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
          onClick={() => void createCampaign()}
          disabled={busy}
        >
          새 HTML/CSS 캠페인
        </button>
      </header>

      {message ? (
        <div role="status" className="border-l-2 border-service-600 bg-service-50 px-4 py-3 text-sm text-service-950">
          {message}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            현재 회차 HTML/CSS 캠페인
          </div>
          {data.campaigns.length ? (
            <div className="divide-y divide-slate-200">
              {data.campaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.id}
                  className={`block w-full px-4 py-3 text-left transition ${
                    campaign.id === selectedId
                      ? "bg-service-50 text-service-950"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => selectCampaign(campaign)}
                >
                  <span className="block text-sm font-semibold">{campaign.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {campaign.status} · 게시 v{campaign.publishedVersion}
                    {data.operationState?.activeCampaignId === campaign.id ? " · 대표" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm leading-6 text-slate-500">
              아직 HTML/CSS 캠페인이 없습니다. 새 캠페인을 만든 뒤 코드를 입력해 주세요.
            </p>
          )}
        </aside>

        {selected ? (
          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  <span>캠페인 이름</span>
                  <input
                    className={fieldClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={selected.status === "ARCHIVED"}
                  />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    className={`${buttonClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                    disabled={busy}
                    onClick={() => void action("CLONE")}
                  >
                    복제
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                    disabled={busy || selected.status === "ARCHIVED"}
                    onClick={() => void action("ARCHIVE")}
                  >
                    보관
                  </button>
                  <button
                    type="button"
                    title={data.operationState?.activeCampaignId === selected.id
                      ? "대표 캠페인은 다른 캠페인으로 전환한 뒤 삭제할 수 있습니다."
                      : undefined}
                    className={`${buttonClass} border-rose-300 bg-white text-rose-700 hover:bg-rose-50`}
                    disabled={busy || data.operationState?.activeCampaignId === selected.id}
                    onClick={() => {
                      setDeleteError("");
                      setDeleteOpen(true);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </section>

            <DeletePromotionDialog
              campaignName={selected.name}
              error={deleteError}
              isDeleting={busy}
              open={deleteOpen}
              onConfirm={() => void deleteCampaign()}
              onOpenChange={setDeleteOpen}
            />

            {selected.status === "ARCHIVED" ? (
              <div className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                보관된 캠페인은 수정할 수 없습니다. 복제하여 새 캠페인으로 사용해 주세요.
              </div>
            ) : (
              <CustomHtmlPromotionEditor
                value={customHtml}
                onChange={setCustomHtml}
                onPreview={() => document.getElementById("promotion-preview")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })}
              />
            )}

            <section className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white p-3 shadow-lg">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${buttonClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                  disabled={busy || selected.status === "ARCHIVED"}
                  onClick={() => void action("SAVE")}
                >
                  임시저장
                </button>
                <button
                  type="button"
                  className={`${buttonClass} border-service-700 bg-service-700 text-white hover:bg-service-800`}
                  disabled={busy || selected.status === "ARCHIVED"}
                  onClick={() => void action("PUBLISH")}
                >
                  게시
                </button>
                {selected.revisions.length ? (
                  <>
                    <select
                      aria-label="미리볼 게시 버전"
                      className={fieldClass}
                      value={previewRevisionVersion ?? ""}
                      onChange={(event) => setPreviewRevisionVersion(
                        event.target.value ? Number(event.target.value) : null,
                      )}
                    >
                      <option value="">현재 편집 내용 미리보기</option>
                      {selected.revisions.map((revision) => (
                        <option key={revision.id} value={revision.version}>
                          게시 v{revision.version} · {new Date(revision.createdAt).toLocaleString("ko-KR")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`${buttonClass} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                      disabled={busy || selected.status === "ARCHIVED" || previewRevisionVersion === null}
                      onClick={() => void action("RESTORE", { version: previewRevisionVersion })}
                    >
                      선택 버전 복원
                    </button>
                  </>
                ) : null}
              </div>
              <span className="text-xs text-slate-500">임시저장은 운영 화면을 바꾸지 않습니다.</span>
            </section>

            <section
              id="promotion-preview"
              className="scroll-mt-5 overflow-hidden rounded-xl border border-slate-300 bg-slate-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-600 px-4 py-3 text-white">
                <div>
                  <h2 className="font-semibold">
                    {previewRevision ? `게시 v${previewRevision.version} 미리보기` : "현재 편집 내용 미리보기"}
                  </h2>
                  <p className="text-xs text-slate-300">
                    {previewRevision
                      ? "과거 게시본을 확인한 뒤 필요한 경우 복원하세요."
                      : "실제 게시 전 현재 HTML/CSS를 확인합니다."}
                  </p>
                </div>
                <div className="flex gap-1">
                  {([390, 768, 1280] as const).map((width) => (
                    <button
                      type="button"
                      key={width}
                      className={`${buttonClass} h-9 px-3 text-xs ${
                        previewWidth === width
                          ? "border-white bg-white text-slate-950"
                          : "border-slate-500 bg-slate-700 text-white"
                      }`}
                      onClick={() => setPreviewWidth(width)}
                    >
                      {width}px
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto bg-slate-200 p-3">
                <div className="mx-auto overflow-hidden rounded-lg bg-white" style={{ width: previewWidth }}>
                  <CustomHtmlPromotionFrame
                    htmlDocument={previewHtml}
                    title={`${name || "HTML/CSS 캠페인"} 관리자 미리보기`}
                  />
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            새 HTML/CSS 캠페인을 만들어 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
