import { SuperAdminManager } from "@/components/super-admin/SuperAdminManager";
import { requireSuperAdminAccess } from "@/lib/auth";
import {
  listManagedAdminAccounts,
  listManagedDivisions,
} from "@/lib/services/super-admin.service";

export default async function SuperAdminManagePage() {
  await requireSuperAdminAccess();

  const [divisions, admins] = await Promise.all([
    listManagedDivisions(),
    listManagedAdminAccounts(),
  ]);

  return <SuperAdminManager initialDivisions={divisions} initialAdmins={admins} />;
}
