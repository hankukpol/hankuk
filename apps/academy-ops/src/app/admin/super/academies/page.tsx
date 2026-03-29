import { listAcademySummaries } from "@/lib/super-admin";
import { AcademyManager } from "./academy-manager";

type PageProps = {
  searchParams?: {
    modal?: string;
  };
};

export default async function SuperAcademiesPage({ searchParams }: PageProps) {
  const academies = await listAcademySummaries();
  const openCreateInitially = searchParams?.modal === "create";

  return <AcademyManager initialAcademies={academies} openCreateInitially={openCreateInitially} />;
}
