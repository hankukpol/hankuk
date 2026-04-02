import { revalidatePath, revalidateTag } from "next/cache";

type OperationalRevalidationOptions = {
  studentId?: string | null;
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
  revalidatePath(`/${divisionSlug}/admin/reports`);
  revalidatePath("/super-admin");

  if (options?.studentId) {
    revalidatePath(`/${divisionSlug}/admin/students/${options.studentId}`);
  }
}
