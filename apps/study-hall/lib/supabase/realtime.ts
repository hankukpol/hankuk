"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * 직원 채팅 실시간 신호.
 *
 * 이벤트에서 메시지 내용을 읽지 않는다. "뭔가 바뀌었다"는 신호만 받고
 * 실제 데이터는 앱의 API 로 다시 가져온다. 그래서 직렬화 경로가 하나로 유지되고,
 * 실시간이 안 되면 폴링으로 그대로 내려앉는다.
 *
 * 연결되지 않는 경우가 실제로 존재한다.
 * - 포털 브리지로 로그인하면 Supabase 세션 쿠키가 없다.
 * - 앱 세션(30일)이 Supabase 세션보다 오래 살아남을 수 있다.
 * - MOCK_MODE 에서는 createBrowserClient 가 예외를 던진다.
 * 따라서 "세션 없음"은 오류가 아니라 정상 상태로 다룬다.
 */

export type ChatRealtimeStatus = "connected" | "unavailable";

type SubscribeHandlers = {
  onSignal: () => void;
  onStatus: (status: ChatRealtimeStatus) => void;
};

const SUBSCRIBE_TIMEOUT_MS = 8000;

export function subscribeToChatSignal(
  divisionId: string,
  { onSignal, onStatus }: SubscribeHandlers,
): () => void {
  let disposed = false;
  let cleanup: (() => void) | null = null;

  const markUnavailable = () => {
    if (!disposed) {
      onStatus("unavailable");
    }
  };

  void (async () => {
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        // 포털 브리지 경로. 오류가 아니다.
        markUnavailable();
        return;
      }

      if (disposed) {
        return;
      }

      // 구독 전에 명시적으로 토큰을 넘긴다.
      // 쿠키 저장소를 쓰면 내부 onAuthStateChange 연결이 경합에 질 수 있다.
      supabase.realtime.setAuth(session.access_token);

      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, nextSession: Session | null) => {
          if (event === "TOKEN_REFRESHED" && nextSession) {
            supabase.realtime.setAuth(nextSession.access_token);
          }
        },
      );

      const channel = supabase
        .channel(`study-hall-chat-${divisionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "study_hall",
            table: "chat_messages",
            filter: `division_id=eq.${divisionId}`,
          },
          () => {
            if (!disposed) {
              onSignal();
            }
          },
        );

      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          markUnavailable();
        }
      }, SUBSCRIBE_TIMEOUT_MS);

      channel.subscribe((status: string) => {
        if (disposed) {
          return;
        }

        if (status === "SUBSCRIBED") {
          settled = true;
          clearTimeout(timeout);
          onStatus("connected");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          settled = true;
          clearTimeout(timeout);
          markUnavailable();
        }
      });

      cleanup = () => {
        clearTimeout(timeout);
        authListener.subscription.unsubscribe();
        void supabase.removeChannel(channel);
      };

      if (disposed) {
        cleanup();
        cleanup = null;
      }
    } catch {
      // 환경변수 미설정(MOCK_MODE)이나 로컬 가드에서 던지는 경우가 여기로 온다.
      markUnavailable();
    }
  })();

  return () => {
    disposed = true;
    cleanup?.();
    cleanup = null;
  };
}
