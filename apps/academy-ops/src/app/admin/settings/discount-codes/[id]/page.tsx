import Link from "next/link";
import { AdminRole, DiscountType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  RATE: "비율(%)",
  FIXED: "정액(원)",
};

function formatKRW(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DiscountCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 할인 코드 상세
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">할인 코드 상세</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          할인 코드 상세는 특정 지점을 선택한 상태에서만 열 수 있습니다. 상단 지점 전환기에서 먼저 지점을 선택해 주세요.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/admin/settings/discount-codes" className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30">
            할인 코드 관리로 이동
          </Link>
        </div>
      </div>
    );
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const [academy, code] = await Promise.all([
    getAcademyById(visibleAcademyId),
    getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ id }, visibleAcademyId),
      include: {
        staff: { select: { name: true } },
        usages: {
          orderBy: { usedAt: "desc" },
          include: {
            student: { select: { examNumber: true, name: true, phone: true } },
            payment: {
              select: {
                id: true,
                discountAmount: true,
                netAmount: true,
                createdAt: true,
                enrollmentId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!code) {
    notFound();
  }

  const discountDisplay =
    code.discountType === DiscountType.RATE ? `${code.discountValue}%` : formatKRW(code.discountValue);
  const usageRate = code.maxUsage != null ? Math.round((code.usageCount / code.maxUsage) * 100) : null;
  const totalDiscountGiven = code.usages.reduce((sum, usage) => sum + (usage.payment?.discountAmount ?? 0), 0);
  const isExpired = code.validUntil != null && new Date(code.validUntil) < new Date();

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/discount-codes" className="hover:text-ember transition">
          할인 코드 관리
        </Link>
        <span>/</span>
        <span className="font-mono font-semibold text-ink">{code.code}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            설정 · 할인 코드 상세
          </div>
          <h1 className="mt-3 text-3xl font-semibold font-mono text-ink">{code.code}</h1>
          <p className="mt-2 text-sm text-slate">
            현재 지점: <span className="font-semibold text-ink">{getAcademyLabel(academy)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/settings/discount-codes/${code.id}/edit`} className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90">
            수정
          </Link>
          <Link href="/admin/settings/discount-codes" className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30">
            목록으로
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">할인 방식</p>
          <p className="mt-2 text-xl font-bold text-ink">{DISCOUNT_TYPE_LABELS[code.discountType]}</p>
          <p className="mt-1 text-sm font-semibold text-ember">{discountDisplay}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">사용 횟수</p>
          <p className="mt-2 text-xl font-bold text-ink tabular-nums">
            {code.usageCount}
            <span className="ml-1 text-sm font-normal text-slate">/ {code.maxUsage != null ? code.maxUsage : "무제한"}</span>
          </p>
          {usageRate != null ? <p className="mt-1 text-xs text-slate">사용률 {usageRate}%</p> : null}
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 할인 금액</p>
          <p className="mt-2 text-xl font-bold text-ember tabular-nums">{formatKRW(totalDiscountGiven)}</p>
          <p className="mt-1 text-xs text-slate">이 코드로 적용된 총 할인</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">상태</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${code.isActive && !isExpired ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {!code.isActive ? "비활성" : isExpired ? "만료" : "활성"}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate">
            <div>시작: {formatDate(code.validFrom)}</div>
            <div>종료: {code.validUntil ? formatDate(code.validUntil) : "없음"}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate">기본 정보</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate">코드 유형</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{code.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">발급자</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{code.staff?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">생성일</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDateTime(code.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">최종 수정</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{formatDateTime(code.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink">
          사용 이력 <span className="ml-2 text-sm font-normal text-slate">({code.usages.length}건)</span>
        </h2>
        <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["학번", "이름", "연락처", "할인 금액", "실결제 금액", "사용일"].map((header) => (
                  <th key={header} className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {code.usages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate">아직 사용된 내역이 없습니다.</td>
                </tr>
              ) : (
                code.usages.map((usage) => (
                  <tr key={usage.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate">{usage.student.examNumber}</td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      <Link href={`/admin/students/${usage.student.examNumber}`} className="transition hover:text-ember hover:underline">
                        {usage.student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate">{usage.student.phone ?? "-"}</td>
                    <td className="px-4 py-3 font-semibold text-ember">{formatKRW(usage.payment?.discountAmount ?? 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">{formatKRW(usage.payment?.netAmount ?? 0)}</td>
                    <td className="px-4 py-3 text-xs text-slate">{formatDateTime(usage.usedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}