import { ReservationFlow } from "@/components/reservation/reservation-flow";
import { getTrack } from "@/lib/constants";

type ReservationPageProps = {
  searchParams?: {
    track?: string;
  };
};

export default function ReservationPage({
  searchParams,
}: ReservationPageProps) {
  const track = getTrack(searchParams?.track);

  return <ReservationFlow track={track.key} />;
}
