"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePhone } from "@/lib/validations";
import { withTenantPrefix } from "@/lib/tenant";

interface RecoveryResetResponse {
  success?: boolean;
  message?: string;
  error?: string;
  errors?: string[];
  recoveryCodes?: string[];
}

function normalizeRecoveryCodeInput(value: string): string {
  const stripped = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  if (stripped.length <= 5) {
    return stripped;
  }
  return `${stripped.slice(0, 5)}-${stripped.slice(5)}`;
}

export default function ForgotPasswordPage() {
  const tenantType = "fire";
  const { showErrorToast, showToast } = useToast();
  const [phone, setPhone] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecoverySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecoveryError("");
    setRecoveryMessage("");
    setNewRecoveryCodes([]);

    const normalizedPhone = normalizePhone(phone);
    if (!/^010-\d{4}-\d{4}$/.test(normalizedPhone)) {
      setRecoveryError("휴대전화는 010-XXXX-XXXX 형식으로 입력해 주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setRecoveryError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsRecovering(true);
    try {
      const response = await fetch("/api/auth/password-reset/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizedPhone,
          recoveryCode,
          password,
        }),
      });
      const data = (await response.json()) as RecoveryResetResponse;

      if (!response.ok) {
        const message = data.error ?? "복구코드 재설정 처리 중 오류가 발생했습니다.";
        setRecoveryError(message);
        showErrorToast(message);
        return;
      }

      const message = data.message ?? "비밀번호가 변경되었습니다.";
      setRecoveryMessage(message);
      setNewRecoveryCodes(Array.isArray(data.recoveryCodes) ? data.recoveryCodes : []);
      showToast(message, "success");
      setPassword("");
      setPasswordConfirm("");
    } catch {
      const message = "복구코드 재설정 처리 중 오류가 발생했습니다.";
      setRecoveryError(message);
      showErrorToast(message);
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">비밀번호 찾기</CardTitle>
          <p className="text-sm text-slate-500">
            복구코드와 휴대전화로 비밀번호를 다시 설정할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            이메일 재설정은 지원하지 않습니다. 가입 시 받은 복구코드로만 비밀번호를 재설정할 수
            있습니다.
          </p>

          <form className="space-y-3" onSubmit={handleRecoverySubmit}>
            <div className="space-y-2">
              <Label htmlFor="phone">휴대전화</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(normalizePhone(event.target.value))}
                placeholder="010-1234-5678"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recoveryCode">복구코드</Label>
              <Input
                id="recoveryCode"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(normalizeRecoveryCodeInput(event.target.value))}
                placeholder="ABCDE-12345"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">새 비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8자 이상, 영문/숫자/특수문자 포함"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="새 비밀번호를 다시 입력"
                required
              />
            </div>
            {recoveryError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{recoveryError}</p>
            ) : null}
            {recoveryMessage ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{recoveryMessage}</p>
            ) : null}
            <Button type="submit" disabled={isRecovering}>
              {isRecovering ? "변경 중..." : "복구코드로 변경"}
            </Button>
          </form>

          {newRecoveryCodes.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">새 복구코드 (1회 표시)</p>
              <p className="mt-1 text-xs text-amber-800">
                아래 코드를 안전한 곳에 저장해 주세요. 페이지를 벗어나면 다시 확인할 수 없습니다.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {newRecoveryCodes.map((code) => (
                  <code
                    key={code}
                    className="rounded border border-amber-300 bg-white px-2 py-1 text-center text-xs font-semibold tracking-wide text-amber-900"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-sm text-slate-600">
            로그인으로 돌아가기{" "}
            <Link href={withTenantPrefix("/login", tenantType)} className="font-medium text-slate-900 underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
