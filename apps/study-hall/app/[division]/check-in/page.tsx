import { ArrivalKiosk } from "@/components/arrivals/ArrivalKiosk";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { notFound } from "next/navigation";

export default async function CheckInPage({ params }: { params: { division: string } }) {
  const division = await getDivisionBySlug(params.division);
  if (!division) notFound();
  // Device access is checked by the kiosk API; never sign in an admin on this screen.
  return <ArrivalKiosk divisionSlug={params.division} divisionName={division.name} />;
}
