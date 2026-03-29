import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DocCard = {
  key: string;
  title: string;
  titleKo: string;
  description: string;
  href: string;
  icon: string;
  badgeLabel?: string;
  badgeColor?: "green" | "amber" | "slate";
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EnrollmentDocumentsPage({ params }: PageProps) {
  const { id } = await params;
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const visibleAcademyId = resolveVisibleAcademyId(context);
  const prisma = getPrisma();

  const [enrollment, contract] = await Promise.all([
    prisma.courseEnrollment.findFirst({
      where: applyAcademyScope({ id }, visibleAcademyId),
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    }),
    prisma.courseContract.findUnique({
      where: { enrollmentId: id },
      select: { printedAt: true, issuedAt: true, privacyConsentedAt: true },
    }),
  ]);

  if (!enrollment) {
    notFound();
  }

  const courseName =
    enrollment.cohort?.name ?? enrollment.product?.name ?? enrollment.specialLecture?.name ?? "수강 과정";

  const contractBadge = !contract
    ? { label: "계약서 생성 필요", color: "amber" as const }
    : !contract.privacyConsentedAt
      ? { label: "동의 기록 필요", color: "amber" as const }
      : contract.printedAt
        ? { label: `출력 완료 · ${formatDate(contract.printedAt.toISOString())}`, color: "green" as const }
        : { label: "미출력", color: "slate" as const };

  const docs: DocCard[] = [
    {
      key: "card",
      title: "수강증",
      titleKo: "ENROLLMENT CARD",
      description: "학생 수강 카드와 기본 식별 정보를 인쇄합니다.",
      href: `/admin/enrollments/${id}/card`,
      icon: "증",
    },
    {
      key: "confirmation",
      title: "수강 확인서",
      titleKo: "ENROLLMENT CONFIRMATION",
      description: "수강 사실과 기간을 증명하는 확인서를 발급합니다.",
      href: `/admin/enrollments/${id}/confirmation`,
      icon: "확",
    },
    {
      key: "certificate",
      title: "수강등록 확인서",
      titleKo: "ENROLLMENT CERTIFICATE",
      description: "수강 등록과 결제 내역을 함께 포함한 공식 확인서를 발급합니다.",
      href: `/admin/enrollments/${id}/certificate`,
      icon: "서",
    },
    {
      key: "contract",
      title: "수강 계약서",
      titleKo: "ENROLLMENT CONTRACT",
      description: "학원법 제14조 기준 계약서입니다. 필수 동의 기록 확인 후 인쇄 / PDF 저장이 가능합니다.",
      href: `/admin/enrollments/${id}/contract`,
      icon: "계",
      badgeLabel: contractBadge.label,
      badgeColor: contractBadge.color,
    },
    {
      key: "textbooks",
      title: "교재 목록",
      titleKo: "TEXTBOOK LIST",
      description: "현재 수강 과정에 연결된 교재와 수령 상태를 확인합니다.",
      href: `/admin/enrollments/${id}/textbooks`,
      icon: "교",
    },
    {
      key: "tax-certificate",
      title: "교육비 납입증명서",
      titleKo: "EDUCATION FEE TAX CERTIFICATE",
      description: "연말정산용 교육비 납입증명서를 발급합니다.",
      href: `/admin/enrollments/${id}/tax-certificate`,
      icon: "납",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 목록", href: "/admin/enrollments" },
          { label: `${enrollment.student.name} - ${courseName}`, href: `/admin/enrollments/${id}` },
          { label: "문서 발급" },
        ]}
      />

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold">문서 발급</h1>
        <Link href={`/admin/enrollments/${id}`} className="text-sm text-slate transition hover:text-ember">
          수강 상세로 돌아가기
        </Link>
      </div>

      <div className="mt-6 rounded-[20px] border border-ink/10 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-medium text-slate">수강생</p>
            <Link
              href={`/admin/students/${enrollment.examNumber}?tab=enrollments`}
              className="mt-0.5 block font-semibold text-ink transition hover:text-ember"
            >
              {enrollment.student.name}
              <span className="ml-2 text-xs font-normal text-slate">({enrollment.examNumber})</span>
            </Link>
          </div>
          <div className="h-8 w-px bg-ink/10" />
          <div>
            <p className="text-xs font-medium text-slate">수강 과정</p>
            <p className="mt-0.5 font-semibold text-ink">{courseName}</p>
          </div>
          <div className="h-8 w-px bg-ink/10" />
          <div>
            <p className="text-xs font-medium text-slate">수강 기간</p>
            <p className="mt-0.5 text-sm text-ink">
              {formatDate(enrollment.startDate.toISOString())}
              {enrollment.endDate ? ` ~ ${formatDate(enrollment.endDate.toISOString())}` : " ~ 미정"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <DocumentCard key={doc.key} doc={doc} />
        ))}
      </div>

      <p className="mt-8 text-xs text-slate/60">
        각 문서를 열면 인쇄용 레이아웃으로 이동합니다. 브라우저의 인쇄 기능으로 PDF 저장도 가능합니다.
      </p>
    </div>
  );
}

const BADGE_STYLES: Record<"green" | "amber" | "slate", string> = {
  green: "border-forest/20 bg-forest/10 text-forest",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-ink/10 bg-mist text-slate",
};

function DocumentCard({ doc }: { doc: DocCard }) {
  return (
    <Link
      href={doc.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-ember/30 hover:shadow-lg"
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl font-semibold text-ember" aria-hidden="true">
          {doc.icon}
        </span>
        {doc.badgeLabel && doc.badgeColor ? (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[doc.badgeColor]}`}>
            {doc.badgeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-lg font-semibold text-ink transition group-hover:text-ember">{doc.title}</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/60">{doc.titleKo}</p>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-slate">{doc.description}</p>

      <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-ember">
        <span>문서 열기</span>
        <span className="transition group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}
