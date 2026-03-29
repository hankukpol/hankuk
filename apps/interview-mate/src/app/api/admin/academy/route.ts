import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("academy_settings")
    .select("id, academy_name, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return errorResponse("학원 설정을 불러오지 못했습니다.", 500);
  }

  if (!data) {
    return jsonResponse({
      academyName: "한국경찰학원",
      updatedAt: null,
    });
  }

  return jsonResponse({
    id: data.id,
    academyName: data.academy_name,
    updatedAt: data.updated_at,
  });
}

export async function PATCH(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as {
    academyName?: string;
  };
  const academyName = body.academyName?.trim();

  if (!academyName) {
    return errorResponse("학원 이름을 입력해주세요.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("academy_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("academy_settings")
      .update({
        academy_name: academyName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, academy_name, updated_at")
      .single();

    if (error) {
      return errorResponse("학원 설정을 저장하지 못했습니다.", 500);
    }

    return jsonResponse({
      id: data.id,
      academyName: data.academy_name,
      updatedAt: data.updated_at,
    });
  }

  const { data, error } = await supabase
    .from("academy_settings")
    .insert({
      academy_name: academyName,
    })
    .select("id, academy_name, updated_at")
    .single();

  if (error) {
    return errorResponse("학원 설정을 생성하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      id: data.id,
      academyName: data.academy_name,
      updatedAt: data.updated_at,
    },
    { status: 201 },
  );
}
