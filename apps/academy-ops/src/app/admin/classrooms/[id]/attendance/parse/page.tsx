import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { KakaoChatParser } from "./kakao-chat-parser";

export const dynamic = "force-dynamic";

export interface ClassroomStudentInfo {
  examNumber: string;
  name: string;
  generation: number | null;
}

export default async function AttendanceParseDedicatedPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = params;

  const classroom = await getPrisma().classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      generation: true,
      students: {
        where: { leftAt: null },
        select: {
          student: {
            select: {
              examNumber: true,
              name: true,
              generation: true,
            },
          },
        },
      },
    },
  });

  if (!classroom) notFound();

  const students: ClassroomStudentInfo[] = classroom.students.map((cs) => ({
    examNumber: cs.student.examNumber,
    name: cs.student.name,
    generation: cs.student.generation,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/classrooms" className="text-sm text-slate hover:text-ink">
          담임반 목록
        </Link>
        <span className="text-slate/40 text-sm">/</span>
        <Link
          href={`/admin/classrooms/${id}`}
          className="text-sm text-slate hover:text-ink"
        >
          {classroom.name}
        </Link>
        <span className="text-slate/40 text-sm">/</span>
        <span className="text-sm text-ink">카카오 파싱</span>
      </div>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 파싱
      </div>
      <h1 className="mt-5 text-3xl font-semibold">카카오톡 출석 파싱</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오톡 채팅방에서 내보낸 텍스트를 붙여넣으면 출석 키워드가 포함된 메시지를 자동으로
        인식합니다. iOS·Android 내보내기 형식을 모두 지원합니다.
      </p>

      {/* 형식 안내 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-5 py-4">
          <p className="text-xs font-semibold text-slate mb-2">iOS 내보내기 형식</p>
          <pre className="text-xs font-mono text-slate/80 leading-5 whitespace-pre-wrap">
{`2024년 3월 15일 오전 10:02, 홍길동 : 출석
2024년 3월 15일 오전 10:03, 김철수 : 출석합니다`}
          </pre>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 px-5 py-4">
          <p className="text-xs font-semibold text-slate mb-2">Android 내보내기 형식</p>
          <pre className="text-xs font-mono text-slate/80 leading-5 whitespace-pre-wrap">
{`[홍길동] [오전 10:02] 출석
[김철수] [오전 10:03] 출석합니다`}
          </pre>
        </div>
      </div>

      <div className="mt-8">
        <KakaoChatParser
          classroomId={classroom.id}
          classroomName={classroom.name}
          students={students}
        />
      </div>
    </div>
  );
}
