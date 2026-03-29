"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type UnsavedChangesGuardProps = {
  isDirty: boolean;
  message?: string;
};

/**
 * 저장하지 않은 변경사항이 있을 때 페이지 이탈을 방지하는 가드 컴포넌트.
 *
 * - 브라우저 닫기/새로고침: `beforeunload` 네이티브 경고
 * - 앱 내부 링크 클릭: 커스텀 확인 모달
 */
export function UnsavedChangesGuard({
  isDirty,
  message = "저장하지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?",
}: UnsavedChangesGuardProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const bypassRef = useRef(false);

  // 브라우저 닫기 / 새로고침 / 외부 URL 이동 방지
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty && !bypassRef.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // 앱 내부 링크 클릭 가로채기 (capture phase로 Next.js Link보다 먼저 실행)
  useEffect(() => {
    if (!isDirty) return;

    function handleClick(e: MouseEvent) {
      if (bypassRef.current) return;

      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // 외부 링크, 해시, 새 탭, 특수 프로토콜은 무시 (beforeunload가 처리)
      if (
        anchor.target === "_blank" ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("http")
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      pendingHrefRef.current = href;
      setShowModal(true);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  // 브라우저 뒤로가기/앞으로가기 방지
  useEffect(() => {
    if (!isDirty) return;

    function handlePopState() {
      if (bypassRef.current) return;

      // popstate 시점에 이미 URL이 바뀌었으므로 원래 URL로 복원
      window.history.pushState(null, "", window.location.href);
      pendingHrefRef.current = null;
      setShowModal(true);
    }

    // 현재 위치에 가드 히스토리 추가
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  const handleConfirm = useCallback(() => {
    setShowModal(false);
    bypassRef.current = true;

    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;

    if (href) {
      router.push(href);
    } else {
      // 뒤로가기 버튼으로 촉발된 경우
      window.history.go(-1);
    }

    setTimeout(() => {
      bypassRef.current = false;
    }, 300);
  }, [router]);

  const handleCancel = useCallback(() => {
    setShowModal(false);
    pendingHrefRef.current = null;
  }, []);

  return (
    <ConfirmDialog
      open={showModal}
      title="저장하지 않은 변경사항"
      description={message}
      confirmLabel="저장하지 않고 떠나기"
      cancelLabel="머무르기"
      variant="warning"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
