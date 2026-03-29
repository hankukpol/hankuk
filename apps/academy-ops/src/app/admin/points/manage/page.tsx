import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { PointAdjustManager } from "./point-adjust-manager";

export const dynamic = "force-dynamic";

export default async function AdminPointsManagePage() {
  await requireAdminContext(AdminRole.MANAGER);
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827]">포인트 직접 관리</h1>
        <p className="text-sm text-[#4B5563] mt-1">학생 포인트 수동 지급 및 차감</p>
      </div>
      <PointAdjustManager />
    </div>
  );
}
