"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import UserFormPageShell from "@/components/layout/UserFormPageShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantType } from "@/lib/tenant";
import { withTenantPrefix } from "@/lib/tenant";
import { passwordsMatchIgnoringCase } from "@/lib/credential-policy";
import {
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  normalizeResetCode,
  normalizeUsername,
  validatePasswordStrength,
} from "@/lib/validations";

type ResetMode = "EMAIL" | "ADMIN_MANUAL_SMS" | "LEGACY_FIRE";

type ResetResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  previewFile?: string;
  recoveryCodes?: string[];
};

function normalizeIdentity(tenantType: TenantType, value: string) {
  return tenantType === "police" ? normalizeUsername(value) : normalizePhone(value);
}

function isValidIdentity(tenantType: TenantType, value: string) {
  return tenantType === "police"
    ? /^[a-z0-9][a-z0-9._-]{3,29}$/.test(value)
    : /^010-\d{4}-\d{4}$/.test(value);
}

function normalizeLegacyRecoveryCode(value: string) {
  const stripped = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  return stripped.length <= 5 ? stripped : `${stripped.slice(0, 5)}-${stripped.slice(5)}`;
}

export default function UnifiedPasswordResetForm({ tenantType }: { tenantType: TenantType }) {
  const router = useRouter();
  const { showErrorToast, showToast } = useToast();
  const [mode, setMode] = useState<ResetMode>("EMAIL");
  const [identity, setIdentity] = useState("");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
  const identityLabel = tenantType === "police" ? "아이디" : "휴대전화";
  const identityPlaceholder = tenantType === "police" ? "가입한 아이디" : "010-1234-5678";

  useEffect(() => {
    const initialIdentity = new URLSearchParams(window.location.search).get("identity");
    if (initialIdentity) setIdentity(normalizeIdentity(tenantType, initialIdentity));
  }, [tenantType]);

  function resetState(nextMode: ResetMode) {
    setMode(nextMode);
    setResetCode("");
    setPassword("");
    setPasswordConfirm("");
    setMessage("");
    setError("");
    setPreviewFile("");
    setCodeRequested(false);
    setNewRecoveryCodes([]);
  }

  async function requestEmailCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPreviewFile("");

    const normalizedIdentity = normalizeIdentity(tenantType, identity);
    const normalizedEmail = normalizeEmail(email);
    if (!isValidIdentity(tenantType, normalizedIdentity) || !isValidEmail(normalizedEmail)) {
      const nextError = `${identityLabel}와 이메일을 확인해 주세요.`;
      setError(nextError);
      showErrorToast(nextError);
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: normalizedIdentity, email: normalizedEmail }),
      });
      const data = (await response.json()) as ResetResponse;
      if (!response.ok) throw new Error(data.error ?? "인증코드를 발송하지 못했습니다.");
      setCodeRequested(true);
      setMessage(data.message ?? "인증코드를 발송했습니다.");
      setPreviewFile(data.previewFile ?? "");
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : "인증코드를 발송하지 못했습니다.";
      setError(nextError);
      showErrorToast(nextError);
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedIdentity = normalizeIdentity(tenantType, identity);
    const passwordResult = validatePasswordStrength(password);
    if (!isValidIdentity(tenantType, normalizedIdentity)) {
      setError(`${identityLabel}를 확인해 주세요.`);
      return;
    }
    if (!passwordsMatchIgnoringCase(password, passwordConfirm)) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!passwordResult.isValid || !passwordResult.data) {
      setError(passwordResult.errors[0] ?? "새 비밀번호를 확인해 주세요.");
      return;
    }
    if (normalizeResetCode(resetCode).length !== 8) {
      setError("인증코드를 확인해 주세요.");
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: normalizedIdentity,
          email: mode === "EMAIL" ? normalizeEmail(email) : undefined,
          resetCode: normalizeResetCode(resetCode),
          password: passwordResult.data,
          recoveryChannel: mode,
        }),
      });
      const data = (await response.json()) as ResetResponse;
      if (!response.ok) throw new Error(data.error ?? "비밀번호를 재설정하지 못했습니다.");
      const successMessage = data.message ?? "비밀번호가 재설정되었습니다.";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setTimeout(() => router.push(withTenantPrefix("/login", tenantType)), 1000);
    } catch (confirmError) {
      const nextError = confirmError instanceof Error ? confirmError.message : "비밀번호를 재설정하지 못했습니다.";
      setError(nextError);
      showErrorToast(nextError);
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmLegacyRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setNewRecoveryCodes([]);
    const normalizedIdentity = normalizePhone(identity);
    const passwordResult = validatePasswordStrength(password);
    if (!/^010-\d{4}-\d{4}$/.test(normalizedIdentity)) {
      setError("휴대전화 번호를 확인해 주세요.");
      return;
    }
    if (!passwordsMatchIgnoringCase(password, passwordConfirm) || !passwordResult.isValid || !passwordResult.data) {
      setError(!passwordsMatchIgnoringCase(password, passwordConfirm) ? "새 비밀번호 확인이 일치하지 않습니다." : passwordResult.errors[0]);
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedIdentity, recoveryCode: resetCode, password: passwordResult.data }),
      });
      const data = (await response.json()) as ResetResponse;
      if (!response.ok) throw new Error(data.error ?? "복구코드를 확인하지 못했습니다.");
      setMessage(data.message ?? "비밀번호가 재설정되었습니다.");
      setNewRecoveryCodes(data.recoveryCodes ?? []);
    } catch (legacyError) {
      const nextError = legacyError instanceof Error ? legacyError.message : "복구코드를 확인하지 못했습니다.";
      setError(nextError);
      showErrorToast(nextError);
    } finally {
      setIsBusy(false);
    }
  }

  const showResetForm = mode === "ADMIN_MANUAL_SMS" || (mode === "EMAIL" && codeRequested);

  return (
    <UserFormPageShell
      title="비밀번호 찾기"
      description={
        <>
          가입한 이메일로 인증코드를 받아 새 비밀번호를 설정합니다.
          <span className="mt-1 block text-xs text-slate-500">
            새 비밀번호는 영문 대소문자를 구분하지 않습니다.
          </span>
        </>
      }
    >
      <div className="space-y-6">
        {mode === "EMAIL" ? (
          <form className="space-y-4" onSubmit={requestEmailCode}>
            <div className="space-y-2">
              <Label htmlFor="recoveryIdentity" className="user-data-label">{identityLabel}</Label>
              <Input
                id="recoveryIdentity"
                value={identity}
                onChange={(event) => setIdentity(normalizeIdentity(tenantType, event.target.value))}
                placeholder={identityPlaceholder}
                autoCapitalize="none"
                autoCorrect="off"
                required
                disabled={codeRequested}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recoveryEmail" className="user-data-label">가입 이메일</Label>
              <Input
                id="recoveryEmail"
                type="email"
                value={email}
                onChange={(event) => setEmail(normalizeEmail(event.target.value))}
                placeholder="name@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                required
                disabled={codeRequested}
              />
            </div>
            {!codeRequested ? (
              <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
                {isBusy ? "발송 중..." : "이메일 인증코드 받기"}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900" onClick={() => setCodeRequested(false)}>
                로그인 정보 다시 입력
              </Button>
            )}
          </form>
        ) : null}

        {mode === "ADMIN_MANUAL_SMS" ? (
          <p className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            학원 관리자에게 받은 10분짜리 일회용 코드를 입력해 주세요. 이 코드는 로그인 비밀번호가 아닙니다.
          </p>
        ) : null}

        {showResetForm ? (
          <form className="space-y-4" onSubmit={confirmReset}>
            {mode === "ADMIN_MANUAL_SMS" ? (
              <div className="space-y-2">
                <Label htmlFor="adminRecoveryIdentity" className="user-data-label">{identityLabel}</Label>
                <Input
                  id="adminRecoveryIdentity"
                  value={identity}
                  onChange={(event) => setIdentity(normalizeIdentity(tenantType, event.target.value))}
                  placeholder={identityPlaceholder}
                  required
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="resetCode" className="user-data-label">인증코드</Label>
              <Input
                id="resetCode"
                value={resetCode}
                onChange={(event) => setResetCode(normalizeResetCode(event.target.value))}
                placeholder="ABCD-1234"
                autoCapitalize="characters"
                autoCorrect="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="user-data-label">새 비밀번호</Label>
              <Input id="newPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8자 이상, 영문·숫자·특수문자 포함 (대소문자 구분 없음)" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPasswordConfirm" className="user-data-label">새 비밀번호 확인</Label>
              <Input id="newPasswordConfirm" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="새 비밀번호를 다시 입력" required />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
              {isBusy ? "변경 중..." : "새 비밀번호 설정"}
            </Button>
          </form>
        ) : null}

        {mode === "LEGACY_FIRE" ? (
          <form className="space-y-4" onSubmit={confirmLegacyRecovery}>
            <p className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              기존 소방 회원에게만 제공하는 전환용 기능입니다. 변경 후 계정 설정에서 이메일을 등록해 주세요.
            </p>
            <div className="space-y-2">
              <Label htmlFor="legacyPhone" className="user-data-label">휴대전화</Label>
              <Input id="legacyPhone" value={identity} onChange={(event) => setIdentity(normalizePhone(event.target.value))} placeholder="010-1234-5678" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legacyCode" className="user-data-label">기존 복구코드</Label>
              <Input id="legacyCode" value={resetCode} onChange={(event) => setResetCode(normalizeLegacyRecoveryCode(event.target.value))} placeholder="ABCDE-12345" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legacyPassword" className="user-data-label">새 비밀번호</Label>
              <Input id="legacyPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legacyPasswordConfirm" className="user-data-label">새 비밀번호 확인</Label>
              <Input id="legacyPasswordConfirm" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={isBusy}>{isBusy ? "변경 중..." : "기존 복구코드로 변경"}</Button>
          </form>
        ) : null}

        {previewFile ? <p className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-xs text-amber-900">로컬 메일 미리보기: {previewFile}</p> : null}
        {error ? <p className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {message ? <p className="border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

        {newRecoveryCodes.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">새 복구코드, 1회 표시</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {newRecoveryCodes.map((code) => <code key={code} className="rounded border border-amber-300 bg-white px-2 py-1 text-center text-xs font-semibold text-amber-900">{code}</code>)}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
          {mode !== "EMAIL" ? <button type="button" className="flex min-h-11 items-center text-left text-slate-700 underline underline-offset-4 lg:min-h-0" onClick={() => resetState("EMAIL")}>이메일 인증으로 재설정</button> : null}
          {mode !== "ADMIN_MANUAL_SMS" ? <button type="button" className="flex min-h-11 items-center text-left text-slate-700 underline underline-offset-4 lg:min-h-0" onClick={() => resetState("ADMIN_MANUAL_SMS")}>학원 관리자에게 일회용 코드를 받은 경우</button> : null}
          {tenantType === "fire" && mode !== "LEGACY_FIRE" ? <button type="button" className="flex min-h-11 items-center text-left text-slate-700 underline underline-offset-4 lg:min-h-0" onClick={() => resetState("LEGACY_FIRE")}>기존 소방 복구코드 사용</button> : null}
        </div>

        <p className="text-center text-sm text-slate-600">
          <Link href={withTenantPrefix("/login", tenantType)} className="font-semibold text-service-700 underline underline-offset-4">로그인으로 돌아가기</Link>
        </p>
      </div>
    </UserFormPageShell>
  );
}
