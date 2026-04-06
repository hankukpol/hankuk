type SearchableStudentLike = {
  name?: string | null;
  studentNumber?: string | null;
  phone?: string | null;
  seatLabel?: string | null;
  seatDisplay?: string | null;
  studyRoomName?: string | null;
  studyTrack?: string | null;
};

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/[\s\-()]/g, "");
}

export function hasStudentSearchQuery(query: string) {
  return normalizeSearchText(query).length > 0;
}

export function matchesStudentSearch<T extends SearchableStudentLike>(
  student: T,
  query: string,
  extraValues: Array<string | null | undefined> = [],
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const compactQuery = compactSearchText(query);
  const candidates = [
    student.name,
    student.studentNumber,
    student.phone,
    student.seatDisplay,
    student.seatLabel,
    student.studyRoomName,
    student.studyTrack,
    ...extraValues,
  ].filter((value): value is string => Boolean(value?.trim()));

  return candidates.some((value) => {
    const normalizedValue = normalizeSearchText(value);

    return (
      normalizedValue.includes(normalizedQuery) ||
      (compactQuery.length > 0 && compactSearchText(value).includes(compactQuery))
    );
  });
}
