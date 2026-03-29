import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { getPrisma } from "@/lib/prisma";
import { ContractEditor, type ContractData, type ContractItem } from "./contract-editor";

export const dynamic = "force-dynamic";

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

function formatKoreanDate(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatShortDate(value: Date | string | null) {
  if (!value) return "미정";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcDurationLabel(start: Date, end: Date | null) {
  if (!end) return "미정";
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  return `${days.toLocaleString()}일`;
}

type PageProps = { params: Promise<{ id: string }> };

export default async function EnrollmentContractPage({ params }: PageProps) {
  const { id } = await params;
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const visibleAcademyId = resolveVisibleAcademyId(context);
  const prisma = getPrisma();

  const enrollment = await prisma.courseEnrollment.findFirst({
    where: applyAcademyScope({ id }, visibleAcademyId),
    include: {
      student: {
        select: {
          name: true,
          examNumber: true,
          phone: true,
          notificationConsent: true,
          consentedAt: true,
        },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });

  if (!enrollment) {
    notFound();
  }

  const installments = await prisma.installment.findMany({
    where: { payment: { enrollmentId: id } },
    orderBy: { dueDate: "asc" },
  });

  let contractRecord = await prisma.courseContract.findUnique({
    where: { enrollmentId: id },
  });

  if (!contractRecord) {
    const courseName =
      enrollment.cohort?.name ??
      enrollment.specialLecture?.name ??
      enrollment.product?.name ??
      "수강 과정";

    contractRecord = await prisma.courseContract.create({
      data: {
        enrollmentId: id,
        items: [{ label: courseName, amount: enrollment.finalFee }],
        privacyConsentedAt: new Date(),
        staffId: context.adminUser.id,
      },
    });
  }

  const contractData: ContractData = {
    id: contractRecord.id,
    enrollmentId: contractRecord.enrollmentId,
    items: contractRecord.items as ContractItem[],
    note: contractRecord.note,
    issuedAt: contractRecord.issuedAt.toISOString(),
    printedAt: contractRecord.printedAt ? contractRecord.printedAt.toISOString() : null,
    privacyConsentedAt: contractRecord.privacyConsentedAt
      ? contractRecord.privacyConsentedAt.toISOString()
      : null,
  };

  const settings = await getAcademySettingsByAcademyId(
    enrollment.academyId ?? visibleAcademyId ?? context.activeAcademyId ?? context.academyId,
  );
  const academyName = settings?.name?.trim() || "학원명 미설정";
  const academyAddress = settings?.address?.trim() || "학원 주소는 관리자 설정을 확인하세요";
  const academyPhone = settings?.phone?.trim() || "연락처는 관리자 설정을 확인하세요";
  const directorName = settings?.directorName?.trim() || "학원장";
  const businessRegNo = settings?.businessRegNo?.trim() || "-";

  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "수강 과정";
  const printItems = contractData.items;
  const printTotal = printItems.reduce((sum, item) => sum + item.amount, 0);
  const contractDate = formatKoreanDate(contractRecord.issuedAt);
  const courseTypeLabel = COURSE_TYPE_LABEL[enrollment.courseType] ?? enrollment.courseType;
  const privacyConsentRecorded = Boolean(contractData.privacyConsentedAt);

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .contract-page {
            width: 182mm !important;
            min-height: 257mm !important;
            margin: 0 !important;
            padding: 12mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          @page { size: B5; margin: 0; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
        <a
          href={`/admin/enrollments/${id}`}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-400"
        >
          ← 수강 상세로 돌아가기
        </a>
        <span className="text-sm text-gray-500">
          {enrollment.student.name} · {courseName}
        </span>
      </div>

      <ContractEditor
        enrollmentId={id}
        initial={contractData}
        studentNotificationConsent={enrollment.student.notificationConsent}
        studentNotificationConsentedAt={enrollment.student.consentedAt?.toISOString() ?? null}
      />

      <div className="flex justify-center p-8">
        <div
          className="contract-page w-[700px] bg-white p-12 shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          <div className="mb-8 text-center">
            <div className="mb-2 text-lg font-bold">{academyName}</div>
            <div className="border-y border-gray-900 py-3 text-2xl font-bold tracking-[0.3em]">
              수강 계약서
            </div>
            <div className="mt-2 text-sm text-gray-500">
              학원의 설립·운영 및 과외교습에 관한 법률 제14조에 따라 아래와 같이 수강 계약을 체결합니다.
            </div>
          </div>

          <Section title="학원 정보">
            <TwoCol
              rows={[
                ["학원명", academyName, "사업자등록번호", businessRegNo],
                ["주소", academyAddress, "전화", academyPhone],
                ["학원장", directorName, "발급일", formatShortDate(contractRecord.issuedAt)],
              ]}
            />
          </Section>

          <Section title="수강생 정보">
            <TwoCol
              rows={[
                ["이름", enrollment.student.name, "학번", enrollment.student.examNumber],
                ["연락처", enrollment.student.phone ?? "-", "등록번호", enrollment.id.slice(-8).toUpperCase()],
                ["담당자", enrollment.staff?.name ?? "-", "출력 상태", contractData.printedAt ? "출력 완료" : "미출력"],
              ]}
            />
          </Section>

          <Section title="수강 정보">
            <TwoCol
              rows={[
                ["강좌명", courseName, "강좌 유형", courseTypeLabel],
                ["수강 시작", formatShortDate(enrollment.startDate), "수강 종료", formatShortDate(enrollment.endDate)],
                ["수강 기간", calcDurationLabel(enrollment.startDate, enrollment.endDate), "등록일", formatShortDate(enrollment.createdAt)],
              ]}
            />
          </Section>

          <Section title="수강료">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-1.5 text-left">항목</th>
                  <th className="w-36 border border-gray-200 px-3 py-1.5 text-right">금액</th>
                </tr>
              </thead>
              <tbody id="contract-fee-tbody">
                {printItems.map((item, index) => (
                  <tr key={`${item.label}-${index}`}>
                    <td className="border border-gray-200 px-3 py-1.5">{item.label}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                      {item.amount.toLocaleString()}원
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-gray-200 px-3 py-1.5">합계</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                    {printTotal.toLocaleString()}원
                  </td>
                </tr>
              </tbody>
            </table>

            {installments.length > 1 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-gray-600">분할 납부 일정</p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-1.5 text-left">회차</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-left">납부일</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((installment, index) => (
                      <tr key={installment.id}>
                        <td className="border border-gray-200 px-3 py-1.5">{index + 1}회</td>
                        <td className="border border-gray-200 px-3 py-1.5">{formatShortDate(installment.dueDate)}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                          {installment.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Section>

          <div id="contract-note-section" style={{ display: contractData.note ? undefined : "none" }}>
            <Section title="특약 사항">
              <p id="contract-note-text" className="whitespace-pre-wrap text-sm text-gray-700">
                {contractData.note ?? ""}
              </p>
            </Section>
          </div>

          <Section title="환불 규정 (학원의 설립·운영 및 과외교습에 관한 법률 제18조)">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-1.5 text-left">구분</th>
                  <th className="border border-gray-200 px-3 py-1.5 text-left">환불 기준</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["수강 시작 전", "납부한 수강료 전액 환불"],
                  ["총 수강 기간의 1/3 이전", "납부한 수강료의 2/3에 해당하는 금액 환불"],
                  ["총 수강 기간의 1/2 이전", "납부한 수강료의 1/2에 해당하는 금액 환불"],
                  ["총 수강 기간의 1/2 경과 후", "환불 없음"],
                ].map(([period, rule]) => (
                  <tr key={period}>
                    <td className="border border-gray-200 px-3 py-1.5">{period}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="개인정보 수집·이용 동의">
            <div className="space-y-3 text-sm leading-6 text-gray-700">
              <p>
                학원은 수강 관리, 성적 안내, 출결 안내, 수납 및 환불 처리, 민원 대응을 위해 아래 개인정보를 수집·이용합니다.
                <br />
                <span className="font-semibold">수집 항목:</span> 이름, 연락처, 생년월일, 수강 내역, 수납 내역
                <br />
                <span className="font-semibold">보유 기간:</span> 수강 종료 후 3년
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  id="contract-privacy-required-status"
                  className={privacyConsentRecorded
                    ? "rounded-full bg-forest/10 px-2.5 py-1 font-semibold text-forest"
                    : "rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700"}
                >
                  {privacyConsentRecorded ? "동의 완료" : "동의 기록 필요"}
                </span>
                <span className="rounded-full bg-mist px-2.5 py-1 font-semibold text-slate">
                  선택 알림 수신 {enrollment.student.notificationConsent ? "동의" : "미동의"}
                </span>
              </div>
              <p id="contract-privacy-required-date" className="text-xs text-gray-500">
                {privacyConsentRecorded
                  ? `기록 시각: ${formatDateTime(contractData.privacyConsentedAt)}`
                  : "필수 동의가 기록되지 않았습니다."}
              </p>
            </div>
          </Section>

          <div className="mt-8 border-t border-gray-900 pt-6">
            <p className="mb-6 text-center text-sm">위 계약 내용을 확인하고 동의합니다.</p>
            <div className="mb-1 text-center text-sm font-semibold">{contractDate}</div>

            <div className="mt-6 grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-600">수강생(또는 보호자) 서명</p>
                <div className="h-12 border-b border-gray-400" />
                <p className="mt-1 text-xs text-gray-500">{enrollment.student.name}</p>
              </div>
              <div className="text-center">
                <p className="mb-1 text-sm text-gray-600">학원장 서명</p>
                <div className="h-12 border-b border-gray-400" />
                <p className="mt-1 text-xs text-gray-500">{directorName}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-200 pt-3 text-center text-xs text-gray-400">
            {academyName} · {academyAddress} · Tel: {academyPhone}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 border-l-4 border-gray-900 pl-3 text-sm font-bold">{title}</h3>
      <div className="rounded border border-gray-200 p-3">{children}</div>
    </div>
  );
}

function TwoCol({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row[0]}-${index}`}>
            <td className="w-[18%] whitespace-nowrap border border-gray-200 bg-gray-50 px-3 py-1.5 font-semibold text-gray-600">
              {row[0]}
            </td>
            <td className={`border border-gray-200 px-3 py-1.5 ${row[2] ? "w-[32%]" : "w-[82%]"}`}>
              {row[1]}
            </td>
            {row[2] ? (
              <>
                <td className="w-[18%] whitespace-nowrap border border-gray-200 bg-gray-50 px-3 py-1.5 font-semibold text-gray-600">
                  {row[2]}
                </td>
                <td className="border border-gray-200 px-3 py-1.5">{row[3]}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
