import { listAcademyOptions, listSuperAdminUsers } from "@/lib/super-admin";
import { SuperUsersManager } from "./super-users-manager";

export default async function SuperUsersPage() {
  const [users, academies] = await Promise.all([listSuperAdminUsers(), listAcademyOptions()]);

  return <SuperUsersManager initialUsers={users} academyOptions={academies} />;
}
