export type Track = "police" | "fire";

export const TRACKS = {
  police: {
    key: "police" as const,
    label: "한국경찰학원",
    description: "경찰 직렬 면접반 운영",
    color: "#1B4FBB",
    lightColor: "#EBF0FB",
    darkColor: "#0D2D6B",
  },
  fire: {
    key: "fire" as const,
    label: "한국소방학원",
    description: "소방 직렬 면접반 운영",
    color: "#C55A11",
    lightColor: "#FEF3EC",
    darkColor: "#7A3608",
  },
};

export const REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기남부",
  "경기북부",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export const POLICE_REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기남부",
  "경기북부",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "101경비단",
] as const;

export const FIRE_REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
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
