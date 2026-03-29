import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ClassroomManager } from "@/components/classrooms/classroom-manager";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const [classrooms, teachers] = await Promise.all([
    getPrisma().classroom.findMany({
      where: { isActive: true },
      include: {
        teacher: { select: { name: true } },
        _count: { select: { students: { where: { leftAt: null } } } },
      },
      orderBy: [{ generation: "desc" }, { name: "asc" }],
    }),
    getPrisma().adminUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        학사 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">담임반 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        담임반을 편성하고 학생을 배정합니다. 각 반의 담임 선생님이 카카오톡 출석 파싱 및 출결
        기록을 관리합니다.
      </p>
      <div className="mt-8">
        <ClassroomManager
          initialClassrooms={classrooms as ClassroomRow[]}
          teachers={teachers}
        />
      </div>
    </div>
  );
}

// Type for the classroom rows passed to the client
export type ClassroomRow = {
  id: string;
  name: string;
  generation: number | null;
  note: string | null;
  isActive: boolean;
  teacherId: string;
  teacher: { name: string };
  _count: { students: number };
};
