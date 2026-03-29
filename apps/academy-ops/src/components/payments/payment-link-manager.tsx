"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/ui/action-modal";
import type { PaymentLinkRow, CourseOption, LinkStats } from "@/app/admin/payments/links/page";

type Props = {
  initialLinks: PaymentLinkRow[];
  courses: CourseOption[];
  initialStats: LinkStats;
};

type LinkForm = {
  title: string;
  courseId: string;
  amount: string;
  discountAmount: string;
  allowPoint: boolean;
  expiresAt: string;
  expiryPreset: string;
  maxUsage: string;
  note: string;
};

const TEXT = {
  active: "\uD65C\uC131",
  expired: "\uB9CC\uB8CC",
  disabled: "\uBE44\uD65C\uC131",
  usedUp: "\uC18C\uC9C4",
  hours24: "24\uC2DC\uAC04",
  hours48: "48\uC2DC\uAC04",
  hours72: "72\uC2DC\uAC04",
  week1: "1\uC8FC\uC77C",
  customDate: "\uC9C1\uC811 \uC785\uB825",
  expiredSoon: "\uB9CC\uB8CC\uB428",
  expireInMinutes: "\uBD84 \uD6C4 \uB9CC\uB8CC",
  expireInHours: "\uC2DC\uAC04 \uD6C4 \uB9CC\uB8CC",
  expireInDays: "\uC77C \uD6C4 \uB9CC\uB8CC",
  totalLinks: "\uC804\uCCB4 \uB9C1\uD06C",
  activeLinks: "\uD65C\uC131 \uB9C1\uD06C",
  paidCount: "\uACB0\uC81C \uC644\uB8CC",
  expiredCount: "\uB9CC\uB8CC\uB428",
  disabledCount: "\uBE44\uD65C\uC131",
  expiringSoonBanner: "24\uC2DC\uAC04 \uC774\uB0B4 \uB9CC\uB8CC \uB9C1\uD06C",
  expiringSoonHint:
    "\uB9CC\uB8CC \uC804\uC5D0 \uC5F0\uC7A5\uD558\uAC70\uB098 \uC0C8 \uB9C1\uD06C\uB97C \uBC1C\uC1A1\uD558\uC138\uC694.",
  linkCountSuffix: "\uAC1C \uB9C1\uD06C",
  bulkCreate: "\uC77C\uAD04 \uC0DD\uC131",
  createLink: "+ \uACB0\uC81C \uB9C1\uD06C \uC0DD\uC131",
  headingTitleCourse: "\uC81C\uBAA9 / \uACFC\uC815",
  headingAmount: "\uACB0\uC81C \uAE08\uC561",
  headingExpiresAt: "\uB9CC\uB8CC\uC77C",
  headingUsage: "\uC0AC\uC6A9 \uD604\uD669",
  headingStatus: "\uC0C1\uD0DC",
  headingCreatedBy: "\uC0DD\uC131\uC790",
  headingActions: "\uAD00\uB9AC",
  noLinks: "\uC0DD\uC131\uB41C \uACB0\uC81C \uB9C1\uD06C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  discountSuffix: "\uC6D0 \uD560\uC778",
  useCount: "\uD68C \uC0AC\uC6A9",
  copyLink: "\uB9C1\uD06C \uBCF5\uC0AC",
  copied: "\uBCF5\uC0AC\uB428",
  preview: "\uBBF8\uB9AC\uBCF4\uAE30",
  detail: "\uC0C1\uC138",
  disable: "\uBE44\uD65C\uC131\uD654",
  badge: "\uACB0\uC81C \uB9C1\uD06C",
  createTitle: "\uACB0\uC81C \uB9C1\uD06C \uC0DD\uC131",
  createDescription: "\uD559\uC0DD\uC5D0\uAC8C \uC804\uC1A1\uD560 \uACB0\uC81C \uB9C1\uD06C\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4.",
  createConfirm: "\uB9C1\uD06C \uC0DD\uC131",
  cancel: "\uCDE8\uC18C",
  createFailed: "\uC0DD\uC131 \uC2E4\uD328",
  titleLabel: "\uB9C1\uD06C \uC81C\uBAA9",
  requiredMark: " *",
  titlePlaceholder: "2026 \uACF5\uCC44 \uC885\uD569\uBC18 3\uC6D4 \uB4F1\uB85D",
  courseLabel: "\uACFC\uC815 \uC5F0\uACB0 (\uC120\uD0DD)",
  noCourse: "\uACFC\uC815 \uC120\uD0DD \uC5C6\uC74C",
  amountLabel: "\uACB0\uC81C \uAE08\uC561 (\uC6D0)",
  discountLabel: "\uD560\uC778 \uAE08\uC561 (\uC6D0)",
  finalAmount: "\uCD5C\uC885 \uACB0\uC81C \uAE08\uC561",
  allowPoint: "\uD3EC\uC778\uD2B8 \uC0AC\uC6A9 \uD5C8\uC6A9",
  expiresLabel: "\uB9CC\uB8CC \uC2DC\uAC04",
  maxUsageLabel: "\uCD5C\uB300 \uC0AC\uC6A9 \uD69F\uC218 (\uBE44\uC6CC\uB450\uBA74 \uBB34\uC81C\uD55C)",
  unlimitedPlaceholder: "\uBB34\uC81C\uD55C",
  noteLabel: "\uBA54\uBAA8 (\uC120\uD0DD)",
  notePlaceholder: "3\uC6D4 \uC2E0\uADDC \uC774\uBCA4\uD2B8 \uB9C1\uD06C",
  disableTitle: "\uACB0\uC81C \uB9C1\uD06C \uBE44\uD65C\uC131\uD654",
  disableDescription: "\uC774 \uACB0\uC81C \uB9C1\uD06C\uB97C \uBE44\uD65C\uC131\uD654\uD569\uB2C8\uB2E4.",
  disableConfirm: "\uBE44\uD65C\uC131\uD654",
  disableTextPrefix: "",
  disableTextSuffix:
    " \uB9C1\uD06C\uB97C \uBE44\uD65C\uC131\uD654\uD569\uB2C8\uB2E4. \uC774\uBBF8 \uC804\uC1A1\uB41C \uB9C1\uD06C\uB85C\uB294 \uB354 \uC774\uC0C1 \uACB0\uC81C\uD560 \uC218 \uC5C6\uAC8C \uB429\uB2C8\uB2E4.",
  unlimited: "\uBB34\uC81C\uD55C",
} as const;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: TEXT.active,
  EXPIRED: TEXT.expired,
  DISABLED: TEXT.disabled,
  USED_UP: TEXT.usedUp,
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  EXPIRED: "border-slate/20 bg-slate/10 text-slate",
  DISABLED: "border-red-200 bg-red-50 text-red-700",
  USED_UP: "border-amber-200 bg-amber-50 text-amber-700",
};

const EXPIRY_PRESETS = [
  { label: TEXT.hours24, hours: 24 },
  { label: TEXT.hours48, hours: 48 },
  { label: TEXT.hours72, hours: 72 },
  { label: TEXT.week1, hours: 168 },
  { label: TEXT.customDate, hours: 0 },
];

function addHoursToNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().split("T")[0];
}

function todayPlusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const EMPTY_FORM: LinkForm = {
  title: "",
  courseId: "",
  amount: "",
  discountAmount: "0",
  allowPoint: true,
  expiresAt: todayPlusDays(7),
  expiryPreset: "168",
  maxUsage: "",
  note: "",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

function formatRelativeTime(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (diff < 0) return TEXT.expiredSoon;
  if (hours < 1) return `${minutes}${TEXT.expireInMinutes}`;
  if (hours < 24) return `${hours}${TEXT.expireInHours}`;
  const days = Math.floor(hours / 24);
  return `${days}${TEXT.expireInDays}`;
}

type KpiCardProps = {
  label: string;
  value: number;
  color?: string;
  badge?: string;
};

function KpiCard({ label, value, color = "text-ink", badge }: KpiCardProps) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium text-slate">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
        {badge ? (
          <span className="mb-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentLinkManager({ initialLinks, courses, initialStats }: Props) {
  const [links, setLinks] = useState<PaymentLinkRow[]>(initialLinks);
  const [stats, setStats] = useState<LinkStats>(initialStats);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [disableOpen, setDisableOpen] = useState<boolean>(false);
  const [targetLink, setTargetLink] = useState<PaymentLinkRow | null>(null);

  function recomputeStats(updatedLinks: PaymentLinkRow[]): LinkStats {
    const now = new Date();
    return {
      total: updatedLinks.length,
      active: updatedLinks.filter((l) => l.status === "ACTIVE" && !l.isExpired).length,
      paid: updatedLinks.reduce((sum, l) => sum + l._count.payments, 0),
      expired: updatedLinks.filter((l) => l.status === "EXPIRED" || (l.status === "ACTIVE" && l.isExpired)).length,
      disabled: updatedLinks.filter((l) => l.status === "DISABLED").length,
      usedUp: updatedLinks.filter((l) => l.status === "USED_UP").length,
      expiringSoon: updatedLinks.filter(
        (l) =>
          l.status === "ACTIVE" &&
          !l.isExpired &&
          new Date(l.expiresAt) < new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ).length,
    };
  }

  function handleCourseChange(courseId: string) {
    const course = courses.find((c) => String(c.id) === courseId);
    setForm((f) => ({
      ...f,
      courseId,
      amount: course ? String(course.tuitionFee) : f.amount,
    }));
  }

  function handleExpiryPreset(preset: string) {
    const hours = Number(preset);
    setForm((f) => ({
      ...f,
      expiryPreset: preset,
      expiresAt: hours > 0 ? addHoursToNow(hours) : f.expiresAt,
    }));
  }

  function handleCreate() {
    setError("");
    startTransition(async () => {
      try {
        const payload = {
          title: form.title.trim(),
          courseId: form.courseId ? Number(form.courseId) : undefined,
          amount: Number(form.amount),
          discountAmount: Number(form.discountAmount) || 0,
          allowPoint: form.allowPoint,
          expiresAt: new Date(form.expiresAt + "T23:59:59").toISOString(),
          maxUsage: form.maxUsage ? Number(form.maxUsage) : undefined,
          note: form.note.trim() || undefined,
        };
        const data = await requestJson<{ link: PaymentLinkRow }>("/api/payment-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const newLink: PaymentLinkRow = {
          ...data.link,
          isExpired: false,
          isExpiringSoon: false,
        };
        const updated = [newLink, ...links];
        setLinks(updated);
        setStats(recomputeStats(updated));
        setForm(EMPTY_FORM);
        setCreateOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : TEXT.createFailed);
      }
    });
  }

  function handleDisable() {
    if (!targetLink) return;
    startTransition(async () => {
      try {
        await requestJson(`/api/payment-links/${targetLink.id}`, { method: "DELETE" });
        const updated = links.map((l) =>
          l.id === targetLink.id ? { ...l, status: "DISABLED" as const } : l,
        );
        setLinks(updated);
        setStats(recomputeStats(updated));
        setDisableOpen(false);
        setTargetLink(null);
      } catch {
        // ignore
      }
    });
  }

  function handleCopy(link: PaymentLinkRow) {
    const url = `${getBaseUrl()}/pay/${link.token}`;
    copyToClipboard(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const finalAmount = Math.max(0, (Number(form.amount) || 0) - (Number(form.discountAmount) || 0));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label={TEXT.totalLinks} value={stats.total} />
        <KpiCard
          label={TEXT.activeLinks}
          value={stats.active}
          color="text-forest"
          badge={stats.expiringSoon > 0 ? `${stats.expiringSoon}\uAC74 \uC784\uBC15` : undefined}
        />
        <KpiCard label={TEXT.paidCount} value={stats.paid} color="text-ember" />
        <KpiCard label={TEXT.expiredCount} value={stats.expired} color="text-slate" />
        <KpiCard label={TEXT.disabledCount} value={stats.disabled} color="text-red-600" />
      </div>

      {stats.expiringSoon > 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-semibold text-amber-800">
            {TEXT.expiringSoonBanner} {stats.expiringSoon}\uAC74
          </span>
          <span className="text-xs text-amber-700">{TEXT.expiringSoonHint}</span>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate">
          {links.length}
          {TEXT.linkCountSuffix}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/payment-links/bulk"
            className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30 hover:text-ember"
          >
            {TEXT.bulkCreate}
          </Link>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setError("");
              setCreateOpen(true);
            }}
            className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            {TEXT.createLink}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead>
            <tr>
              {[
                TEXT.headingTitleCourse,
                TEXT.headingAmount,
                TEXT.headingExpiresAt,
                TEXT.headingUsage,
                TEXT.headingStatus,
                TEXT.headingCreatedBy,
                TEXT.headingActions,
              ].map((heading) => (
                <th
                  key={heading}
                  className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {links.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate">
                  {TEXT.noLinks}
                </td>
              </tr>
            ) : (
              links.map((link) => {
                const displayStatus =
                  link.status === "ACTIVE" && link.isExpired ? "EXPIRED" : link.status;
                const isExpiringSoon = link.isExpiringSoon;

                return (
                  <tr
                    key={link.id}
                    className={`hover:bg-mist/30 ${isExpiringSoon ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/payment-links/${link.id}`}
                        className="font-medium text-ink transition hover:text-ember"
                      >
                        {link.title}
                      </Link>
                      {link.course ? <p className="mt-0.5 text-xs text-slate">{link.course.name}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <p className="font-semibold text-ink">{link.finalAmount.toLocaleString()}\uC6D0</p>
                      {link.discountAmount > 0 ? (
                        <p className="text-xs text-slate">
                          -{link.discountAmount.toLocaleString()}
                          {TEXT.discountSuffix}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <p className="text-slate">{link.expiresAt.split("T")[0].replace(/-/g, ".")}</p>
                      {isExpiringSoon ? (
                        <p className="mt-0.5 font-semibold text-amber-700">
                          {formatRelativeTime(link.expiresAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-xs text-slate">
                      {link._count.payments}
                      {link.maxUsage != null ? ` / ${link.maxUsage}` : ""}
                      {" "}
                      {TEXT.useCount}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          STATUS_COLOR[displayStatus] ?? STATUS_COLOR.ACTIVE
                        }`}
                      >
                        {STATUS_LABEL[displayStatus] ?? displayStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">{link.staff.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(link)}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          {copiedId === link.id ? TEXT.copied : TEXT.copyLink}
                        </button>
                        <a
                          href={`/pay/${link.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          {TEXT.preview}
                        </a>
                        <Link
                          href={`/admin/payment-links/${link.id}`}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          {TEXT.detail}
                        </Link>
                        {link.status === "ACTIVE" && !link.isExpired ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetLink(link);
                              setDisableOpen(true);
                            }}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            {TEXT.disable}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ActionModal
        open={createOpen}
        badgeLabel={TEXT.badge}
        title={TEXT.createTitle}
        description={TEXT.createDescription}
        confirmLabel={TEXT.createConfirm}
        cancelLabel={TEXT.cancel}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        isPending={isPending}
        panelClassName="max-w-lg"
      >
        <div className="space-y-4">
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">
              {TEXT.titleLabel}
              <span className="text-red-500">{TEXT.requiredMark}</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={TEXT.titlePlaceholder}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60 focus:ring-1 focus:ring-ember/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">{TEXT.courseLabel}</label>
            <select
              value={form.courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            >
              <option value="">{TEXT.noCourse}</option>
              {courses.map((course) => (
                <option key={course.id} value={String(course.id)}>
                  {course.name} ({course.tuitionFee.toLocaleString()}\uC6D0)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                {TEXT.amountLabel}
                <span className="text-red-500">{TEXT.requiredMark}</span>
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                min={0}
                placeholder="600000"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">{TEXT.discountLabel}</label>
              <input
                type="number"
                value={form.discountAmount}
                onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
                min={0}
                placeholder="0"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
              />
            </div>
          </div>

          {form.amount ? (
            <div className="rounded-2xl border border-forest/15 bg-forest/5 px-4 py-2.5">
              <p className="text-sm font-semibold text-forest">
                {TEXT.finalAmount}: {finalAmount.toLocaleString()}\uC6D0
              </p>
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">
              {TEXT.expiresLabel}
              <span className="text-red-500">{TEXT.requiredMark}</span>
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {EXPIRY_PRESETS.map((preset) => (
                <button
                  key={preset.hours}
                  type="button"
                  onClick={() => handleExpiryPreset(String(preset.hours))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    form.expiryPreset === String(preset.hours)
                      ? "border-ember/40 bg-ember/10 text-ember"
                      : "border-ink/15 text-ink hover:border-ink/30"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value, expiryPreset: "0" }))}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">{TEXT.maxUsageLabel}</label>
            <input
              type="number"
              value={form.maxUsage}
              onChange={(e) => setForm((f) => ({ ...f, maxUsage: e.target.value }))}
              min={1}
              placeholder={TEXT.unlimitedPlaceholder}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowPoint}
              onChange={(e) => setForm((f) => ({ ...f, allowPoint: e.target.checked }))}
              className="h-4 w-4 rounded border-ink/20 text-ember"
            />
            <span className="text-sm text-ink">{TEXT.allowPoint}</span>
          </label>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">{TEXT.noteLabel}</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder={TEXT.notePlaceholder}
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember/60"
            />
          </div>
        </div>
      </ActionModal>

      <ActionModal
        open={disableOpen}
        badgeLabel={TEXT.badge}
        title={TEXT.disableTitle}
        description={TEXT.disableDescription}
        confirmLabel={TEXT.disableConfirm}
        cancelLabel={TEXT.cancel}
        confirmTone="danger"
        onClose={() => setDisableOpen(false)}
        onConfirm={handleDisable}
        isPending={isPending}
      >
        <p className="text-sm text-slate">
          <span className="font-semibold text-ink">{targetLink?.title}</span>
          {TEXT.disableTextSuffix}
        </p>
      </ActionModal>
    </>
  );
}
