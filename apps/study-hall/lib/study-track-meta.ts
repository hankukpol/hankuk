export function formatStudyTrackLabel(track: string | null | undefined) {
  const value = track?.trim();
  return value ? value : "미지정";
}

export function getStudyTrackShortLabel(track: string | null | undefined) {
  const value = formatStudyTrackLabel(track);

  if (value === "미지정") {
    return value;
  }

  if (value.includes("경찰")) {
    return "경찰";
  }

  if (value.includes("소방")) {
    return "소방";
  }

  if (value.includes("행정")) {
    return "행정직";
  }

  if (value.includes("일행")) {
    return "일행직";
  }

  if (value.includes("9급")) {
    return "9급";
  }

  if (value.includes("공무원")) {
    return value.replace("공무원", "").trim() || "공무원";
  }

  return value.length > 6 ? value.slice(0, 6) : value;
}

export function getStudyTrackBadgeClasses(track: string | null | undefined) {
  const value = formatStudyTrackLabel(track);

  if (value === "미지정") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  if (value.includes("경찰")) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (value.includes("소방")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value.includes("행정")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value.includes("일행")) {
    return "border-lime-200 bg-lime-50 text-lime-700";
  }

  if (value.includes("9급")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}
