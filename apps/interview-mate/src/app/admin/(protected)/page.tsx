import { redirect } from "next/navigation";

type AdminIndexPageProps = {
  searchParams?: {
    session?: string;
  };
};

export default function AdminIndexPage({ searchParams }: AdminIndexPageProps) {
  const sessionQuery = searchParams?.session
    ? `?session=${encodeURIComponent(searchParams.session)}`
    : "";

  redirect(`/admin/dashboard${sessionQuery}`);
}
