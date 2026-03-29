export type Track = "police" | "fire";

export const TRACKS = {
  police: {
    key: "police" as const,
    label: "경찰",
    description: "경찰 직렬 면접반 운영",
    color: "#1B4FBB",
    lightColor: "#EBF0FB",
    darkColor: "#0D2D6B",
  },
  fire: {
    key: "fire" as const,
    label: "소방",
    description: "소방 직렬 면접반 운영",
    color: "#C55A11",
    lightColor: "#FEF3EC",
    darkColor: "#7A3608",
  },
};

export const REGIONS = [
  "서울",
  "경기",
  "인천",
  "강원",
  "충청",
  "전라",
  "경상",
  "제주",
] as const;

export const ADMIN_TABS = [
  "개요",
  "세션",
  "명단",
  "예약",
  "조 방",
  "대기자",
] as const;

export function isTrack(value: string | undefined): value is Track {
  return value === "police" || value === "fire";
}

export function getTrack(value?: string) {
  return isTrack(value) ? TRACKS[value] : TRACKS.police;
}
