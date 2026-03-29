import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AbsenceNoteActions } from "./absence-note-actions";
import { AbsenceNotePrintButton } from "./print-button";
import { ABSENCE_CATEGORY_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const NOTE_STATUS_LABEL = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
} as const;

const NOTE_STATUS_CLASS = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-0">
      <dt className="w-44 shrink-0 text-sm font-medium text-slate">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function AbsenceNoteDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const noteId = Number(id);

  if (!Number.isInteger(noteId) || noteId <= 0) {
    notFound();
  }

  const note = await getPrisma().absenceNote.findUnique({
    where: { id: noteId },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
      session: {
        include: {
          period: {
            select: { id: true, name: true },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!note) notFound();

  const examDate = note.session.examDate;
  const subjectLabel =
    (SUBJECT_LABEL as Record<string, string>)[note.session.subject] ?? note.session.subject;
  const statusClass = NOTE_STATUS_CLASS[note.status];
  const statusLabel = NOTE_STATUS_LABEL[note.status];

  return (
    <div className="p-8 sm:p-10">
      <div className="no-print">
        <Breadcrumbs
          items={[
            { label: "학사 관리", href: "/admin/absence-notes" },
            { label: "사유서 관리", href: "/admin/absence-notes" },
            { label: `사유서 #${note.id}` },
          ]}
        />
      </div>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            결석계 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">
            {note.student.name}
            <span className="ml-3 text-lg font-normal text-slate">
              {formatDate(examDate)} · {subjectLabel}
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate">
            학번 {note.examNumber} · {note.session.period.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AbsenceNotePrintButton />
          <Link
            href="/admin/absence-notes"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/20 hover:bg-mist no-print"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Print-only header — hidden on screen */}
      <div className="hidden print:block mb-6 border-b-2 border-ink pb-4">
        <div className="text-xl font-bold text-center">학원명 미설정</div>
        <div className="text-lg font-semibold text-center mt-1">결석계</div>
        <div className="mt-2 text-center text-sm text-slate">
          {note.student.name} ({note.examNumber}) · {formatDate(examDate)} · {subjectLabel}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Student info card */}
          <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">학생 정보</h2>
            </div>
            <dl className="divide-y divide-ink/10">
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">학번</dt>
                <dd className="text-sm text-ink">
                  <Link
                    href={`/admin/students/${note.examNumber}`}
                    className="font-semibold text-ember hover:underline"
                  >
                    {note.examNumber}
                  </Link>
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">이름</dt>
                <dd className="text-sm font-semibold text-ink">
                  <Link
                    href={`/admin/students/${note.examNumber}`}
                    className="transition hover:text-ember"
                  >
                    {note.student.name}
                  </Link>
                </dd>
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 px-6 py-4">
                <dt className="self-start pt-0.5 text-sm font-medium text-slate">연락처</dt>
                <dd className="text-sm text-ink">{note.student.phone ?? "-"}</dd>
              </div>
            </dl>
          </section>

          {/* Absence note details card */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold text-ink">사유서 정보</h2>

            <dl className="mt-5 flex flex-col gap-4">
              <InfoRow label="상태">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </InfoRow>

              <InfoRow label="사유 유형">
                {note.absenceCategory ? (
                  ABSENCE_CATEGORY_LABEL[note.absenceCategory]
                ) : (
                  <span className="text-slate">미분류</span>
                )}
              </InfoRow>

              <InfoRow label="사유 내용">
                <p className="whitespace-pre-wrap leading-6">{note.reason}</p>
              </InfoRow>

              <InfoRow label="시험 날짜">
                <span>
                  {formatDate(examDate)}
                  <span className="ml-2 text-slate">
                    ({["일", "월", "화", "수", "목", "금", "토"][examDate.getDay()]})
                  </span>
                </span>
              </InfoRow>

              <InfoRow label="시험 과목">{subjectLabel}</InfoRow>

              <InfoRow label="기수 / 기간">{note.session.period.name}</InfoRow>

              <InfoRow label="출석 처리">
                <span className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      note.attendCountsAsAttendance
                        ? "bg-green-100 text-green-700"
                        : "bg-ink/5 text-slate"
                    }`}
                  >
                    {note.attendCountsAsAttendance ? "출석 인정" : "출석 미인정"}
                  </span>
                  {note.attendGrantsPerfectAttendance && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                      개근 인정
                    </span>
                  )}
                </span>
              </InfoRow>

              <InfoRow label="제출일">
                {note.submittedAt ? (
                  formatDateTime(note.submittedAt)
                ) : (
                  <span className="text-slate">-</span>
                )}
              </InfoRow>

              <InfoRow label="처리일 (승인)">
                {note.approvedAt ? (
                  formatDateTime(note.approvedAt)
                ) : (
                  <span className="text-slate">-</span>
                )}
              </InfoRow>

              <InfoRow label="최종 수정">
                {formatDateTime(note.updatedAt)}
              </InfoRow>

              {note.adminNote && (
                <InfoRow label="처리 메모">
                  <p className="whitespace-pre-wrap leading-6 text-slate">{note.adminNote}</p>
                </InfoRow>
              )}
            </dl>
          </section>

          {/* Attachments card */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold text-ink">
              첨부 파일
              <span className="ml-2 text-sm font-normal text-slate">
                {note.attachments.length}개
              </span>
            </h2>

            {note.attachments.length === 0 ? (
              <p className="mt-4 text-sm text-slate">첨부 파일이 없습니다.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {note.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between rounded-2xl border border-ink/10 bg-mist px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {att.originalFileName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate">
                        {formatBytes(att.byteSize)} · {formatDate(att.createdAt)}
                      </p>
                    </div>
                    <a
                      href={`/api/absence-notes/${note.id}/attachments/${att.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 inline-flex shrink-0 items-center rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                    >
                      다운로드
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Signature section — print only */}
          <div className="hidden print:flex mt-12 justify-between">
            <div className="text-center">
              <div className="text-sm text-slate">신청자 서명</div>
              <div className="mt-8 border-b border-ink w-32"></div>
            </div>
            <div className="text-center">
              <div className="text-sm text-slate">담당자 확인</div>
              <div className="mt-8 border-b border-ink w-32"></div>
            </div>
            <div className="text-center">
              <div className="text-sm text-slate">원장 결재</div>
              <div className="mt-8 border-b border-ink w-32"></div>
            </div>
          </div>
        </div>

        {/* Right column: actions + quick links */}
        <aside className="flex flex-col gap-6 xl:sticky xl:top-6 self-start no-print">
          {/* Action buttons (client component) */}
          <AbsenceNoteActions noteId={note.id} status={note.status} />

          {/* Quick link to student */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold text-ink">학생 바로가기</h2>
            <p className="mt-2 text-sm text-slate">
              {note.student.name} · {note.examNumber}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/admin/students/${note.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-mist px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                학생 상세 페이지
              </Link>
              <Link
                href={`/admin/absence-notes?search=${note.examNumber}`}
                className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-mist px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                이 학생 사유서 조회
              </Link>
            </div>
          </section>

          {/* Record metadata */}
          <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <h2 className="text-base font-semibold text-ink">기록 정보</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-xs font-medium text-slate">사유서 ID</dt>
                <dd className="mt-0.5 text-sm text-ink">#{note.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">최초 등록</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {note.createdAt.toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">마지막 수정</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {note.updatedAt.toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
