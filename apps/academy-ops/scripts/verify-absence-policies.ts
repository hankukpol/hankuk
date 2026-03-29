import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AbsenceCategory } from "@prisma/client";
import {
  createAbsencePolicy,
  deleteAbsencePolicy,
  listAbsencePolicies,
  updateAbsencePolicy,
} from "../src/lib/absence-policies/service";
import { getPrisma } from "../src/lib/prisma";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

async function main() {
  loadLocalEnv();

  const prisma = getPrisma();
  const admin = await prisma.adminUser.findFirst({
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  assert.ok(admin, "검증에 사용할 관리자 계정을 찾지 못했습니다.");

  const suffix = `${Date.now()}`;
  const createdPolicyIds: number[] = [];

  try {
    const perfectAttendancePolicy = await createAbsencePolicy({
      adminId: admin.id,
      payload: {
        name: `verify-perfect-${suffix}`,
        absenceCategory: AbsenceCategory.OTHER,
        attendCountsAsAttendance: false,
        attendGrantsPerfectAttendance: true,
        isActive: true,
        sortOrder: 101,
      },
    });
    createdPolicyIds.push(perfectAttendancePolicy.id);
    assert.equal(perfectAttendancePolicy.attendCountsAsAttendance, true);
    assert.equal(perfectAttendancePolicy.attendGrantsPerfectAttendance, true);

    const attendanceOnlyPolicy = await createAbsencePolicy({
      adminId: admin.id,
      payload: {
        name: `verify-attendance-${suffix}`,
        absenceCategory: AbsenceCategory.OTHER,
        attendCountsAsAttendance: true,
        attendGrantsPerfectAttendance: false,
        isActive: true,
        sortOrder: 102,
      },
    });
    createdPolicyIds.push(attendanceOnlyPolicy.id);
    assert.equal(attendanceOnlyPolicy.attendCountsAsAttendance, true);
    assert.equal(attendanceOnlyPolicy.attendGrantsPerfectAttendance, false);

    const militaryPolicy = await createAbsencePolicy({
      adminId: admin.id,
      payload: {
        name: `verify-military-${suffix}`,
        absenceCategory: AbsenceCategory.MILITARY,
        attendCountsAsAttendance: false,
        attendGrantsPerfectAttendance: false,
        isActive: true,
        sortOrder: 103,
      },
    });
    createdPolicyIds.push(militaryPolicy.id);
    assert.equal(militaryPolicy.attendCountsAsAttendance, true);
    assert.equal(militaryPolicy.attendGrantsPerfectAttendance, true);

    const updatedAttendancePolicy = await updateAbsencePolicy({
      adminId: admin.id,
      policyId: attendanceOnlyPolicy.id,
      payload: {
        name: attendanceOnlyPolicy.name,
        absenceCategory: AbsenceCategory.OTHER,
        attendCountsAsAttendance: false,
        attendGrantsPerfectAttendance: false,
        isActive: false,
        sortOrder: 999,
      },
    });
    assert.equal(updatedAttendancePolicy.attendCountsAsAttendance, false);
    assert.equal(updatedAttendancePolicy.attendGrantsPerfectAttendance, false);
    assert.equal(updatedAttendancePolicy.isActive, false);
    assert.equal(updatedAttendancePolicy.sortOrder, 999);

    const activePolicies = await listAbsencePolicies({ activeOnly: true });
    assert.equal(activePolicies.some((policy) => policy.id === perfectAttendancePolicy.id), true);
    assert.equal(activePolicies.some((policy) => policy.id === updatedAttendancePolicy.id), false);
    assert.equal(activePolicies.some((policy) => policy.id === militaryPolicy.id), true);

    console.log(
      JSON.stringify(
        {
          verified: true,
          created: {
            perfectAttendancePolicy: {
              id: perfectAttendancePolicy.id,
              attendCountsAsAttendance: perfectAttendancePolicy.attendCountsAsAttendance,
              attendGrantsPerfectAttendance: perfectAttendancePolicy.attendGrantsPerfectAttendance,
            },
            attendanceOnlyPolicy: {
              id: attendanceOnlyPolicy.id,
              attendCountsAsAttendance: attendanceOnlyPolicy.attendCountsAsAttendance,
              attendGrantsPerfectAttendance: attendanceOnlyPolicy.attendGrantsPerfectAttendance,
            },
            militaryPolicy: {
              id: militaryPolicy.id,
              attendCountsAsAttendance: militaryPolicy.attendCountsAsAttendance,
              attendGrantsPerfectAttendance: militaryPolicy.attendGrantsPerfectAttendance,
            },
          },
          updated: {
            attendanceOnlyPolicy: {
              id: updatedAttendancePolicy.id,
              attendCountsAsAttendance: updatedAttendancePolicy.attendCountsAsAttendance,
              attendGrantsPerfectAttendance: updatedAttendancePolicy.attendGrantsPerfectAttendance,
              isActive: updatedAttendancePolicy.isActive,
              sortOrder: updatedAttendancePolicy.sortOrder,
            },
          },
          activePolicyCount: activePolicies.length,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const policyId of [...createdPolicyIds].reverse()) {
      try {
        await deleteAbsencePolicy({
          adminId: admin.id,
          policyId,
        });
      } catch {
        // Ignore cleanup failures for already-removed records.
      }
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});