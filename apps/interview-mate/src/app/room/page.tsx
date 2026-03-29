import { RoomFlow } from "@/components/room/room-flow";

type RoomPageProps = {
  searchParams?: {
    token?: string;
    roomId?: string;
  };
};

export default function RoomPage({ searchParams }: RoomPageProps) {
  const token = searchParams?.token ?? "";
  const roomId = searchParams?.roomId ?? "";

  return <RoomFlow token={token} roomId={roomId} restoreFromStorage />;
}
