import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StudentBulkOperationsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalStudents, activeStudents, newThisMonth, duplicateSuspects] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { isActive: true } }),
    prisma.student.count({ where: { createdAt: { gte: startOfMonth } } }),
    // Students sharing same name + same birth year as another student
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT "name",
               EXTRACT(YEAR FROM "birthDate") AS birth_year
        FROM students
        WHERE "birthDate" IS NOT NULL
        GROUP BY "name", EXTRACT(YEAR FROM "birthDate")
        HAVING COUNT(*) > 1
      ) AS dupes
    `,
  ]);

  const duplicateCount = Number(duplicateSuspects[0]?.cnt ?? 0);

  const kpis = [
    { label: "전체 학생", value: totalStudents, unit: "명" },
    { label: "활성 학생", value: activeStudents, unit: "명" },
    { label: "이번 달 신규", value: newThisMonth, unit: "명" },
    { label: "중복 의심", value: duplicateCount, unit: "명" },
  ];

  type Card = {
    title: string;
    description: string;
    href: string;
    label: string;
    icon: React.ReactNode;
  };

  const importCards: Card[] = [
    {
      title: "CSV 가져오기",
      description: "Excel/CSV 파일을 업로드하여 학생 데이터를 일괄 등록합니다.",
      href: "/admin/students/import",
      label: "CSV 가져오기 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      title: "붙여넣기 가져오기",
      description: "클립보드에서 학생 데이터를 붙여넣어 빠르게 등록합니다.",
      href: "/admin/students/paste-import",
      label: "붙여넣기 가져오기 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
    },
  ];

  const exportCards: Card[] = [
    {
      title: "학생 명단 내보내기",
      description: "필터 조건에 맞는 학생 목록을 Excel/CSV로 다운로드합니다.",
      href: "/admin/export",
      label: "내보내기 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      ),
    },
    {
      title: "수강생 내보내기",
      description: "수강 상태별 수강생 목록을 Excel로 다운로드합니다.",
      href: "/admin/export",
      label: "수강생 내보내기 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
  ];

  const editCards: Card[] = [
    {
      title: "중복 학생 병합",
      description: "동일 학생이 중복 등록된 레코드를 찾아 하나로 병합합니다.",
      href: "/admin/students/merge",
      label: "병합 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: "일괄 비활성화",
      description: "수강이 없는 학생을 기준으로 일괄 비활성화 처리합니다.",
      href: "/admin/students/bulk-archive",
      label: "일괄 비활성화 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
          />
        </svg>
      ),
    },
    {
      title: "수험번호 이전",
      description: "잘못 등록된 수험번호를 새 번호로 이전하고 이력을 함께 이동합니다.",
      href: "/admin/students/transfer",
      label: "수험번호 이전 →",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      ),
    },
  ];

  function OpCard({ card }: { card: Card }) {
    return (
      <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm transition hover:border-ember/20 hover:shadow-md">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-ember/20 bg-ember/10 text-ember">
            {card.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-ink">{card.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate">{card.description}</p>
          </div>
        </div>
        <div className="mt-5">
          <Link
            href={card.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            {card.label}
          </Link>
        </div>
      </article>
    );
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Bulk Operations
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">학생 일괄 작업</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            학생 데이터 가져오기·내보내기, 중복 병합, 일괄 비활성화 등 일괄 작업 메뉴를 한곳에서 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ember/30 hover:text-ember"
        >
          ← 학생 목록
        </Link>
      </div>

      {/* KPI Row */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate">{kpi.label}</p>
            <p className="mt-3 text-2xl font-semibold text-ink">
              {kpi.value.toLocaleString("ko-KR")}
              <span className="ml-1 text-base font-normal text-slate">{kpi.unit}</span>
            </p>
          </article>
        ))}
      </section>

      {/* Import Section */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">데이터 가져오기</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {importCards.map((card) => (
            <OpCard key={card.href + card.title} card={card} />
          ))}
        </div>
      </section>

      {/* Export Section */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">데이터 내보내기</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {exportCards.map((card) => (
            <OpCard key={card.href + card.title} card={card} />
          ))}
        </div>
      </section>

      {/* Edit Section */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">일괄 수정</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {editCards.map((card) => (
            <OpCard key={card.href + card.title} card={card} />
          ))}
        </div>
      </section>
    </div>
  );
}
