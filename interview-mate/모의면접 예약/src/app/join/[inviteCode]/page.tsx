import { JoinRoomFlow } from "@/components/join/join-room-flow";

type JoinPageProps = {
  params: {
    inviteCode: string;
  };
};

export default function JoinPage({ params }: JoinPageProps) {
  return <JoinRoomFlow inviteCode={params.inviteCode} />;
}
