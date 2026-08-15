"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { normalizeEmail, normalizeResetCode, validatePasswordStrength } from "@/lib/validations";
import { passwordsMatchIgnoringCase } from "@/lib/credential-policy";
import { withTenantPrefix } from "@/lib/tenant";

type SecurityResponse = {
  identity?: string;
  email?: string | null;
  emailVerifiedAt?: string | null;
  mailerConfigured?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  previewFile?: string;
};

export default function AccountSecurityForm() {
  const tenant = useTenantConfig();
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [mailerConfigured, setMailerConfigured] = useState(false);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeRequested, setEmailCodeRequested] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/security", { cache: "no-store" });
        const data = (await response.json()) as SecurityResponse;
        if (!response.ok) throw new Error(data.error ?? "계정 정보를 불러오지 못했습니다.");
        if (!cancelled) {
          setEmail(data.email ?? "");
          setEmailVerifiedAt(data.emailVerifiedAt ?? null);
          setMailerConfigured(Boolean(data.mailerConfigured));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "계정 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestEmailCode() {
    setError("");
    setMessage("");
    setPreviewFile("");
    setIsSavingEmail(true);
    try {
      const response = await fetch("/api/account/security/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), currentPassword: emailPassword }),
      });
      const data = (await response.json()) as SecurityResponse;
      if (!response.ok) throw new Error(data.error ?? "인증코드를 발송하지 못했습니다.");
      setEmailCodeRequested(true);
      setMessage(data.message ?? "인증코드를 발송했습니다.");
      setPreviewFile(data.previewFile ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "인증코드를 발송하지 못했습니다.");
    } finally {
      setIsSavingEmail(false);
    }
  }

  async function confirmEmail() {
    setError("");
    setMessage("");
    setIsSavingEmail(true);
    try {
      const response = await fetch("/api/account/security/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), code: normalizeResetCode(emailCode) }),
      });
      const data = (await response.json()) as SecurityResponse;
      if (!response.ok) throw new Error(data.error ?? "이메일을 인증하지 못했습니다.");
      await signOut({ callbackUrl: withTenantPrefix("/login", tenant.type) });
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "이메일을 인증하지 못했습니다.");
      setIsSavingEmail(false);
    }
  }

  async function changePassword() {
    setError("");
    setMessage("");
    if (!passwordsMatchIgnoringCase(newPassword, newPasswordConfirm)) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid || !validation.data) {
      setError(validation.errors[0] ?? "새 비밀번호를 확인해 주세요.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await fetch("/api/account/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword: validation.data }),
      });
      const data = (await response.json()) as SecurityResponse;
      if (!response.ok) throw new Error(data.error ?? "비밀번호를 변경하지 못했습니다.");
      await signOut({ callbackUrl: withTenantPrefix("/login", tenant.type) });
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "비밀번호를 변경하지 못했습니다.");
      setIsSavingPassword(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">계정 보안 설정을 불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">계정 보안</h1>
        <p className="mt-2 text-sm text-slate-600">경찰과 소방 계정은 분리되어 있습니다. 현재 사이트의 계정만 변경됩니다.</p>
      </header>

      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {previewFile ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">로컬 메일 미리보기: {previewFile}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">복구 이메일</h2>
        <p className="mt-1 text-sm text-slate-600">
          {emailVerifiedAt
            ? "인증된 이메일입니다."
            : "아직 인증되지 않은 이메일입니다. 인증해 두면 비밀번호 찾기 메일을 확실히 받을 수 있습니다."}
        </p>
        {!mailerConfigured ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            현재 운영 메일 발송 설정이 필요합니다. 설정 전에는 관리자 일회용 코드를 이용해 주세요.
          </p>
        ) : null}
        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="securityEmail">이메일</Label>
            <Input id="securityEmail" type="email" value={email} onChange={(event) => setEmail(normalizeEmail(event.target.value))} autoCapitalize="none" autoCorrect="off" />
          </div>
          {!emailCodeRequested ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="securityEmailPassword">현재 비밀번호</Label>
                <Input id="securityEmailPassword" type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
              </div>
              <Button type="button" onClick={() => void requestEmailCode()} disabled={isSavingEmail}>{isSavingEmail ? "발송 중..." : "인증코드 받기"}</Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="securityEmailCode">이메일 인증코드</Label>
                <Input id="securityEmailCode" value={emailCode} onChange={(event) => setEmailCode(normalizeResetCode(event.target.value))} placeholder="ABCD-1234" />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void confirmEmail()} disabled={isSavingEmail}>{isSavingEmail ? "확인 중..." : "이메일 인증"}</Button>
                <Button type="button" variant="outline" onClick={() => setEmailCodeRequested(false)} disabled={isSavingEmail}>다시 입력</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">비밀번호 변경</h2>
        <p className="mt-1 text-sm text-slate-600">변경 후 다른 기기를 포함한 기존 로그인은 만료됩니다. 영문 대소문자는 구분하지 않습니다.</p>
        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">현재 비밀번호</Label>
            <Input id="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNewPassword">새 비밀번호</Label>
            <Input id="accountNewPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8자 이상, 영문·숫자·특수문자 포함" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNewPasswordConfirm">새 비밀번호 확인</Label>
            <Input id="accountNewPasswordConfirm" type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} />
          </div>
          <Button type="button" onClick={() => void changePassword()} disabled={isSavingPassword}>{isSavingPassword ? "변경 중..." : "비밀번호 변경"}</Button>
        </div>
      </section>

      <p className="text-sm text-slate-600">
        로그인할 수 없는 경우 <Link href={withTenantPrefix("/forgot-password", tenant.type)} className="font-medium text-service-700 underline underline-offset-4">비밀번호 찾기</Link>를 이용해 주세요.
      </p>
    </div>
  );
}
