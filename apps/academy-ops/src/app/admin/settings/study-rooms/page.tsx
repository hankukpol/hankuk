import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StudyRoomSettingsManager } from "./study-room-settings-manager";

export const dynamic = "force-dynamic";

export type StudyRoomRow = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  bookingCount: number;
};

export default async function StudyRoomSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const rooms = await getPrisma().studyRoom.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { bookings: true } },
    },
  });

  const rows: StudyRoomRow[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    description: r.description,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    bookingCount: r._count.bookings,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">스터디룸 목록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        스터디룸을 등록하고 관리합니다. 여기서 등록된 룸만 예약 화면에 표시됩니다.
        정렬 순서로 화면 표시 순서를 조정할 수 있습니다.
      </p>
      <div className="mt-8">
        <StudyRoomSettingsManager initialRooms={rows} />
      </div>
    </div>
  );
}
