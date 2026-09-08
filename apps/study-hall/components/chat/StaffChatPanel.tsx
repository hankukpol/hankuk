"use client";

import { StaffChatRoom } from "@/components/chat/StaffChatRoom";
import { useChatStore } from "@/lib/chat-store";
import type { ChatAuthorRole, ChatMessageItem } from "@/lib/services/chat.service";

type StaffChatPanelProps = {
  divisionSlug: string;
  viewerId: string;
  viewerRole: ChatAuthorRole;
  initialMessages: ChatMessageItem[];
  initialHasMoreBefore: boolean;
  initialSyncedAt: string | null;
  variant: "admin" | "assistant";
};

/**
 * 스토어와 화면을 잇는 얇은 껍데기.
 * StaffChatRoom 을 props 전용으로 남겨 두어 렌더 테스트 하네스에서 그대로 마운트할 수 있게 한다.
 */
export function StaffChatPanel(props: StaffChatPanelProps) {
  const { signalAt, mode } = useChatStore();

  return <StaffChatRoom {...props} signalAt={signalAt} connectionMode={mode} />;
}
