import { errorResponse, jsonResponse } from "@/lib/http";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PushSubscriptionPayload = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
};

export async function POST(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const body = (await request.json().catch(() => ({}))) as PushSubscriptionPayload;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.p256dh?.trim();
  const auth = body.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return errorResponse("푸시 구독 정보가 올바르지 않습니다.");
  }

  const now = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      student_id: student.id,
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      user_agent: request.headers.get("user-agent"),
      updated_at: now,
      last_seen_at: now,
    },
    {
      onConflict: "endpoint",
    },
  );

  if (error) {
    return errorResponse("알림 구독을 저장하지 못했습니다.", 500);
  }

  return jsonResponse({
    subscribed: true,
    endpoint,
  });
}

export async function DELETE(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const body = (await request.json().catch(() => ({}))) as PushSubscriptionPayload;
  const endpoint = body.endpoint?.trim();

  if (!endpoint) {
    return errorResponse("해제할 구독 정보가 없습니다.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("student_id", student.id)
    .eq("endpoint", endpoint);

  if (error) {
    return errorResponse("알림 구독을 해제하지 못했습니다.", 500);
  }

  return jsonResponse({
    subscribed: false,
    endpoint,
  });
}
