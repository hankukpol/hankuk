import { AdminTheme } from '@/components/admin/AdminTheme'

export default function AdminAuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminTheme className="admin-auth-shell">{children}</AdminTheme>
}

