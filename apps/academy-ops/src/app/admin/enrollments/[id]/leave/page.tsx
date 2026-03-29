import { AdminRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function EnrollmentLeaveAliasPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const enrollment = await getPrisma().courseEnrollment.findUnique({
    where: { id: params.id },
    select: {
      status: true,
      leaveRecords: {
        where: { returnDate: null },
        orderBy: { leaveDate: "desc" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!enrollment) notFound();

  const activeLeaveId = enrollment.leaveRecords[0]?.id ?? null;
  const searchParams = new URLSearchParams();

  if (enrollment.status === "SUSPENDED" && activeLeaveId) {
    searchParams.set("modal", "return");
    searchParams.set("leaveRecordId", activeLeaveId);
  } else if (enrollment.status === "ACTIVE") {
    searchParams.set("modal", "leave");
  }

  const query = searchParams.toString();
  redirect(
    `/admin/enrollments/${params.id}${query ? `?${query}` : ""}#leave-management`,
  );
}
