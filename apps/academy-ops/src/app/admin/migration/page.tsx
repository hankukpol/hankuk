import { AdminRole, type Prisma } from "@prisma/client";
import { MigrationWorkbench } from "@/components/migration/migration-workbench";
import { EnrollmentPaymentMigrationPanels } from "@/components/migration/enrollment-payment-migration-panels";
import { requireAdminContext } from "@/lib/auth";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MIGRATION_ACTION_LABEL: Record<string, string> = {
  MIGRATION_STUDENTS_EXECUTE: "학생 명단",
  MIGRATION_STUDENTS_ROLLBACK: "학생 명단 롤백",
  MIGRATION_SCORES_EXECUTE: "성적 데이터",
  MIGRATION_ENROLLMENT_EXECUTE: "수강 등록",
  MIGRATION_PAYMENT_EXECUTE: "수납 내역",
};

export default async function AdminMigrationPage() {
  const [, recentRuns, rollbackRuns, periods, allMigrationLogs] = await Promise.all([
    requireAdminContext(AdminRole.SUPER_ADMIN),
    getPrisma().auditLog.findMany({
      where: {
        action: "MIGRATION_STUDENTS_EXECUTE",
      },
      include: {
        admin: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
    getPrisma().auditLog.findMany({
      where: {
        action: "MIGRATION_STUDENTS_ROLLBACK",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
    listPeriods(),
    getPrisma().auditLog.findMany({
      where: {
        action: {
          in: [
            "MIGRATION_STUDENTS_EXECUTE",
            "MIGRATION_STUDENTS_ROLLBACK",
            "MIGRATION_SCORES_EXECUTE",
            "MIGRATION_ENROLLMENT_EXECUTE",
            "MIGRATION_PAYMENT_EXECUTE",
          ],
        },
      },
      include: {
        admin: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const rollbackMap = new Map(
    rollbackRuns.map((run) => [String(run.targetId), run] as const),
  );

  const serializedRuns = recentRuns.map((run) => {
    const after = (run.after ?? {}) as Prisma.JsonObject;
    const rollbackRun = rollbackMap.get(String(run.targetId));
    const rollbackAfter = (rollbackRun?.after ?? {}) as Prisma.JsonObject;

    return {
      id: run.id,
      targetId: String(run.targetId),
      createdAt: run.createdAt.toISOString(),
      adminName: run.admin.name,
      fileName: String(after.fileName ?? "-"),
      importedCount: Number(after.importedCount ?? 0),
      createdCount: Array.isArray(after.createdExamNumbers)
        ? after.createdExamNumbers.length
        : 0,
      updatedCount:
        Math.max(
          Number((after.summary as Prisma.JsonObject | undefined)?.updateRows ?? 0),
          0,
        ) || 0,
      skippedCount: Number(after.skippedCount ?? 0),
      rolledBackAt: rollbackRun?.createdAt.toISOString() ?? null,
      rollbackDeletedCount: Number(rollbackAfter.deletedCount ?? 0),
      rollbackRestoredCount: Number(rollbackAfter.restoredCount ?? 0),
      rollbackSkippedDeletes: Array.isArray(rollbackAfter.skippedDeletes)
        ? rollbackAfter.skippedDeletes.map((value) => String(value))
        : [],
    };
  });

  const serializedPeriods = periods.map((period) => ({
    id: period.id,
    name: period.name,
    isActive: period.isActive,
    sessions: period.sessions.map((session) => ({
      id: session.id,
      examType: session.examType,
      week: session.week,
      subject: session.subject,
      examDate: session.examDate.toISOString(),
      isCancelled: session.isCancelled,
    })),
  }));

  const serializedAllLogs = allMigrationLogs.map((log) => {
    const after = (log.after ?? {}) as Prisma.JsonObject;
    return {
      id: log.id,
      action: log.action,
      actionLabel: MIGRATION_ACTION_LABEL[log.action] ?? log.action,
      createdAt: log.createdAt.toISOString(),
      adminName: log.admin.name,
      importedCount: Number(after.importedCount ?? after.createdCount ?? 0),
      fileName: String(after.fileName ?? "-"),
    };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        데이터 마이그레이션
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기존 운영 데이터 마이그레이션</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        에듀그램에서 내보낸 데이터를 현재 시스템으로 이관합니다. 학생 명단과 점수 데이터는 직접 업로드할 수 있고,
        수강 등록·수납 내역은 CSV 양식으로 변환 후 지원팀을 통해 처리합니다.
      </p>

      {/* Warning banner */}
      <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800">
        <span className="font-semibold">주의:</span> 이 기능은 초기 데이터 이관에만 사용합니다.
        운영 중 잘못 반영된 데이터는 롤백 또는 직접 수정이 필요합니다. SUPER_ADMIN 전용입니다.
      </div>

      {/* Section 1 header */}
      <div className="mt-10 flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ember/20 bg-ember/10 text-base font-bold text-ember">
          1
        </div>
        <div>
          <h2 className="text-xl font-semibold">학생 명단 및 성적 데이터</h2>
          <p className="text-sm text-slate">직접 업로드 및 미리보기 가능</p>
        </div>
      </div>

      <div className="mt-4">
        <MigrationWorkbench recentRuns={serializedRuns} periods={serializedPeriods} />
      </div>

      {/* Sections 2 & 3: enrollment and payment panels */}
      <div className="mt-8 space-y-6">
        <EnrollmentPaymentMigrationPanels />
      </div>

      {/* Migration log */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">마이그레이션 전체 이력</h2>
        <p className="mt-1 text-sm text-slate">
          시스템에 반영된 모든 마이그레이션 작업 로그입니다.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-5 py-4 font-semibold">날짜/시간</th>
                <th className="px-5 py-4 font-semibold">작업</th>
                <th className="px-5 py-4 font-semibold">작업자</th>
                <th className="px-5 py-4 font-semibold">파일명</th>
                <th className="px-5 py-4 text-right font-semibold">처리 건수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {serializedAllLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate">
                    마이그레이션 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                serializedAllLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-mist/40">
                    <td className="px-5 py-4 text-slate">
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          log.action.includes("ROLLBACK")
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-forest/20 bg-forest/10 text-forest"
                        }`}
                      >
                        {log.actionLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4">{log.adminName}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate">{log.fileName}</td>
                    <td className="px-5 py-4 text-right">
                      {log.importedCount > 0 ? (
                        <span className="font-semibold">{log.importedCount.toLocaleString()}건</span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
