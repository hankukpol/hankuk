import { buildCsv, createCsvResponse } from "@/lib/csv";

const SAMPLE_HEADERS = [
  "이름",
  "연락처",
  "성별",
  "직렬",
  "지역",
  "면접 경험 여부",
  "나이",
  "필기성적",
  "조",
];

function resolveTrack(track: string | null) {
  return track === "fire" ? "fire" : "police";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = resolveTrack(searchParams.get("track"));
  const csv = buildCsv([SAMPLE_HEADERS]);

  return createCsvResponse(`study-groups-${track}-template.csv`, csv);
}
