"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import RescoreNotificationModal, {
  type RescoreNotificationItem,
} from "@/components/notification/RescoreNotificationModal";

interface NotificationResponse {
  unreadCount: number;
  notifications: RescoreNotificationItem[];
  error?: string;
}

export default function NotificationBell() {
  const { status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<RescoreNotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [markingEventId, setMarkingEventId] = useState<number | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/rescore", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        setUnreadCount(0);
        setNotifications([]);
        return;
      }

      const data = (await response.json()) as NotificationResponse;
      setUnreadCount(data.unreadCount ?? 0);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setUnreadCount(0);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }

    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [loadNotifications, status]);

  const handleMarkAsRead = useCallback(
    async (rescoreEventId: number) => {
      setMarkingEventId(rescoreEventId);
      try {
        await fetch("/api/notifications/rescore/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rescoreEventId }),
        });
      } finally {
        setMarkingEventId(null);
        await loadNotifications();
      }
    },
    [loadNotifications]
  );

  if (status !== "authenticated") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-md p-2 text-white/85 transition hover:bg-white/10 hover:text-white"
        title="정답키 변경 알림"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <RescoreNotificationModal
        open={open}
        unreadCount={unreadCount}
        notifications={notifications}
        onClose={() => setOpen(false)}
        onMarkAsRead={handleMarkAsRead}
        markingEventId={markingEventId}
      />
    </>
  );
}
