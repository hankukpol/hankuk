export function getAttendanceDateKey(value: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

export function hasAttendanceStartedForDate(targetDate: string, attendanceStartDate?: string | null) {
  if (!attendanceStartDate) {
    return true
  }

  return targetDate >= attendanceStartDate.slice(0, 10)
}

export function getAttendanceTodayKey() {
  return getAttendanceDateKey()
}

export function hasCourseAttendanceStarted(
  course: Pick<{ enrolled_from: string | null }, 'enrolled_from'>,
  targetDate = getAttendanceTodayKey(),
) {
  return hasAttendanceStartedForDate(targetDate, course.enrolled_from)
}
