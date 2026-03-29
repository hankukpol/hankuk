import { ImageResponse } from "next/og";
import ShareCard from "@/components/share/ShareCard";

export const runtime = "edge";

const imageSize = {
  width: 1200,
  height: 630,
};

function toNumber(value: string | null, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const examTitle = searchParams.get("examTitle") ?? "\ud569\uaca9\uc608\uce21 \uacb0\uacfc";
  const userName = searchParams.get("userName") ?? "\uc218\ud5d8\uc0dd";
  const examTypeLabel = searchParams.get("examTypeLabel") ?? "\uacf5\ucc44";
  const regionName = searchParams.get("regionName") ?? "\uc9c0\uc5ed \ubbf8\uc815";
  const finalScore = toNumber(searchParams.get("finalScore"), 0);
  const rankRaw = searchParams.get("rank");
  const totalParticipantsRaw = searchParams.get("totalParticipants");
  const rankingBasisLabel = searchParams.get("rankingBasisLabel");
  const predictionGrade = searchParams.get("predictionGrade");

  return new ImageResponse(
    (
      <ShareCard
        examTitle={examTitle}
        userName={userName}
        examTypeLabel={examTypeLabel}
        regionName={regionName}
        finalScore={finalScore}
        rank={rankRaw ? toNumber(rankRaw, 0) : null}
        totalParticipants={totalParticipantsRaw ? toNumber(totalParticipantsRaw, 0) : null}
        rankingBasisLabel={rankingBasisLabel}
        predictionGrade={predictionGrade}
      />
    ),
    imageSize
  );
}
