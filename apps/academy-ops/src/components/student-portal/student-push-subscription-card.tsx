"use client";

import { Bell, BellOff, Smartphone } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type StudentPushSubscriptionCardProps = {
  studentName: string;
};

type PermissionState = "default" | "denied" | "granted";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

function toUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4 || 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(normalized);

  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "요청 처리에 실패했습니다.");
  }

  return payload;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.ready;
}

export function StudentPushSubscriptionCard({
  studentName,
}: StudentPushSubscriptionCardProps) {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof Notification === "undefined") {
      return "default";
    }

    return Notification.permission;
  });
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        Boolean(VAPID_PUBLIC_KEY);

      if (!cancelled) {
        setIsSupported(supported);
        setPermission(typeof Notification === "undefined" ? "default" : Notification.permission);
      }

      if (!supported) {
        return;
      }

      try {
        const registration = await getRegistration();
        const subscription = await registration.pushManager.getSubscription();

        if (!cancelled) {
          setHasSubscription(Boolean(subscription));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "알림 상태를 확인하지 못했습니다.",
          );
        }
      }
    }

    void loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  function subscribe() {
    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);

        if (nextPermission !== "granted") {
          throw new Error("브라우저 알림 권한을 허용해 주세요.");
        }

        const registration = await getRegistration();
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        await requestJson("/api/student/push/subscribe", {
          method: "POST",
          body: JSON.stringify(subscription.toJSON()),
        });

        setHasSubscription(true);
        setNoticeMessage(`${studentName}님의 기기에 공지 푸시 알림을 연결했습니다.`);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "푸시 알림 연결에 실패했습니다.",
        );
      }
    });
  }

  function unsubscribe() {
    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const registration = await getRegistration();
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          await requestJson("/api/student/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }

        setHasSubscription(false);
        setNoticeMessage("공지 푸시 알림을 해제했습니다.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "푸시 알림 해제에 실패했습니다.",
        );
      }
    });
  }

  const statusLabel = !isSupported
    ? "이 기기에서는 지원되지 않음"
    : hasSubscription
      ? "알림 수신 중"
      : permission === "denied"
        ? "브라우저에서 차단됨"
        : "연결 필요";

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-forest">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Web Push
          </div>
          <h2 className="mt-4 text-xl font-semibold">공지 푸시 알림</h2>
          <p className="mt-3 text-sm leading-7 text-slate">
            새 공지가 게시되면 {studentName}님의 기기로 바로 알려줍니다. iPhone 또는 iPad에서는
            Safari PWA와 iOS 16.4 이상에서만 동작합니다.
          </p>
        </div>

        <span className={`inline-flex min-h-12 items-center rounded-full border px-4 py-2 text-sm font-semibold ${
          hasSubscription
            ? "border-forest/20 bg-forest/10 text-forest"
            : "border-ink/10 bg-mist text-slate"
        }`}>
          {statusLabel}
        </span>
      </div>

      {noticeMessage ? (
        <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {noticeMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={subscribe}
          disabled={isPending || !isSupported || hasSubscription}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          알림 받기
        </button>
        <button
          type="button"
          onClick={unsubscribe}
          disabled={isPending || !isSupported || !hasSubscription}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BellOff className="h-4 w-4" aria-hidden="true" />
          알림 중지
        </button>
      </div>
    </section>
  );
}
