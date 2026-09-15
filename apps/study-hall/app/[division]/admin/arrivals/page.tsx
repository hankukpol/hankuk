import { ArrivalsManager } from "@/components/arrivals/ArrivalsManager";
import { requireDivisionAdminAccess } from "@/lib/auth";

export default async function ArrivalsPage({ params }: { params: { division: string } }) {
  await requireDivisionAdminAccess(params.division);
  return <ArrivalsManager divisionSlug={params.division} />;
}
