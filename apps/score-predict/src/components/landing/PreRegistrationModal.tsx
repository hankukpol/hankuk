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
  const callbackPath = `${withTenantPrefix("/", tenant.type)}?openPreRegistration=1`;
  const loginHref = `${withTenantPrefix("/login", tenant.type)}?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const registerHref = `${withTenantPrefix("/register", tenant.type)}?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix 다이얼로그는 document.body로 포털되어 `.public-product-shell` 밖에 놓인다.
          셸 클래스를 직접 붙여야 사용자 화면의 타이포·표·radius 규칙이 모달 안에서도 적용된다.

          폭: 기본값 `sm:max-w-4xl`만 주면 640~1023px 구간에서 max-width가 뷰포트보다 커져
          모달이 화면 좌우로 꽉 찬다. 태블릿에서도 안전 여백 24px을 유지하도록
          `sm`에서 뷰포트 기준 폭을 쓰고, PC(1024px 이상)에서만 고정 최대폭으로 넘긴다.
          모바일(<640px)은 기본 `max-w-[calc(100%-2rem)]`이 좌우 16px을 만든다. */}
      <DialogContent className="public-product-shell max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border-0 p-0 sm:max-w-[calc(100%-3rem)] lg:max-w-4xl">
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
              <DialogTitle className="user-page-title">사전예약 신청하기</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                아직 회원이 아니라면 먼저 회원가입해 주세요. 가입을 마치고 로그인하면 응시지역과
                수험번호를 입력하는 사전등록 창이 열립니다.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
              <Button asChild size="lg" onClick={rememberPendingRegistration}>
                <Link href={registerHref}>회원가입 후 사전등록</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
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
