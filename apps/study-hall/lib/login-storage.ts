/**
 * 로그인 화면이 이 기기에만 남기는 값.
 *
 * localStorage 는 사생활 보호 모드나 저장 차단에서 읽기·쓰기 자체가 던진다.
 * 그래서 모든 호출을 try/catch 로 감싸고, 실패는 "저장이 없음"과 같게 다룬다.
 *
 * 학생과 운영 계정이 담는 것이 다르다.
 * - 학생: 수험번호+이름. 학생 로그인에 비밀번호가 없어 이 둘이 곧 자격이므로,
 *   저장하면 그대로 자동 로그인이 된다. 기본은 꺼 둔다.
 * - 운영 계정: 이메일만. 비밀번호는 담지 않는다.
 */

const STUDENT_PREFIX = "study-hall:student-login:";
const STAFF_EMAIL_KEY = "study-hall:staff-login-email";

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export type StoredStudentLogin = {
  studentNumber: string;
  name: string;
};

/** 지점마다 따로 담는다. 다른 지점 화면을 열었을 때 엉뚱한 학생으로 들어가지 않게. */
export function readStudentLogin(divisionSlug: string): StoredStudentLogin | null {
  const raw = read(`${STUDENT_PREFIX}${divisionSlug}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { studentNumber?: unknown; name?: unknown };
    return typeof parsed.studentNumber === "string" &&
      typeof parsed.name === "string" &&
      parsed.studentNumber &&
      parsed.name
      ? { studentNumber: parsed.studentNumber, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

export function rememberStudentLogin(divisionSlug: string, studentNumber: string, name: string) {
  write(`${STUDENT_PREFIX}${divisionSlug}`, JSON.stringify({ studentNumber, name }));
}

export function forgetStudentLogin(divisionSlug: string) {
  remove(`${STUDENT_PREFIX}${divisionSlug}`);
}

/** 운영 계정은 이메일만 담는다. 비밀번호는 브라우저 암호 관리자에 맡긴다. */
export function readStaffEmail() {
  return read(STAFF_EMAIL_KEY) ?? "";
}

export function rememberStaffEmail(email: string) {
  write(STAFF_EMAIL_KEY, email);
}

export function forgetStaffEmail() {
  remove(STAFF_EMAIL_KEY);
}
