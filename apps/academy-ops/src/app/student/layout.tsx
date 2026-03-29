import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "sonner";
import { StudentBottomNav } from "@/components/student-portal/student-bottom-nav";
import { StudentLogoutButton } from "@/components/student-portal/student-logout-button";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getOrCreatePointBalance } from "@/lib/points/balance";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAcademyRuntimeBranding();

  return {
    title: {
      default: branding.studentPortalName,
      template: `%s | ${branding.academyName}`,
    },
    description: branding.studentPortalDescription,
  };
}

async function getPointBalance(examNumber: string): Promise<number> {
  try {
    // Try fast path: read from point_balances table, falling back to log aggregation
    const row = await getPrisma().pointBalance.findUnique({ where: { examNumber } });
    if (row) return row.balance;
    return await getOrCreatePointBalance(examNumber);
  } catch {
    return 0;
  }
}

async function getUnreadNotificationCount(examNumber: string): Promise<number> {
  try {
    return await getPrisma().notificationLog.count({
      where: { examNumber, isRead: false },
    });
  } catch {
    return 0;
  }
}

export default async function StudentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [viewer, branding] = await Promise.all([
    getStudentPortalViewer(),
    getAcademyRuntimeBranding(),
  ]);
  const pointBalance =
    viewer && hasDatabaseConfig() ? await getPointBalance(viewer.examNumber) : null;
  const unreadNotificationCount =
    viewer && hasDatabaseConfig() ? await getUnreadNotificationCount(viewer.examNumber) : 0;

  return (
    <div className="min-h-screen bg-mist text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-4 sm:px-5">
        <header className="sticky top-0 z-30 mb-4 overflow-hidden rounded-[28px] border border-white/80 bg-white/90 px-5 py-4 shadow-panel backdrop-blur">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-ember/12 via-transparent to-forest/10"
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ember">
                학생 포털
              </p>
              <Link href="/student" className="mt-2 block text-lg font-semibold">
                {branding.studentPortalName}
              </Link>
              <p className="mt-2 text-xs leading-6 text-slate">
                {viewer
                  ? `${viewer.name} · ${viewer.examNumber}`
                  : branding.studentPortalDescription}
              </p>
            </div>

            {viewer ? (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {pointBalance !== null && (
                    <Link
                      href="/student/points"
                      className="inline-flex items-center gap-1 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                      title="내 포인트"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v2m0 8v2M8 12h8" />
                      </svg>
                      {pointBalance.toLocaleString()}P
                    </Link>
                  )}
                  <Link
                    href="/student/notifications"
                    className="relative inline-flex items-center justify-center rounded-full border border-ink/10 p-2 transition hover:border-ember/30 hover:text-ember"
                    title="알림"
                    aria-label="알림 내역"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ember text-[9px] font-bold text-white">
                        {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                      </span>
                    )}
                  </Link>
                </div>
                <StudentLogoutButton className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60" />
              </div>
            ) : (
              <Link
                href="/student/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
              >
                로그인
              </Link>
            )}
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      <StudentBottomNav />
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
