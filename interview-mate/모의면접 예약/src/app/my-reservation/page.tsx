import { MyReservationFlow } from "@/components/reservation/my-reservation-flow";
import { getTrack } from "@/lib/constants";

type MyReservationPageProps = {
  searchParams?: {
    track?: string;
  };
};

export default function MyReservationPage({
  searchParams,
}: MyReservationPageProps) {
  const track = getTrack(searchParams?.track);

  return <MyReservationFlow track={track.key} />;
}
