"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/ToastProvider";
import { validateLoginInput } from "@/lib/validations";
import { withTenantPrefix } from "@/lib/tenant";

const TENANT_TYPE = "fire";
const POST_LOGIN_REDIRECT_PATH = withTenantPrefix("/", TENANT_TYPE);

export default function LoginPage() {
  const router = useRouter();
  const { showErrorToast } = useToast();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const validationResult = validateLoginInput({ phone, password });
    if (!validationResult.isValid) {
      const message = validationResult.errors[0] ?? "로그인 정보를 확인해 주세요.";
      setErrorMessage(message);
      return;
    }

    setIsSubmitting(true);

    const result = await signIn("credentials", {
      phone: validationResult.data?.phone,
      password: validationResult.data?.password,
      redirect: false,
    });

    if (result?.ok) {
      router.replace(POST_LOGIN_REDIRECT_PATH);
      router.refresh();
      return;
    }

    const message = "휴대전화 또는 비밀번호가 올바르지 않습니다.";
    setErrorMessage(message);
    showErrorToast(message);
    setIsSubmitting(false);
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">로그인</CardTitle>
          <p className="text-sm text-slate-500">
            휴대전화와 비밀번호를 입력해 소방 필기 합격예측 서비스를 이용해 주세요.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="phone">휴대전화</Label>
              <Input
                id="phone"
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-1234-5678"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력해 주세요."
                required
              />
            </div>

            {errorMessage ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <p className="mt-3 text-right text-sm">
            <Link href={withTenantPrefix("/forgot-password", TENANT_TYPE)} className="text-slate-700 underline">
              복구코드로 비밀번호 재설정
            </Link>
          </p>

          <p className="mt-4 text-sm text-slate-600">
            계정이 없으신가요?{" "}
            <Link href={withTenantPrefix("/register", TENANT_TYPE)} className="font-medium text-slate-900 underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
