import { revalidatePath, revalidateTag } from "next/cache";

type OperationalRevalidationOptions = {
  studentId?: string | null;
  studentIds?: Array<string | null | undefined>;
};

export function revalidateDivisionOperationalViews(
  divisionSlug: string,
  options?: OperationalRevalidationOptions,
) {
  revalidateTag("admin-dashboard");
  revalidateTag("report-data");
  revalidateTag("super-admin-overview");
  revalidateTag("super-admin-student-trend");
  revalidateTag("super-admin-tuition-status");

  revalidatePath(`/${divisionSlug}/admin`);
  revalidatePath(`/${divisionSlug}/admin/students`);
  revalidatePath(`/${divisionSlug}/admin/seats`);
  revalidatePath(`/${divisionSlug}/admin/settings/seats`);
  revalidatePath(`/${divisionSlug}/admin/payments`);
  revalidatePath(`/${divisionSlug}/admin/leave`);
  revalidatePath(`/${divisionSlug}/admin/interviews`);
  revalidatePath(`/${divisionSlug}/admin/points`);
  revalidatePath(`/${divisionSlug}/admin/warnings`);
  revalidatePath(`/${divisionSlug}/admin/reports`);
  revalidatePath(`/${divisionSlug}/student`);
  revalidatePath(`/${divisionSlug}/student/attendance`);
  revalidatePath(`/${divisionSlug}/student/points`);
  revalidatePath(`/${divisionSlug}/student/exams`);
  revalidatePath(`/${divisionSlug}/student/announcements`);
  revalidatePath("/super-admin");

  const targetStudentIds = Array.from(
    new Set(
      [options?.studentId, ...(options?.studentIds ?? [])].filter(
        (studentId): studentId is string => Boolean(studentId),
      ),
    ),
  );

  for (const studentId of targetStudentIds) {
    revalidatePath(`/${divisionSlug}/admin/students/${studentId}`);
  }
}
