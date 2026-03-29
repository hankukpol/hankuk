import { errorResponse, jsonResponse } from "@/lib/http";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type ProfilePayload = {
  intro?: string | null;
  showPhone?: boolean;
};

type ProfileRow = {
  student_id: string;
  intro: string | null;
  show_phone: boolean;
  updated_at: string;
};

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  region: string;
  series: string;
};

async function getProfile(studentId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select("student_id, intro, show_phone, updated_at")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProfileRow | null;
}

async function getStudent(studentId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("students")
    .select("id, name, phone, region, series")
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StudentRow | null;
}

async function ensureSameJoinedRoom(viewerStudentId: string, targetStudentId: string) {
  if (viewerStudentId === targetStudentId) {
    return true;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("room_members")
    .select("student_id, room_id")
    .in("student_id", [viewerStudentId, targetStudentId])
    .eq("status", "joined");

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const viewerMembership = rows.find((row) => row.student_id === viewerStudentId);
  const targetMembership = rows.find((row) => row.student_id === targetStudentId);

  return Boolean(
    viewerMembership &&
      targetMembership &&
      viewerMembership.room_id === targetMembership.room_id,
  );
}

export async function GET(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const targetStudentId = searchParams.get("student_id")?.trim() || student.id;
  const canRead = await ensureSameJoinedRoom(student.id, targetStudentId);

  if (!canRead) {
    return errorResponse("같은 조 방 조원 프로필만 조회할 수 있습니다.", 403);
  }

  const [profile, targetStudent] = await Promise.all([
    getProfile(targetStudentId),
    getStudent(targetStudentId),
  ]);

  if (!targetStudent) {
    return errorResponse("학생 정보를 찾을 수 없습니다.", 404);
  }

  const phoneVisible = targetStudentId === student.id || Boolean(profile?.show_phone);

  return jsonResponse({
    profile: {
      studentId: targetStudent.id,
      name: targetStudent.name,
      region: targetStudent.region,
      series: targetStudent.series,
      intro: profile?.intro ?? null,
      showPhone: profile?.show_phone ?? false,
      phone: phoneVisible ? targetStudent.phone : null,
      updatedAt: profile?.updated_at ?? null,
    },
  });
}

export async function PUT(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("?댁쁺 以묒씤 硫댁젒諛섏쓣 李얠쓣 ???놁뒿?덈떎.", 404);
  }

  if (getApplyWindowStatus(session) === "after_close") {
    return errorResponse("吏??留덇컧 ?댄썑?먮뒗 ?꾨줈?꾩쓣 ?섏젙?????놁뒿?덈떎.", 409);
  }

  const body = (await request.json()) as ProfilePayload;
  const intro = typeof body.intro === "string" ? body.intro.trim() : "";

  if (intro.length > 100) {
    return errorResponse("자기소개는 100자 이하여야 합니다.");
  }

  if (typeof body.showPhone !== "boolean") {
    return errorResponse("연락처 공개 여부가 필요합니다.");
  }

  const now = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("student_profiles").upsert(
    {
      student_id: student.id,
      intro: intro || null,
      show_phone: body.showPhone,
      updated_at: now,
    },
    {
      onConflict: "student_id",
    },
  );

  if (error) {
    return errorResponse("프로필을 저장하지 못했습니다.", 500);
  }

  return jsonResponse({
    profile: {
      studentId: student.id,
      name: student.name,
      region: student.region,
      series: student.series,
      intro: intro || null,
      showPhone: body.showPhone,
      phone: student.phone,
      updatedAt: now,
    },
  });
}
