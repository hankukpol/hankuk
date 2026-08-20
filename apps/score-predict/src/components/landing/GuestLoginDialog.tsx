"use client";

import Link from "next/link";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withTenantPrefix } from "@/lib/tenant";

interface GuestLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestedLabel?: string;
  callbackHref?: string;
}

export default function GuestLoginDialog({
  open,
  onOpenChange,
  requestedLabel,
  callbackHref = "/",
}: GuestLoginDialogProps) {
  const tenant = useTenantConfig();
  const resolvedCallbackHref = callbackHref.startsWith("?")
    ? `${withTenantPrefix("/", tenant.type)}${callbackHref}`
    : withTenantPrefix(callbackHref, tenant.type);
  const loginHref = `${withTenantPrefix("/login", tenant.type)}?callbackUrl=${encodeURIComponent(resolvedCallbackHref)}`;
  const registerHref = `${withTenantPrefix("/register", tenant.type)}?callbackUrl=${encodeURIComponent(resolvedCallbackHref)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 포털로 셸 밖에 렌더링되므로 사용자 화면 토큰을 직접 붙인다. */}
      <DialogContent
        aria-label="로그인이 필요합니다"
        className="public-product-shell rounded-none border-0 sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="user-page-title">로그인이 필요합니다</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {requestedLabel ? `${requestedLabel} 메뉴는 ` : "이 메뉴는 "}
            로그인 후 이용할 수 있습니다. 기존 회원은 로그인하고, 처음 방문하셨다면 회원가입해 주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href={loginHref}>로그인</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          >
            <Link href={registerHref}>회원가입</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
