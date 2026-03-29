import Link from "next/link";
import type { Metadata } from "next";
import type { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "교재 안내",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchTextbookData(examNumber: string) {
  const prisma = getPrisma();

  const [textbooks, textbookSales] = await Promise.all([
    // All active textbooks
    prisma.textbook.findMany({
      where: { isActive: true },
      orderBy: [{ subject: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        author: true,
        publisher: true,
        price: true,
        stock: true,
        subject: true,
      },
    }),

    // Textbook purchase history for this student
    prisma.textbookSale.findMany({
      where: { examNumber },
      orderBy: { soldAt: "desc" },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        note: true,
        soldAt: true,
        textbook: {
          select: {
            id: true,
            title: true,
            author: true,
            subject: true,
          },
        },
      },
    }),
  ]);

  // Group textbooks by subject
  const grouped = new Map<string, typeof textbooks>();

  for (const tb of textbooks) {
    const key = tb.subject ? (SUBJECT_LABEL[tb.subject] ?? tb.subject) : "일반·기타";
    const existing = grouped.get(key) ?? [];
    existing.push(tb);
    grouped.set(key, existing);
  }

  // Ensure "일반·기타" comes last
  const sortedGroups: Array<{ label: string; books: typeof textbooks }> = [];
  let generalGroup: { label: string; books: typeof textbooks } | null = null;

  for (const [label, books] of grouped.entries()) {
    if (label === "일반·기타") {
      generalGroup = { label, books };
    } else {
      sortedGroups.push({ label, books });
    }
  }
  if (generalGroup) sortedGroups.push(generalGroup);

  return { sortedGroups, textbookSales };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentTextbooksPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Textbooks Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            교재 안내는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Textbooks
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            교재 안내
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            로그인하면 교재 목록과 구매 이력을 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/textbooks" />
      </main>
    );
  }

  const [{ sortedGroups, textbookSales }, branding] = await Promise.all([
    fetchTextbookData(viewer.examNumber),
    getAcademyRuntimeBranding(viewer.academyId ?? undefined),
  ]);

  return (
    <main className="space-y-4 px-0 py-6">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Textbooks
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">교재 안내</h1>
            <p className="mt-2 text-xs leading-6 text-slate">
              교재 구매는 학원 창구에서 진행합니다.
            </p>
          </div>
          <Link
            href="/student"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            포털로 돌아가기
          </Link>
        </div>

        {/* Contact info */}
        <div className="mt-4 rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3">
          <p className="text-xs font-semibold text-ember">교재 문의</p>
          <p className="mt-1 text-sm text-ink">
            <span className="font-semibold">{branding.phone ?? "학원 문의"}</span>
            <span className="ml-2 text-xs text-slate">{branding.academyName} (평일 09~21시 / 주말 09~18시)</span>
          </p>
        </div>
      </section>

      {/* Textbook catalog grouped by subject */}
      {sortedGroups.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">교재 목록</p>
          <div className="mt-4 space-y-6">
            {sortedGroups.map(({ label, books }) => (
              <div key={label}>
                <h2 className="mb-3 text-sm font-bold text-ink">{label}</h2>
                <ul className="space-y-3">
                  {books.map((book) => (
                    <li
                      key={book.id}
                      className="flex items-start justify-between gap-3 rounded-2xl bg-mist px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-snug">{book.title}</p>
                        {(book.author || book.publisher) && (
                          <p className="mt-0.5 truncate text-xs text-slate">
                            {[book.author, book.publisher].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          {book.stock > 0 ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              재고 있음
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              품절
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-ember">{formatAmount(book.price)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">교재 목록</p>
          <p className="mt-4 text-sm text-slate">현재 등록된 교재가 없습니다.</p>
        </section>
      )}

      {/* Purchase history */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">내 교재 구매 이력</p>
        {textbookSales.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {textbookSales.map((sale) => (
              <li
                key={sale.id}
                className="flex items-start justify-between gap-3 rounded-2xl bg-mist px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-snug">
                    {sale.textbook.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate">
                    {sale.quantity > 1 && `${sale.quantity}권 · `}
                    {formatDateKR(sale.soldAt)}
                  </p>
                  {sale.note && (
                    <p className="mt-0.5 truncate text-xs text-slate">{sale.note}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">{formatAmount(sale.totalPrice)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate">교재 구매 이력이 없습니다.</p>
        )}
      </section>

      {/* Info note */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">안내 사항</p>
        <ul className="mt-3 space-y-2 text-sm text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">•</span>
            교재 구매는 학원 창구에서만 가능합니다.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">•</span>
            교재 재고 및 가격은 사전 공지 없이 변경될 수 있습니다.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-ember">•</span>
            구매 후 환불은 학원 창구에 문의해 주세요.
          </li>
        </ul>
      </section>
    </main>
  );
}
