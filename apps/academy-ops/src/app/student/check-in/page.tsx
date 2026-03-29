import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/auth/require-student";
import { CheckInClient } from "./check-in-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: { token?: string };
};

type QrPayload = {
  sessionId: string;
  exp: number;
};

function parseQrToken(token: string): QrPayload | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const payload = JSON.parse(decoded) as unknown;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "sessionId" in payload &&
      "exp" in payload &&
      typeof (payload as QrPayload).sessionId === "string" &&
      typeof (payload as QrPayload).exp === "number"
    ) {
      return payload as QrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatSessionDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = DAY_LABELS[date.getDay()];
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} (${dow})`;
}

export default async function CheckInPage({ searchParams }: PageProps) {
  const { token } = searchParams;

  // 토큰 없음
  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">유효하지 않은 QR 코드</h1>
          <p className="mt-2 text-sm text-slate">올바른 QR 코드를 스캔해 주세요.</p>
        </div>
      </main>
    );
  }

  // 토큰 파싱
  const payload = parseQrToken(token);

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">QR 코드 오류</h1>
          <p className="mt-2 text-sm text-slate">QR 코드 형식이 올바르지 않습니다.</p>
        </div>
      </main>
    );
  }

  // 만료 확인
  if (Date.now() > payload.exp) {
    const expiredAt = new Date(payload.exp);
    const expiredStr = `${expiredAt.getHours().toString().padStart(2, "0")}:${expiredAt.getMinutes().toString().padStart(2, "0")}`;
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">QR 코드 만료됨</h1>
          <p className="mt-2 text-sm text-slate">
            이 QR 코드는 {expiredStr}에 만료되었습니다.
          </p>
          <p className="mt-1 text-sm text-slate">담당 선생님께 새 QR 코드를 요청해 주세요.</p>
        </div>
      </main>
    );
  }

  // 세션 조회
  const session = await getPrisma().lectureSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
    },
  });

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-ink">강의 세션을 찾을 수 없습니다.</h1>
          <p className="mt-2 text-sm text-slate">QR 코드가 유효하지 않습니다.</p>
        </div>
      </main>
    );
  }

  if (session.isCancelled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-red-600">취소된 강의입니다.</h1>
          <p className="mt-2 text-sm text-slate">이 강의 세션은 취소되었습니다.</p>
        </div>
      </main>
    );
  }

  // 학생 세션 확인 (로그인 필요)
  let student: Awaited<ReturnType<typeof requireStudent>> | null = null;

  try {
    student = await requireStudent();
  } catch {
    // 로그인 필요 → 로그인 후 이 페이지로 돌아오도록
    redirect(`/student/login?redirectTo=${encodeURIComponent(`/student/check-in?token=${token}`)}`);
  }

  // 이미 체크인했는지 확인
  const existing = await getPrisma().lectureAttendance.findUnique({
    where: {
      sessionId_studentId: {
        sessionId: payload.sessionId,
        studentId: student.examNumber,
      },
    },
  });

  const sessionDateFormatted = formatSessionDate(session.sessionDate);

  const sessionInfo = {
    id: session.id,
    subjectName: session.schedule.subjectName,
    cohortName: session.schedule.cohort.name,
    sessionDate: sessionDateFormatted,
    startTime: session.startTime,
    endTime: session.endTime,
    instructorName: session.schedule.instructorName ?? null,
  };

  const studentInfo = {
    examNumber: student.examNumber,
    name: student.name,
  };

  if (existing) {
    const checkedAtStr = existing.checkedAt.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
        <div className="w-full max-w-sm rounded-[28px] border border-forest/20 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest/10">
            <svg className="h-9 w-9 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">이미 출석 처리됨</h1>
          <p className="mt-2 text-sm text-slate">
            {studentInfo.name} ({studentInfo.examNumber}) 학생은
          </p>
          <p className="text-sm text-slate">
            {checkedAtStr}에 이미{" "}
            <span
              className={`font-semibold ${existing.status === "PRESENT" ? "text-forest" : "text-amber-700"}`}
            >
              {existing.status === "PRESENT" ? "출석" : existing.status === "LATE" ? "지각" : existing.status}
            </span>
            으로 처리되었습니다.
          </p>
          <div className="mt-4 rounded-2xl bg-mist p-3 text-sm">
            <p className="text-slate">{sessionInfo.subjectName} · {sessionInfo.sessionDate}</p>
            <p className="text-slate">{sessionInfo.startTime} ~ {sessionInfo.endTime}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-4 py-8">
      <CheckInClient
        token={token}
        sessionInfo={sessionInfo}
        studentInfo={studentInfo}
      />
    </main>
  );
}
