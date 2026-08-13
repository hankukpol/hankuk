"use client";

import Link from "next/link";
import ExamInputPageContent from "@/components/exam/ExamInputPageContent";
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

interface PreRegistrationModalProps {
  open: boolean;
  isAuthenticated: boolean;
  onOpenChange: (open: boolean) => void;
}

function rememberPendingRegistration() {
  try {
    window.sessionStorage.setItem("score-predict:open-pre-registration-after-auth", "1");
  } catch {
    // 브라우저 저장소를 사용할 수 없어도 로그인과 회원가입은 계속 진행한다.
  }
}

export default function PreRegistrationModal({
  open,
  isAuthenticated,
  onOpenChange,
}: PreRegistrationModalProps) {
  const tenant = useTenantConfig();
  const callbackPath = withTenantPrefix("/", tenant.type);
  const loginHref = `${withTenantPrefix("/login", tenant.type)}?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const registerHref = `${withTenantPrefix("/register", tenant.type)}?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 sm:max-w-4xl">
        {isAuthenticated ? (
          <div className="p-4 pt-12 sm:p-6 sm:pt-12">
            <DialogHeader className="sr-only">
              <DialogTitle>사전예약 응시정보 입력 창</DialogTitle>
              <DialogDescription>
                시험 전에 응시정보와 수험번호를 저장합니다.
              </DialogDescription>
            </DialogHeader>
            <ExamInputPageContent embedded presentation="pre-registration-modal" />
          </div>
        ) : (
          <div className="p-6 pt-12 sm:p-8 sm:pt-12">
            <DialogHeader>
              <DialogTitle className="text-xl text-slate-900">사전예약 신청하기</DialogTitle>
              <DialogDescription className="leading-6">
                아직 회원이 아니라면 먼저 회원가입해 주세요. 가입을 마치고 로그인하면 응시지역과
                수험번호를 입력하는 사전등록 창이 열립니다.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button asChild onClick={rememberPendingRegistration}>
                <Link href={registerHref}>회원가입 후 사전등록</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-service-200 bg-service-50 text-service-800 hover:bg-service-100 hover:text-service-900"
                onClick={rememberPendingRegistration}
              >
                <Link href={loginHref}>기존 회원 로그인</Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
