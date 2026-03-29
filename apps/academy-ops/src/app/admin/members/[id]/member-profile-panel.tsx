"use client";

import { type FormEvent, useEffect, useState } from "react";
import type {
  MemberProfileEnrollSource,
  MemberProfileStatus,
  MemberProfileView,
  MemberSummary,
} from "@/lib/members/profile";

type MemberProfilePanelProps = {
  examNumber: string;
};

type FormState = {
  birthDate: string;
  address: string;
  photoUrl: string;
  enrollSource: MemberProfileEnrollSource | "";
  status: MemberProfileStatus;
  withdrawReason: string;
};

const TEXT = {
  memberProfile: "\uD68C\uC6D0 \uD504\uB85C\uD544",
  visit: "\uBC29\uBB38",
  phone: "\uC804\uD654",
  online: "\uC628\uB77C\uC778",
  referral: "\uC18C\uAC1C",
  other: "\uAE30\uD0C0",
  active: "\uD65C\uC131",
  suspended: "\uC77C\uC2DC\uC911\uC9C0",
  withdrawn: "\uD0C8\uD1F4",
  graduated: "\uC878\uC5C5",
  noEnrollments: "\uC218\uAC15 \uC774\uB825 \uC5C6\uC74C",
  dotJoin: " \u00B7 ",
  loadFailed: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  saveFailed: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  saved: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.",
  description: "\uD68C\uC6D0 \uB9C8\uC2A4\uD130 \uCD5C\uC18C \uD544\uB4DC\uC640 \uD559\uC0DD 4\uB300 \uB370\uC774\uD130\uB97C \uD568\uAED8 \uBCF4\uC5EC\uC8FC\uB294 \uC6B4\uC601 \uD328\uB110\uC785\uB2C8\uB2E4.",
  loading: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.",
  readOnly: "\uD68C\uC6D0 \uD504\uB85C\uD544 \uD14C\uC774\uBE14\uC774 \uC544\uC9C1 \uC900\uBE44\uB418\uC9C0 \uC54A\uC544 \uC77D\uAE30 \uC804\uC6A9\uC73C\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uB9C8\uC774\uADF8\uB808\uC774\uC158 \uC801\uC6A9 \uD6C4 \uC800\uC7A5\uC774 \uD65C\uC131\uD654\uB429\uB2C8\uB2E4.",
  name: "\uC774\uB984",
  mobile: "\uC5F0\uB77D\uCC98",
  enrollments: "\uC218\uAC15 \uC774\uB825",
  summary4: "4\uB300 \uB370\uC774\uD130 \uC694\uC57D",
  profileEdit: "\uD504\uB85C\uD544 \uD3B8\uC9D1",
  profileEditHint: "\uC0DD\uB144\uC6D4\uC77C\uACFC \uC8FC\uC18C\uB294 \uD559\uC0DD \uAE30\uBCF8 \uC815\uBCF4\uC640 \uAC19\uC740 \uAC12\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
  save: "\uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911...",
  birthDate: "\uC0DD\uB144\uC6D4\uC77C",
  address: "\uC8FC\uC18C",
  photoUrl: "\uC0AC\uC9C4 URL",
  enrollSource: "\uB4F1\uB85D \uACBD\uB85C",
  memberStatus: "\uD68C\uC6D0 \uC0C1\uD0DC",
  withdrawReason: "\uD0C8\uD1F4 \uC0AC\uC720",
  noSelection: "\uC120\uD0DD \uC548 \uD568",
  addressPlaceholder: "\uC8FC\uC18C\uB97C \uC785\uB825\uD558\uC138\uC694",
  withdrawPlaceholder: "\uD544\uC694\uD560 \uB54C\uB9CC \uAE30\uB85D\uD558\uC138\uC694",
} as const;

const ENROLL_SOURCE_OPTIONS: Array<{ value: MemberProfileEnrollSource; label: string }> = [
  { value: "VISIT", label: TEXT.visit },
  { value: "PHONE", label: TEXT.phone },
  { value: "ONLINE", label: TEXT.online },
  { value: "REFERRAL", label: TEXT.referral },
  { value: "SNS", label: "SNS" },
  { value: "OTHER", label: TEXT.other },
];

const MEMBER_STATUS_OPTIONS: Array<{ value: MemberProfileStatus; label: string }> = [
  { value: "ACTIVE", label: TEXT.active },
  { value: "SUSPENDED", label: TEXT.suspended },
  { value: "WITHDRAWN", label: TEXT.withdrawn },
  { value: "GRADUATED", label: TEXT.graduated },
];

function emptyForm(): FormState {
  return {
    birthDate: "",
    address: "",
    photoUrl: "",
    enrollSource: "",
    status: "ACTIVE",
    withdrawReason: "",
  };
}

function toForm(profile: MemberProfileView["profile"]): FormState {
  if (!profile) {
    return emptyForm();
  }

  return {
    birthDate: profile.birthDate ?? "",
    address: profile.address ?? "",
    photoUrl: profile.photoUrl ?? "",
    enrollSource: profile.enrollSource ?? "",
    status: profile.status,
    withdrawReason: profile.withdrawReason ?? "",
  };
}

function formatEnrollmentLabel(summary: MemberSummary) {
  if (summary.enrollments.length === 0) {
    return TEXT.noEnrollments;
  }

  return summary.enrollments.map((enrollment) => enrollment.label).join(TEXT.dotJoin);
}

export function MemberProfilePanel({ examNumber }: MemberProfilePanelProps) {
  const [view, setView] = useState<MemberProfileView | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(`/api/members/${encodeURIComponent(examNumber)}/profile`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await response.json()) as { data?: MemberProfileView; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? TEXT.loadFailed);
        }

        if (ignore) {
          return;
        }

        const nextView = payload.data ?? null;
        setView(nextView);
        setForm(toForm(nextView?.profile ?? null));
      } catch (fetchError) {
        if (ignore || (fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          return;
        }

        setView(null);
        setError(fetchError instanceof Error ? fetchError.message : TEXT.loadFailed);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [examNumber]);

  const student = view?.student ?? null;
  const ready = Boolean(view?.ready);
  const canEdit = ready && Boolean(student);
  const enrollmentSummary = student ? formatEnrollmentLabel(student) : "-";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student || !canEdit) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/members/${encodeURIComponent(examNumber)}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          birthDate: form.birthDate || null,
          address: form.address,
          photoUrl: form.photoUrl,
          enrollSource: form.enrollSource || null,
          status: form.status,
          withdrawReason: form.withdrawReason,
        }),
      });

      const payload = (await response.json()) as { data?: MemberProfileView; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? TEXT.saveFailed);
      }

      const nextView = payload.data ?? null;
      setView(nextView);
      setForm(toForm(nextView?.profile ?? null));
      setNotice(TEXT.saved);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : TEXT.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-forest">MemberProfile</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{TEXT.memberProfile}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">{TEXT.description}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-ink/5 px-4 py-3 text-right text-sm text-slate">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate">Exam Number</p>
          <p className="mt-1 text-base font-semibold text-ink">{examNumber}</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink/15 bg-ink/5 px-5 py-8 text-sm text-slate">
          {TEXT.loading}
        </div>
      ) : null}

      {!loading && error ? (
        <div
          aria-live="polite"
          className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700"
        >
          {error}
        </div>
      ) : null}

      {!loading && notice ? (
        <div
          aria-live="polite"
          className="mt-6 rounded-2xl border border-forest/20 bg-forest/5 px-5 py-4 text-sm leading-7 text-forest"
        >
          {notice}
        </div>
      ) : null}

      {!loading && student && !ready ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800">
          {TEXT.readOnly}
        </div>
      ) : null}

      {!loading && student ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[24px] border border-ink/10 bg-sand/30 p-5">
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate">{TEXT.name}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{student.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate">{TEXT.mobile}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{student.mobile ?? "-"}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate">{TEXT.enrollments}</p>
              <p className="mt-1 text-sm leading-7 text-slate">{enrollmentSummary}</p>
            </div>
            <div className="mt-4 rounded-2xl border border-ink/10 bg-white/90 px-4 py-3 text-sm text-slate">
              <p className="font-medium text-ink">{TEXT.summary4}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-slate">examNumber</dt>
                  <dd className="mt-1 font-semibold text-ink">{student.examNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-slate">name</dt>
                  <dd className="mt-1 font-semibold text-ink">{student.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-slate">mobile</dt>
                  <dd className="mt-1 font-semibold text-ink">{student.mobile ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-slate">enrollments</dt>
                  <dd className="mt-1 font-semibold text-ink">{student.enrollments.length}</dd>
                </div>
              </dl>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{TEXT.profileEdit}</p>
                <p className="mt-1 text-xs leading-6 text-slate">{TEXT.profileEditHint}</p>
              </div>
              <button
                type="submit"
                disabled={!canEdit || saving}
                className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:bg-slate/40"
              >
                {saving ? TEXT.saving : TEXT.save}
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.birthDate}</span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                  disabled={!canEdit || saving}
                  className="rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.address}</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  disabled={!canEdit || saving}
                  className="rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                  placeholder={TEXT.addressPlaceholder}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.photoUrl}</span>
                <input
                  type="url"
                  value={form.photoUrl}
                  onChange={(event) => setForm((current) => ({ ...current, photoUrl: event.target.value }))}
                  disabled={!canEdit || saving}
                  className="rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                  placeholder="https://..."
                />
              </label>

              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.enrollSource}</span>
                <select
                  value={form.enrollSource}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      enrollSource: event.target.value as MemberProfileEnrollSource | "",
                    }))
                  }
                  disabled={!canEdit || saving}
                  className="rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                >
                  <option value="">{TEXT.noSelection}</option>
                  {ENROLL_SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.memberStatus}</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as MemberProfileStatus,
                    }))
                  }
                  disabled={!canEdit || saving}
                  className="rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                >
                  {MEMBER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate">
                <span>{TEXT.withdrawReason}</span>
                <textarea
                  value={form.withdrawReason}
                  onChange={(event) => setForm((current) => ({ ...current, withdrawReason: event.target.value }))}
                  disabled={!canEdit || saving}
                  className="min-h-[120px] rounded-2xl border border-ink/10 px-4 py-3 text-ink outline-none transition focus:border-forest disabled:bg-ink/5"
                  placeholder={TEXT.withdrawPlaceholder}
                />
              </label>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}