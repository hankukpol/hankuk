import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { getAdminDashboardData } from "@/lib/services/admin-dashboard.service";

type AdminDashboardPageProps = {
  params: {
    division: string;
  };
};


export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const dashboardData = await getAdminDashboardData(params.division);

  return <AdminDashboard divisionSlug={params.division} initialData={dashboardData} />;
}
