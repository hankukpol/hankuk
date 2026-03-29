import Link from "next/link";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  getAdminAcademyScope,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "PENDING",
  "SUSPENDED",
];

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

function formatDateRange(startDate: Date, endDate: Date) {
  return `${startDate.toLocaleDateString("ko-KR")} ~ ${endDate.toLocaleDateString("ko-KR")}`;
}

function enrollmentLabel(enrollment: {
  courseType: string;
  cohort: { name: string | null } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    COURSE_TYPE_LABEL[enrollment.courseType] ??
    "수강 정보 없음"
  );
}

export default async function EnrollmentSeatsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const academyScope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(academyScope);

  const classroomStudentWhere =
    visibleAcademyId === null
      ? { leftAt: null }
      : {
          leftAt: null,
          student: { academyId: visibleAcademyId },
        };

  const scopedEnrollmentWhere =
    visibleAcademyId === null
      ? { status: { in: ACTIVE_ENROLLMENT_STATUSES } }
      : {
          academyId: visibleAcademyId,
          status: { in: ACTIVE_ENROLLMENT_STATUSES },
        };

  const [classrooms, lectures] = await Promise.all([
    prisma.classroom.findMany({
      where: {
        isActive: true,
        ...(visibleAcademyId === null
          ? {}
          : {
              students: {
                some: classroomStudentWhere,
              },
            }),
      },
      orderBy: [{ generation: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        generation: true,
        teacher: { select: { name: true } },
        _count: {
          select: {
            students: { where: classroomStudentWhere },
          },
        },
        students: {
          where: classroomStudentWhere,
          take: 3,
          orderBy: [{ joinedAt: "asc" }],
          select: {
            id: true,
            student: {
              select: {
                examNumber: true,
                name: true,
                phone: true,
                courseEnrollments: {
                  where: scopedEnrollmentWhere,
                  orderBy: [{ createdAt: "desc" }],
                  take: 2,
                  select: {
                    id: true,
                    courseType: true,
                    cohort: { select: { name: true } },
                    product: { select: { name: true } },
                    specialLecture: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.specialLecture.findMany({
      where: {
        hasSeatAssignment: true,
        ...(visibleAcademyId === null
          ? {}
          : {
              enrollments: {
                some: scopedEnrollmentWhere,
              },
            }),
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: {
        id: true,
        name: true,
        lectureType: true,
        examCategory: true,
        startDate: true,
        endDate: true,
        isActive: true,
        _count: {
          select: {
            enrollments: { where: scopedEnrollmentWhere },
          },
        },
        subjects: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            subjectName: true,
            instructor: { select: { name: true } },
            _count: {
              select: {
                seatAssignments:
                  visibleAcademyId === null
                    ? true
                    : {
                        where: {
                          enrollment: { academyId: visibleAcademyId },
                        },
                      },
              },
            },
          },
        },
        enrollments: {
          where: scopedEnrollmentWhere,
          orderBy: [{ createdAt: "desc" }],
          take: 3,
          select: {
            id: true,
            examNumber: true,
            student: {
              select: {
                name: true,
                phone: true,
              },
            },
            seatAssignments: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const classroomStudentCount = classrooms.reduce(
    (sum, classroom) => sum + classroom._count.students,
    0,
  );

  const assignedLectureSeatCount = lectures.reduce(
    (sum, lecture) =>
      sum +
      lecture.subjects.reduce(
        (subjectSum, subject) => subjectSum + subject._count.seatAssignments,
        0,
      ),
    0,
  );

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">좌석 배정 관리</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            개발 문서의 <code>/admin/enrollments/seats</code> 경로를 현재 코드 기준으로 연결한 허브입니다.
            담임반 좌석표와 특강 좌석 사용 강좌를 한 화면에서 확인하고, 상세 화면으로 바로 이동할 수 있습니다.
          </p>
          <p className="mt-2 text-xs text-slate">
            {visibleAcademyId === null
              ? "현재 전체 보기 기준으로 표시합니다."
              : "현재 선택한 지점 기준 학생과 수강 데이터만 집계합니다."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/classrooms"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            담임반 관리
          </Link>
          <Link
            href="/admin/settings/special-lectures"
            className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition hover:border-ember/40 hover:bg-ember/20"
          >
            특강 좌석 설정
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">담임반</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{classrooms.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">좌석표를 사용할 수 있는 활성 반 수</p>
        </article>
        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">담임반 배정 인원</p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {classroomStudentCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-forest/80">현재 반 배정 학생 기준</p>
        </article>
        <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-ember">좌석 사용 특강</p>
          <p className="mt-2 text-3xl font-semibold text-ember">{lectures.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-ember/80">좌석 배정 사용으로 설정된 강좌</p>
        </article>
        <article className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">특강 배정 좌석</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {assignedLectureSeatCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-700/80">과목별 배정 완료 좌석 수</p>
        </article>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">담임반 좌석표</h2>
            <p className="mt-1 text-sm text-slate">
              현재 코드의 실제 좌석표 화면은 <code>/admin/classrooms/[id]/seating</code> 를 사용합니다.
            </p>
          </div>
        </div>

        {classrooms.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            표시할 담임반 좌석 정보가 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {classrooms.map((classroom) => (
              <article
                key={classroom.id}
                className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">
                      {classroom.name}
                      {classroom.generation ? (
                        <span className="ml-2 text-sm font-normal text-slate">
                          {classroom.generation}기
                        </span>
                      ) : null}
                    </h3>
                    <p className="mt-1 text-sm text-slate">
                      담임: {classroom.teacher.name} · 배정 학생 {classroom._count.students}명
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/classrooms/${classroom.id}/seating`}
                      className="inline-flex items-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
                    >
                      좌석표
                    </Link>
                    <Link
                      href={`/admin/classrooms/${classroom.id}/seating/heatmap`}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
                    >
                      출석 현황
                    </Link>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-mist/80 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate">학생</th>
                        <th className="px-4 py-3 font-semibold text-slate">연락처</th>
                        <th className="px-4 py-3 font-semibold text-slate">수강내역</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10 bg-white">
                      {classroom.students.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-8 text-center text-sm text-slate"
                          >
                            배정된 학생이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        classroom.students.map((row) => (
                          <tr key={row.id} className="align-top hover:bg-mist/30">
                            <td className="px-4 py-4">
                              <Link
                                href={`/admin/students/${row.student.examNumber}`}
                                className="font-semibold text-ink hover:text-ember"
                              >
                                {row.student.name}
                              </Link>
                              <p className="mt-1 text-xs text-slate">
                                학번: {row.student.examNumber}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-slate">
                              {row.student.phone ?? "-"}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-1.5">
                                {row.student.courseEnrollments.length > 0 ? (
                                  row.student.courseEnrollments.map((enrollment) => (
                                    <span
                                      key={enrollment.id}
                                      className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                                    >
                                      {enrollmentLabel(enrollment)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate">현재 수강 없음</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">특강 좌석 사용 강좌</h2>
            <p className="mt-1 text-sm text-slate">
              현재 코드는 특강 설정에서 좌석 사용 여부를 켜고, 강좌 상세와 등록 현황 화면으로 이동해 관리합니다.
            </p>
          </div>
        </div>

        {lectures.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            좌석 사용으로 설정된 특강이 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {lectures.map((lecture) => {
              const assignedSeatCount = lecture.subjects.reduce(
                (sum, subject) => sum + subject._count.seatAssignments,
                0,
              );

              return (
                <article
                  key={lecture.id}
                  className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink">{lecture.name}</h3>
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-medium text-slate">
                          {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
                        </span>
                        {lecture.examCategory ? (
                          <span className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember">
                            {EXAM_CATEGORY_LABEL[lecture.examCategory]}
                          </span>
                        ) : null}
                        {!lecture.isActive ? (
                          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-medium text-slate">
                            비활성
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate">
                        {formatDateRange(lecture.startDate, lecture.endDate)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/settings/special-lectures/${lecture.id}/registrations`}
                        className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
                      >
                        등록 현황
                      </Link>
                      <Link
                        href={`/admin/settings/special-lectures/${lecture.id}`}
                        className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
                      >
                        강좌 상세
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate">
                        활성 수강
                      </p>
                      <p className="mt-1 text-xl font-semibold text-ink">
                        {lecture._count.enrollments.toLocaleString()}명
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                        배정 좌석
                      </p>
                      <p className="mt-1 text-xl font-semibold text-amber-700">
                        {assignedSeatCount.toLocaleString()}개
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {lecture.subjects.map((subject) => (
                      <span
                        key={subject.id}
                        className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-slate"
                      >
                        {subject.subjectName} · {subject.instructor.name} · {subject._count.seatAssignments}석
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10">
                    <table className="min-w-full divide-y divide-ink/10 text-sm">
                      <thead className="bg-mist/80 text-left">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate">학생</th>
                          <th className="px-4 py-3 font-semibold text-slate">연락처</th>
                          <th className="px-4 py-3 font-semibold text-slate">수강내역</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/10 bg-white">
                        {lecture.enrollments.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-8 text-center text-sm text-slate"
                            >
                              현재 수강 중인 학생이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          lecture.enrollments.map((enrollment) => (
                            <tr key={enrollment.id} className="align-top hover:bg-mist/30">
                              <td className="px-4 py-4">
                                <Link
                                  href={`/admin/students/${enrollment.examNumber}`}
                                  className="font-semibold text-ink hover:text-ember"
                                >
                                  {enrollment.student.name}
                                </Link>
                                <p className="mt-1 text-xs text-slate">
                                  학번: {enrollment.examNumber}
                                </p>
                              </td>
                              <td className="px-4 py-4 text-slate">
                                {enrollment.student.phone ?? "-"}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate">
                                    {lecture.name}
                                  </span>
                                  <span className="text-xs text-slate">
                                    배정 과목 {enrollment.seatAssignments.length}개
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
