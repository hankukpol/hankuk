import webPush from "web-push";

import { createServerSupabaseClient } from "@/lib/supabase/server";

let configured = false;

function ensureConfigured() {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID 키가 설정되지 않았습니다.");
  }

  webPush.setVapidDetails("mailto:admin@hankukpol.co.kr", publicKey, privateKey);
  configured = true;
}

type PushTarget = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

export async function sendPushToStudent(
  studentId: string,
  payload: { title: string; body: string; url?: string },
) {
  ensureConfigured();

  const supabase = createServerSupabaseClient();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("student_id", studentId);

  if (!subscriptions?.length) return { sent: 0, failed: 0 };

  return sendToSubscriptions(subscriptions, payload);
}

export async function sendPushToSession(
  sessionId: string,
  payload: { title: string; body: string; url?: string },
) {
  ensureConfigured();

  const supabase = createServerSupabaseClient();

  const { data: studentIds } = await supabase
    .from("students")
    .select("id")
    .eq("session_id", sessionId);

  if (!studentIds?.length) return { sent: 0, failed: 0 };

  const ids = studentIds.map((s) => s.id);
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .in("student_id", ids);

  if (!subscriptions?.length) return { sent: 0, failed: 0 };

  return sendToSubscriptions(subscriptions, payload);
}

export async function sendPushToAll(
  payload: { title: string; body: string; url?: string },
) {
  ensureConfigured();

  const supabase = createServerSupabaseClient();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key");

  if (!subscriptions?.length) return { sent: 0, failed: 0 };

  return sendToSubscriptions(subscriptions, payload);
}

async function sendToSubscriptions(
  subscriptions: PushTarget[],
  payload: { title: string; body: string; url?: string },
) {
  const supabase = createServerSupabaseClient();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key,
            },
          },
          body,
        );
        sent++;
      } catch (error) {
        failed++;
        if (
          error instanceof webPush.WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          expiredIds.push(sub.id);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds);
  }

  return { sent, failed, cleaned: expiredIds.length };
}
