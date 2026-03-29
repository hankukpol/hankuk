import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkDetailClient } from "./payment-link-detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  EXPIRED: "만료",
  DISABLED: "비활성",
  USED_UP: "소진",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  EXPIRED: "border-slate/20 bg-slate/10 text-slate",
  DISABLED: "border-red-200 bg-red-50 text-red-700",
  USED_UP: "border-amber-200 bg-amber-50 text-amber-700",
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

function formatDateTime(isoString: string | null): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return (
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

export default async function PaymentLinkDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = params;
  const numId = Number(id);
  if (isNaN(numId)) notFound();

  const link = await getPrisma().paymentLink.findUnique({
    where: { id: numId },
    include: {
      staff: { select: { name: true } },
      course: {
        select: { id: true, name: true, cohortStartDate: true, cohortEndDate: true },
      },
      cohort: { select: { id: true, name: true, startDate: true, endDate: true } },
      product: { select: { id: true, name: true } },
      specialLecture: { select: { id: true, name: true } },
      student: { select: { examNumber: true, name: true } },
      payments: {
        select: {
          id: true,
          examNumber: true,
          netAmount: true,
          method: true,
          processedAt: true,
          student: { select: { name: true } },
        },
        orderBy: { processedAt: "desc" },
        take: 20,
      },
    },
  });

  // Generate the public payment URL & QR code
  const payUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:3000"}/pay/${link?.token ?? ""}`;
  const qrDataUrl = link
    ? await QRCode.toDataURL(payUrl, { width: 200, margin: 2 }).catch(() => null)
    : null;

  if (!link) notFound();

  const now = new Date();
  const isExpired = link.expiresAt < now || link.status === "EXPIRED";
  const isExpiringSoon =
    !isExpired &&
    link.status === "ACTIVE" &&
    link.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const canDisable = link.status === "ACTIVE" && !isExpired;
  const displayStatus = isExpired && link.status === "ACTIVE" ? "EXPIRED" : link.status;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/payment-links" },
          { label: "결제 링크", href: "/admin/payment-links" },
          { label: `링크 #${String(link.id).slice(-6)}` },
        ]}
      />

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold">{link.title}</h1>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[displayStatus] ?? STATUS_COLOR.ACTIVE}`}
        >
          {STATUS_LABEL[displayStatus] ?? displayStatus}
        </span>
      </div>

      {isExpiringSoon && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-semibold text-amber-800">만료 임박</span>
          <span className="text-xs text-amber-700">
            {formatDateTime(link.expiresAt.toISOString())} 만료 예정
          </span>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Link info card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">링크 정보</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate">링크 제목</dt>
                <dd className="font-medium text-ink">{link.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">연결 강좌</dt>
                <dd className="font-medium text-ink">{link.course?.name ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">정상 금액</dt>
                <dd className="tabular-nums font-medium text-ink">
                  {link.amount.toLocaleString()}원
                </dd>
              </div>
              {link.discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate">할인 금액</dt>
                  <dd className="tabular-nums font-medium text-red-600">
                    -{link.discountAmount.toLocaleString()}원
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink/5 pt-3">
                <dt className="font-semibold text-ink">최종 결제 금액</dt>
                <dd className="tabular-nums text-lg font-bold text-forest">
                  {link.finalAmount.toLocaleString()}원
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">포인트 사용</dt>
                <dd className="font-medium text-ink">{link.allowPoint ? "허용" : "불허"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">만료일시</dt>
                <dd className={`font-medium ${isExpiringSoon ? "text-amber-700" : "text-ink"}`}>
                  {formatDateTime(link.expiresAt.toISOString())}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">최대 사용 횟수</dt>
                <dd className="font-medium text-ink">
                  {link.maxUsage != null ? `${link.maxUsage}회` : "무제한"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">사용 횟수</dt>
                <dd className="tabular-nums font-medium text-ink">{link.usageCount}회</dd>
              </div>
              {link.note && (
                <div className="flex justify-between">
                  <dt className="text-slate">메모</dt>
                  <dd className="font-medium text-ink">{link.note}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate">생성자</dt>
                <dd className="font-medium text-ink">{link.staff.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">생성일</dt>
                <dd className="font-medium text-ink">
                  {formatDateTime(link.createdAt.toISOString())}
                </dd>
              </div>
            </dl>
          </div>

          {/* Payment history */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">
              결제 이력{" "}
              <span className="ml-1 text-sm font-normal text-slate">
                ({link.payments.length}건)
              </span>
            </h2>
            {link.payments.length === 0 ? (
              <p className="mt-4 text-sm text-slate">결제 이력이 없습니다.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/5 text-sm">
                  <thead>
                    <tr>
                      {["학생", "금액", "결제 수단", "결제일시"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap bg-mist/50 px-3 py-2 text-left text-xs font-medium text-slate"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {link.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-mist/30">
                        <td className="px-3 py-2">
                          {p.student?.name ? (
                            <Link
                              href={`/admin/students/${p.examNumber}`}
                              className="font-medium text-ink transition hover:text-ember"
                            >
                              {p.student.name}
                            </Link>
                          ) : (
                            <span className="text-slate">{p.examNumber ?? "-"}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-ink">
                          {p.netAmount.toLocaleString()}원
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate">
                          {METHOD_LABEL[p.method] ?? p.method}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate">
                          {formatDateTime(p.processedAt.toISOString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Copy URL + QR */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">결제 링크</h2>
            <p className="mt-2 break-all rounded-lg bg-mist px-3 py-2 font-mono text-xs text-slate">
              /pay/{link.token}
            </p>
            {qrDataUrl && (
              <div className="mt-4 flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="결제 링크 QR 코드"
                  className="h-[140px] w-[140px] rounded-xl border border-ink/10"
                />
                <p className="mt-1 text-[10px] text-slate">QR 코드로 결제 페이지 바로가기</p>
              </div>
            )}
            <PaymentLinkDetailClient
              linkId={link.id}
              token={link.token}
              canDisable={canDisable}
            />
          </div>

          {/* Auto-enrollment config */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">자동 수강등록 설정</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate">지정 학생</dt>
                <dd className="font-medium text-ink">
                  {link.student
                    ? `${link.student.name} (${link.student.examNumber})`
                    : <span className="text-slate">없음 (다회용)</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">수강 유형</dt>
                <dd className="font-medium text-ink">
                  {link.courseType === "COMPREHENSIVE"
                    ? "종합반"
                    : link.courseType === "SPECIAL_LECTURE"
                      ? "특강 단과"
                      : <span className="text-slate">미설정</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">기수</dt>
                <dd className="font-medium text-ink">
                  {link.cohort ? link.cohort.name : <span className="text-slate">미설정</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">종합반 상품</dt>
                <dd className="font-medium text-ink">
                  {link.product ? link.product.name : <span className="text-slate">미설정</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">특강 단과</dt>
                <dd className="font-medium text-ink">
                  {link.specialLecture
                    ? link.specialLecture.name
                    : <span className="text-slate">미설정</span>}
                </dd>
              </div>
              <div className="mt-3 rounded-lg border border-ink/5 bg-mist/50 px-3 py-2 text-xs text-slate">
                {link.examNumber || link.cohortId || link.productId || link.specialLectureId
                  ? "결제 완료 시 위 설정으로 수강이 자동 등록됩니다."
                  : "자동 수강등록이 설정되지 않았습니다. 결제 후 수동으로 수강 등록이 필요합니다."}
              </div>
            </dl>
          </div>

          {/* Stats */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">현황</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate">결제 완료</span>
                <span className="tabular-nums font-bold text-forest">
                  {link.payments.length}건
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate">총 수납액</span>
                <span className="tabular-nums font-bold text-ember">
                  {link.payments
                    .reduce((sum, p) => sum + p.netAmount, 0)
                    .toLocaleString()}
                  원
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate">남은 사용 횟수</span>
                <span className="font-medium text-ink">
                  {link.maxUsage != null
                    ? `${link.maxUsage - link.usageCount}회`
                    : "무제한"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
