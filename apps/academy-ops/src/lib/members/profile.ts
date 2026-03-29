import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const MEMBER_PROFILE_NOT_READY_ERROR = "MEMBER_PROFILE_NOT_READY";
export const MEMBER_NOT_FOUND_ERROR = "MEMBER_NOT_FOUND";

const SPECIAL_LECTURE_LABEL = "\uD2B9\uAC15";
const COMPREHENSIVE_LABEL = "\uC885\uD569\uBC18";

export type MemberProfileEnrollSource =
  | "VISIT"
  | "PHONE"
  | "ONLINE"
  | "REFERRAL"
  | "SNS"
  | "OTHER";

export type MemberProfileStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN" | "GRADUATED";

export type MemberSummary = {
  examNumber: string;
  name: string;
  mobile: string | null;
  enrollments: Array<{
    id: string;
    label: string;
    status: string;
    startDate: string;
    endDate: string | null;
  }>;
};

export type MemberProfileRecord = {
  examNumber: string;
  birthDate: string | null;
  address: string | null;
  photoUrl: string | null;
  enrollSource: MemberProfileEnrollSource | null;
  status: MemberProfileStatus;
  withdrawReason: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MemberProfilePayload = {
  birthDate: string | null;
  address: string | null;
  photoUrl: string | null;
  enrollSource: MemberProfileEnrollSource | null;
  status: MemberProfileStatus;
  withdrawReason: string | null;
};

export type MemberProfileView = {
  ready: boolean;
  student: MemberSummary | null;
  profile: MemberProfileRecord | null;
};

type StudentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  birthDate: Date | null;
  address: string | null;
  courseEnrollments: Array<{
    id: string;
    courseType: "COMPREHENSIVE" | "SPECIAL_LECTURE";
    status: string;
    startDate: Date;
    endDate: Date | null;
    cohort: { name: string } | null;
    product: { name: string } | null;
    specialLecture: { name: string } | null;
  }>;
};

type MemberProfileRow = {
  examNumber: string;
  photoUrl: string | null;
  enrollSource: MemberProfileEnrollSource | null;
  status: MemberProfileStatus;
  withdrawReason: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function formatDateOnly(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBirthDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T12:00:00.000Z`);
}

function buildEnrollmentLabel(enrollment: StudentRow["courseEnrollments"][number]) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    (enrollment.courseType === "SPECIAL_LECTURE" ? SPECIAL_LECTURE_LABEL : COMPREHENSIVE_LABEL)
  );
}

function toSummary(student: StudentRow): MemberSummary {
  return {
    examNumber: student.examNumber,
    name: student.name,
    mobile: student.phone,
    enrollments: student.courseEnrollments.map((enrollment) => ({
      id: enrollment.id,
      label: buildEnrollmentLabel(enrollment),
      status: enrollment.status,
      startDate: enrollment.startDate.toISOString(),
      endDate: enrollment.endDate?.toISOString() ?? null,
    })),
  };
}

function buildProfileRecord(student: StudentRow, profile: MemberProfileRow | null): MemberProfileRecord {
  return {
    examNumber: student.examNumber,
    birthDate: formatDateOnly(student.birthDate),
    address: student.address,
    photoUrl: profile?.photoUrl ?? null,
    enrollSource: profile?.enrollSource ?? null,
    status: profile?.status ?? "ACTIVE",
    withdrawReason: profile?.withdrawReason ?? null,
    createdAt: profile?.createdAt?.toISOString(),
    updatedAt: profile?.updatedAt?.toISOString(),
  };
}

function buildView(student: StudentRow, profile: MemberProfileRow | null, ready: boolean): MemberProfileView {
  return {
    ready,
    student: toSummary(student),
    profile: buildProfileRecord(student, profile),
  };
}

function isMemberProfileNotReadyError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  return error instanceof Error && /member_profiles|MemberProfile/i.test(error.message);
}

async function findStudentRow(examNumber: string) {
  const prisma = getPrisma();
  return (await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      birthDate: true,
      address: true,
      courseEnrollments: {
        select: {
          id: true,
          courseType: true,
          status: true,
          startDate: true,
          endDate: true,
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      },
    },
  })) as StudentRow | null;
}

export async function getMemberProfileView(examNumber: string): Promise<MemberProfileView> {
  const prisma = getPrisma();
  const student = await findStudentRow(examNumber);

  if (!student) {
    return { ready: false, student: null, profile: null };
  }

  try {
    const profile = (await prisma.memberProfile.findUnique({
      where: { examNumber },
    })) as MemberProfileRow | null;

    return buildView(student, profile, true);
  } catch (error) {
    if (isMemberProfileNotReadyError(error)) {
      return buildView(student, null, false);
    }

    throw error;
  }
}

export async function saveMemberProfile(
  examNumber: string,
  input: Partial<MemberProfilePayload>,
): Promise<MemberProfileView> {
  const prisma = getPrisma();
  const student = await findStudentRow(examNumber);

  if (!student) {
    throw new Error(MEMBER_NOT_FOUND_ERROR);
  }

  const studentPayload: Prisma.StudentUpdateInput = {};
  if ("birthDate" in input) {
    studentPayload.birthDate = parseBirthDate(input.birthDate);
  }
  if ("address" in input) {
    studentPayload.address = normalizeNullableText(input.address);
  }

  const memberProfilePayload: Prisma.MemberProfileUncheckedUpdateInput = {};
  if ("photoUrl" in input) {
    memberProfilePayload.photoUrl = normalizeNullableText(input.photoUrl);
  }
  if ("enrollSource" in input) {
    memberProfilePayload.enrollSource = input.enrollSource ?? null;
  }
  if ("status" in input) {
    const now = new Date();
    memberProfilePayload.status = input.status ?? "ACTIVE";
    memberProfilePayload.suspendedAt = input.status === "SUSPENDED" ? now : null;
    memberProfilePayload.withdrawnAt = input.status === "WITHDRAWN" ? now : null;
  }
  if ("withdrawReason" in input) {
    memberProfilePayload.withdrawReason = normalizeNullableText(input.withdrawReason);
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(studentPayload).length > 0) {
        await tx.student.update({
          where: { examNumber },
          data: studentPayload,
        });
      }

      await tx.memberProfile.upsert({
        where: { examNumber },
        create: {
          examNumber,
          photoUrl: (memberProfilePayload.photoUrl as string | null | undefined) ?? null,
          enrollSource:
            (memberProfilePayload.enrollSource as MemberProfileEnrollSource | null | undefined) ?? null,
          status: (memberProfilePayload.status as MemberProfileStatus | undefined) ?? "ACTIVE",
          suspendedAt: (memberProfilePayload.suspendedAt as Date | null | undefined) ?? null,
          withdrawnAt: (memberProfilePayload.withdrawnAt as Date | null | undefined) ?? null,
          withdrawReason:
            (memberProfilePayload.withdrawReason as string | null | undefined) ?? null,
        },
        update: memberProfilePayload,
      });
    });
  } catch (error) {
    if (isMemberProfileNotReadyError(error)) {
      throw new Error(MEMBER_PROFILE_NOT_READY_ERROR);
    }

    throw error;
  }

  return getMemberProfileView(examNumber);
}