import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getPrisma } from "@/lib/prisma";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "설정",
};

export default async function StudentSettingsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-4">
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-700">DB 연결 정보가 설정되지 않았습니다.</p>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    redirect("/student/login?redirectTo=/student/settings");
  }

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examNumber: viewer.examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      notificationConsent: true,
      consentedAt: true,
      registeredAt: true,
      examType: true,
      className: true,
      generation: true,
    },
  });

  if (!student) {
    redirect("/student/login");
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ember">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold">설정</h1>
        </div>
        <Link
          href="/student"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          홈으로
        </Link>
      </div>

      <SettingsClient
        student={{
          examNumber: student.examNumber,
          name: student.name,
          mobile: student.phone ?? null,
          email: student.email ?? null,
          birthDate: student.birthDate ? student.birthDate.toISOString() : null,
          notificationConsent: student.notificationConsent,
          consentedAt: student.consentedAt,
          registeredAt: student.registeredAt,
          examType: student.examType,
          className: student.className ?? null,
          generation: student.generation ?? null,
        }}
      />
    </main>
  );
}
