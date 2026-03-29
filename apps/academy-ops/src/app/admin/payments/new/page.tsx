import { AdminRole, PaymentCategory } from '@prisma/client';
import { requireAdminContext } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { PaymentForm } from '@/components/payments/payment-form';

export const dynamic = 'force-dynamic';

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isPaymentCategory(value: string | undefined): value is PaymentCategory {
  return ['TUITION', 'FACILITY', 'TEXTBOOK', 'MATERIAL', 'SINGLE_COURSE', 'PENALTY', 'ETC'].includes(value ?? '');
}

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const enrollmentId = singleParam(searchParams?.enrollmentId)?.trim() ?? '';
  const studentExamNumberParam = singleParam(searchParams?.studentExamNumber)?.trim();
  const examNumberParam = singleParam(searchParams?.examNumber)?.trim();
  const visibleAcademyId = context.activeAcademyId ?? context.academyId ?? null;
  const prisma = getPrisma();

  const [rawTextbooks, enrollment] = await Promise.all([
    prisma.textbook.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
    }),
    enrollmentId
      ? prisma.courseEnrollment.findFirst({
          where:
            visibleAcademyId === null
              ? { id: enrollmentId }
              : { id: enrollmentId, academyId: visibleAcademyId },
          select: {
            id: true,
            examNumber: true,
          },
        })
      : Promise.resolve(null),
  ]);
  const textbooks = rawTextbooks.map((textbook) => ({
    id: String(textbook.id),
    title: textbook.title,
    price: textbook.price,
  }));

  const initialExamNumber = enrollment?.examNumber ?? examNumberParam ?? studentExamNumberParam ?? '';
  const categoryParam = singleParam(searchParams?.category);
  const initialCategory = isPaymentCategory(categoryParam)
    ? categoryParam
    : enrollment
      ? 'TUITION'
      : undefined;
  const initialEnrollmentId = enrollment?.id ?? '';

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">수납 등록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현금 또는 계좌이체 수납을 등록합니다. 학생을 선택해 수강료와 연결하거나, 교재·시설비·기타 수납을 바로 입력할 수 있습니다.
      </p>
      <div className="mt-8 max-w-4xl">
        <PaymentForm
          initialTextbooks={textbooks}
          initialExamNumber={initialExamNumber}
          initialEnrollmentId={initialEnrollmentId}
          initialCategory={initialCategory}
        />
      </div>
    </div>
  );
}
