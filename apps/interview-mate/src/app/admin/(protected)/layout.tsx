import { redirect } from "next/navigation";

import { hasAdminSession } from "@/lib/auth";
import { hasActiveAdminUsers } from "@/lib/admin-users";

type ProtectedAdminLayoutProps = {
  children: React.ReactNode;
};

export default async function ProtectedAdminLayout({
  children,
}: ProtectedAdminLayoutProps) {
  if (!(await hasActiveAdminUsers())) {
    redirect("/admin/setup");
  }

  if (!hasAdminSession()) {
    redirect("/admin/login");
  }

  return children;
}
