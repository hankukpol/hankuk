import { ApplyFlow } from "@/components/apply/apply-flow";
import { getTrack } from "@/lib/constants";

type ApplyPageProps = {
  searchParams?: {
    track?: string;
  };
};

export default function ApplyPage({ searchParams }: ApplyPageProps) {
  const track = getTrack(searchParams?.track);

  return <ApplyFlow track={track.key} />;
}
