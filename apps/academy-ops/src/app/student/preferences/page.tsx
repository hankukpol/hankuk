import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getPrisma } from "@/lib/prisma";
import { PreferenceForm } from "./preference-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림 환경설정",
};

export default async function StudentPreferencesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-4 px-0 py-6">
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-700">
            DB 연결 후 사용할 수 있습니다.
          </p>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    redirect("/student/login?redirectTo=/student/preferences");
  }

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examNumber: viewer.examNumber },
    select: {
      examNumber: true,
      name: true,
      notificationConsent: true,
      consentedAt: true,
    },
  });

  if (!student) {
    redirect("/student/login");
  }

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              Preferences
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
              알림 환경설정
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate">
              {student.name}님의 알림 수신 환경을 설정합니다.
            </p>
            {student.consentedAt && (
              <p className="mt-1 text-xs text-slate">
                마지막 동의:{" "}
                {new Date(student.consentedAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student/notifications"
              className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              ?? ??
            </Link>
            <Link
              href="/student/settings"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              설정으로
            </Link>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털 홈
            </Link>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-6">
          <span
            className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
              student.notificationConsent
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-ink/10 bg-mist text-slate"
            }`}
          >
            카카오 알림톡{" "}
            {student.notificationConsent ? "수신 동의됨" : "수신 미동의"}
          </span>
        </div>
      </section>

      {/* Form */}
      <PreferenceForm
        initialNotificationConsent={student.notificationConsent}
      />

      {/* Legal note */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold">개인정보 처리 안내</h2>
        <div className="mt-3 space-y-2 text-xs leading-6 text-slate">
          <p>
            수집 목적: 수강 관련 필수 안내, 성적 발표, 결제 내역 등 서비스 제공을 위한 알림 발송
          </p>
          <p>
            수집 항목: 카카오 계정 연동 정보 (알림톡 발송 시)
          </p>
          <p>
            보유 기간: 수강 종료 후 3년 또는 동의 철회 시까지
          </p>
          <p>
            동의를 거부하셔도 수강 신청 등 기본 서비스 이용에는 제한이 없습니다.
          </p>
        </div>
      </section>
    </main>
  );
}
