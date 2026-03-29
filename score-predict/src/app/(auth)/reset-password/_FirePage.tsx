"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withTenantPrefix } from "@/lib/tenant";

interface ConfirmResponse {
  success?: boolean;
  message?: string;
  error?: string;
  errors?: string[];
}

export default function ResetPasswordPage() {
  const tenantType = "fire";
  const [token, setToken] = useState<string | null>(null);
  const { showErrorToast, showToast } = useToast();

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token")?.trim() ?? "");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!token) {
      const message = "재설정 링크가 올바르지 않습니다.";
      setErrorMessage(message);
      return;
    }

    if (password !== passwordConfirm) {
      const message = "비밀번호와 비밀번호 확인이 일치하지 않습니다.";
      setErrorMessage(message);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
        }),
      });
      const data = (await response.json()) as ConfirmResponse;

      if (!response.ok) {
        const message = data.error ?? "비밀번호 변경 중 오류가 발생했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
        return;
      }

      const message = data.message ?? "비밀번호가 변경되었습니다.";
      setSuccessMessage(message);
      showToast(message, "success");
      setPassword("");
      setPasswordConfirm("");
    } catch {
      const message = "비밀번호 변경 중 오류가 발생했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">새 비밀번호 설정</CardTitle>
          <p className="text-sm text-slate-500">새 비밀번호를 입력하고 재설정을 완료해 주세요.</p>
        </CardHeader>
        <CardContent>
          {token === null ? (
            <p className="text-sm text-slate-500">링크 확인 중...</p>
          ) : !token ? (
            <div className="space-y-3">
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                유효하지 않은 링크입니다. 비밀번호 찾기에서 다시 요청해 주세요.
              </p>
              <Link
                href={withTenantPrefix("/forgot-password", tenantType)}
                className="text-sm font-medium text-slate-900 underline"
              >
                비밀번호 찾기로 이동
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">새 비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8자 이상, 영문·숫자·특수문자 포함"
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

              {errorMessage ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
              ) : null}
              {successMessage ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {successMessage}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          )}

          <p className="mt-4 text-sm text-slate-600">
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
