"use client";

import Link from "next/link";
import { CourseType, EnrollmentStatus } from "@prisma/client";
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

type LeaveRecord = {
  id: string;
  leaveDate: string;
  returnDate: string | null;
  reason: string | null;
};

export type StudentEnrollmentRow = {
  id: string;
  courseType: CourseType;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: EnrollmentStatus;
  isRe: boolean;
  createdAt: string;
  cohort: { name: string; examCategory: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  staff: { name: string };
  leaveRecords: LeaveRecord[];
};

type Props = {
  examNumber: string;
  enrollments: StudentEnrollmentRow[];
};

export function StudentEnrollmentsPanel({ examNumber, enrollments }: Props) {
  const activeEnrollments = enrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "SUSPENDED" || e.status === "PENDING",
  );
  const pastEnrollments = enrollments.filter(
    (e) => !activeEnrollments.includes(e),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate">
            수강 등록 {enrollments.length}건 (활성 {activeEnrollments.length}건)
          </p>
        </div>
        <Link
          href={`/admin/enrollments/new?examNumber=${examNumber}`}
          className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          + 수강 등록
        </Link>
      </div>

      {enrollments.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          수강 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active enrollments */}
          {activeEnrollments.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">현재 수강 중</h3>
              <div className="overflow-hidden rounded-[28px] border border-ink/10">
                <EnrollmentTable enrollments={activeEnrollments} />
              </div>
            </div>
          )}

          {/* Past enrollments */}
          {pastEnrollments.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate">수강 이력</h3>
              <div className="overflow-hidden rounded-[28px] border border-ink/10 opacity-70">
                <EnrollmentTable enrollments={pastEnrollments} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrollmentTable({ enrollments }: { enrollments: StudentEnrollmentRow[] }) {
  return (
    <table className="min-w-full divide-y divide-ink/10 text-sm">
      <thead className="bg-mist/80 text-left">
        <tr>
          <th className="px-4 py-3 font-semibold">강좌/기수</th>
          <th className="px-4 py-3 font-semibold">유형</th>
          <th className="px-4 py-3 font-semibold">기간</th>
          <th className="px-4 py-3 font-semibold">수강료</th>
          <th className="px-4 py-3 font-semibold">상태</th>
          <th className="px-4 py-3 font-semibold">등록 직원</th>
          <th className="px-4 py-3 font-semibold">수강증</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink/10 bg-white">
        {enrollments.map((e) => (
          <>
            <tr key={e.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-ink">
                  {e.cohort?.name ?? e.specialLecture?.name ?? "-"}
                </div>
                {e.product && (
                  <div className="mt-0.5 text-xs text-slate">{e.product.name}</div>
                )}
                {e.cohort && (
                  <div className="mt-0.5 text-xs text-slate">
                    {EXAM_CATEGORY_LABEL[e.cohort.examCategory as "GONGCHAE" | "GYEONGCHAE"]}
                  </div>
                )}
                {e.isRe && (
                  <span className="mt-0.5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    재수강
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    e.courseType === "COMPREHENSIVE"
                      ? "border-forest/20 bg-forest/10 text-forest"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {COURSE_TYPE_LABEL[e.courseType]}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate">
                <div>{formatDate(e.startDate)}</div>
                <div>{e.endDate ? `~ ${formatDate(e.endDate)}` : "~ 미정"}</div>
              </td>
              <td className="px-4 py-3 tabular-nums">
                <div className="font-medium">{e.finalFee.toLocaleString()}원</div>
                {e.discountAmount > 0 && (
                  <div className="mt-0.5 text-xs text-forest">
                    -{e.discountAmount.toLocaleString()}원 할인
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}
                >
                  {ENROLLMENT_STATUS_LABEL[e.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate">{e.staff.name}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <Link
                    href={`/admin/enrollments/${e.id}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-2.5 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
                  >
                    상세
                  </Link>
                  <Link
                    href={`/admin/enrollments/${e.id}/card`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-forest/20 px-2.5 py-1 text-xs font-semibold text-forest transition hover:border-forest/50"
                  >
                    수강증
                  </Link>
                </div>
              </td>
            </tr>
            {/* Leave records */}
            {e.leaveRecords.map((leave) => (
              <tr key={`leave-${leave.id}`} className="bg-amber-50/50">
                <td colSpan={7} className="px-4 py-2 text-xs text-slate">
                  <span className="mr-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                    휴원
                  </span>
                  {formatDate(leave.leaveDate)} ~ {leave.returnDate ? formatDate(leave.returnDate) : "복귀 전"}
                  {leave.reason ? ` · ${leave.reason}` : ""}
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  );
}
