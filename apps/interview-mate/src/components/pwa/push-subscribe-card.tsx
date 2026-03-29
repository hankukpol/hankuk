"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, LoaderCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

type PushSubscribeCardProps = {
  token: string;
};

type PushSubscriptionKeys = {
  p256dh?: string;
  auth?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from(rawData.split("").map((char) => char.charCodeAt(0)));
}

async function getRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  const existing = await navigator.serviceWorker.getRegistration();

  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.register("/sw.js");
}

export function PushSubscribeCard({ token }: PushSubscribeCardProps) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const isConfigured = vapidPublicKey.trim().length > 0;
  const [isSupportChecked, setIsSupportChecked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setIsSupported(supported);
    setPermission(
      typeof Notification === "undefined" ? "default" : Notification.permission,
    );
    setIsSupportChecked(true);
  }, []);

  const syncSubscription = useCallback(async () => {
    if (!isSupportChecked || !isSupported) {
      return;
    }

    const registration = await getRegistration();

    if (!registration) {
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    setPermission(Notification.permission);
    setEndpoint(subscription?.endpoint ?? null);
  }, [isSupportChecked, isSupported]);

  useEffect(() => {
    void syncSubscription().catch(() => undefined);
  }, [syncSubscription]);

  const handleSubscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error("현재 브라우저에서는 웹 푸시 알림을 지원하지 않습니다.");
      return;
    }

    if (!isConfigured) {
      toast.error("알림 기능이 아직 설정되지 않았습니다.");
      return;
    }

    setIsBusy(true);

    try {
      const nextPermission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        toast.error("알림 권한이 허용되지 않았습니다.");
        return;
      }

      const registration = await getRegistration();

      if (!registration) {
        throw new Error("service_worker_unavailable");
      }

      const existingSubscription =
        await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const subscriptionJson = subscription.toJSON();
      const keys = (subscriptionJson.keys ?? {}) as PushSubscriptionKeys;

      if (!subscription.endpoint || !keys.p256dh || !keys.auth) {
        throw new Error("invalid_subscription");
      }

      await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "x-access-token": token,
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        }),
      }).then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "알림 구독을 저장하지 못했습니다.");
        }
      });

      setEndpoint(subscription.endpoint);
      toast.success("웹 푸시 알림 구독을 완료했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "웹 푸시 알림 구독을 완료하지 못했습니다.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [isConfigured, isSupported, token, vapidPublicKey]);

  const handleUnsubscribe = useCallback(async () => {
    if (!isSupported) {
      return;
    }

    setIsBusy(true);

    try {
      const registration = await getRegistration();
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (!subscription?.endpoint) {
        setEndpoint(null);
        return;
      }

      await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "x-access-token": token,
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      }).then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "알림 구독 해제를 저장하지 못했습니다.");
        }
      });

      await subscription.unsubscribe();
      setEndpoint(null);
      toast.success("웹 푸시 알림 구독을 해제했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "웹 푸시 알림 구독을 해제하지 못했습니다.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [isSupported, token]);

  const badgeTone = endpoint
    ? "success"
    : !isSupportChecked || !isSupported || !isConfigured
      ? "neutral"
      : permission === "denied"
        ? "danger"
        : "warning";

  const badgeLabel = endpoint
    ? "구독 중"
    : !isSupportChecked
      ? "확인 중"
      : !isSupported
        ? "미지원"
        : !isConfigured
          ? "준비 중"
          : permission === "denied"
            ? "차단됨"
            : "미구독";

  const description = !isSupportChecked
    ? "브라우저 지원 여부와 현재 알림 상태를 확인하고 있습니다."
    : !isSupported
      ? "현재 브라우저에서는 웹 푸시 알림을 사용할 수 없습니다."
      : !isConfigured
        ? "환경 변수 설정 후 웹 푸시 알림 기능을 활성화할 수 있습니다."
        : permission === "denied"
          ? "브라우저 알림 권한이 차단되어 있습니다. 브라우저 설정에서 권한을 다시 허용해 주세요."
          : endpoint
            ? "이 기기에서 대기 상태 변경과 방 배정 공지를 브라우저 알림으로 받습니다."
            : "알림 받기를 누르면 현재 기기에 웹 푸시 알림이 등록됩니다.";

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[var(--division-color)]" />
            <p className="text-sm font-semibold text-slate-900">웹 푸시 알림</p>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            대기 상태 변경, 방 배정, 운영 공지를 브라우저 알림으로 받을 수 있습니다.
          </p>
        </div>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>

      <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        {description}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {endpoint ? (
          <button
            type="button"
            onClick={() => void handleUnsubscribe()}
            disabled={isBusy || !isSupportChecked}
            className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            알림 해제
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={
              isBusy || !isSupportChecked || !isSupported || !isConfigured
            }
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--division-color)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            알림 받기
          </button>
        )}
      </div>
    </div>
  );
}
