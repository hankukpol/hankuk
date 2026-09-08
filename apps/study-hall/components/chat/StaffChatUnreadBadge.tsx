"use client";

import { formatUnreadBadge } from "@/lib/chat-meta";
import { useChatUnreadCount } from "@/lib/chat-store";

type StaffChatUnreadBadgeProps = {
  className?: string;
};

/**
 * 검은 사이드바 레일과 하단 탐색에 올리는 안읽음 알약.
 * .admin-badge 는 밝은 배경 전용이라 여기서는 쓸 수 없다.
 */
export function StaffChatUnreadBadge({ className = "" }: StaffChatUnreadBadgeProps) {
  const count = useChatUnreadCount();

  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`admin-nav-badge${className ? ` ${className}` : ""}`}
      aria-label={`읽지 않은 메시지 ${count}개`}
    >
      {formatUnreadBadge(count)}
    </span>
  );
}
