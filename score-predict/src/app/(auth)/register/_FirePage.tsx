"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/ToastProvider";
import { normalizePhone, validateRegisterInput } from "@/lib/validations";
import { withTenantPrefix } from "@/lib/tenant";

interface RegisterResponse {
  error?: string;
  errors?: string[];
  message?: string;
  recoveryCodes?: string[];
}

interface TermsResponse {
  termsOfService: string;
  privacyPolicy: string;
}

const TENANT_TYPE = "fire";

export default function RegisterPage() {
  const router = useRouter();
  const { showErrorToast, showToast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [privacyContent, setPrivacyContent] = useState("");
  const [isTermsLoading, setIsTermsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/terms")
      .then((res) => res.json())
      .then((data: TermsResponse) => {
        setTermsContent(data.termsOfService ?? "");
        setPrivacyContent(data.privacyPolicy ?? "");
      })
      .catch(() => {
        // 로드 실패 시 빈 내용으로 표시
      })
      .finally(() => {
        setIsTermsLoading(false);
      });
  }, []);

  const allAgreed = agreedToTerms && agreedToPrivacy;

  const handleAllAgreed = (checked: boolean) => {
    setAgreedToTerms(checked);
    setAgreedToPrivacy(checked);
  };

  const handlePhoneChange = (value: string) => {
    setPhone(normalizePhone(value));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const validationResult = validateRegisterInput({
      name,
      phone,
      password,
      agreedToTerms,
      agreedToPrivacy,
    });
    if (!validationResult.isValid || !validationResult.data) {
      setErrorMessage(validationResult.errors[0]);
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validationResult.data),
      });

      const data = (await response.json()) as RegisterResponse;

      if (!response.ok) {
        const message = data.error ?? "회원가입 처리 중 오류가 발생했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
        return;
      }

      const success = data.message ?? "회원가입이 완료되었습니다.";
      setSuccessMessage(success);
      showToast(success, "success");
      setRecoveryCodes(Array.isArray(data.recoveryCodes) ? data.recoveryCodes : []);

      if (!Array.isArray(data.recoveryCodes) || data.recoveryCodes.length === 0) {
        setTimeout(() => {
          router.push(withTenantPrefix("/login", TENANT_TYPE));
        }, 800);
      }
    } catch {
      const message = "회원가입 처리 중 오류가 발생했습니다.";
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
          <CardTitle className="text-2xl">회원가입</CardTitle>
          <p className="text-sm text-slate-500">한글 이름과 연락처로 가입하고 복구코드를 안전하게 보관해 주세요.</p>
        </CardHeader>
        <CardContent>
          {recoveryCodes.length > 0 ? (
            <div className="space-y-4">
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">복구코드 (1회 표시)</p>
                <p className="mt-1 text-xs text-amber-800">
                  비밀번호를 잊었을 때 사용하는 코드입니다. 안전한 곳에 저장해 주세요.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {recoveryCodes.map((code) => (
                    <code
                      key={code}
                      className="rounded border border-amber-300 bg-white px-2 py-1 text-center text-xs font-semibold tracking-wide text-amber-900"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={() => router.push(withTenantPrefix("/login", TENANT_TYPE))}>로그인으로 이동</Button>
            </div>
          ) : (
            <>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="홍길동"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">연락처</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
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
                    placeholder="8자 이상, 소문자·숫자·특수문자 포함"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                  <Input
                    id="passwordConfirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="비밀번호를 다시 입력"
                    required
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <input
                      id="allAgreed"
                      type="checkbox"
                      checked={allAgreed}
                      onChange={(e) => handleAllAgreed(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-800"
                    />
                    <Label htmlFor="allAgreed" className="font-semibold cursor-pointer">
                      전체 동의
                    </Label>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        id="agreedToTerms"
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-800"
                      />
                      <Label htmlFor="agreedToTerms" className="cursor-pointer text-sm">
                        서비스 이용약관 동의 <span className="text-red-500">(필수)</span>
                      </Label>
                    </div>
                    <div className="max-h-24 overflow-y-auto rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {isTermsLoading ? "약관을 불러오는 중..." : termsContent}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        id="agreedToPrivacy"
                        type="checkbox"
                        checked={agreedToPrivacy}
                        onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-800"
                      />
                      <Label htmlFor="agreedToPrivacy" className="cursor-pointer text-sm">
                        개인정보 수집·이용 동의 <span className="text-red-500">(필수)</span>
                      </Label>
                    </div>
                    <div className="max-h-24 overflow-y-auto rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {isTermsLoading ? "약관을 불러오는 중..." : privacyContent}
                    </div>
                  </div>
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
                  {isSubmitting ? "가입 처리 중..." : "회원가입"}
                </Button>
              </form>

              <p className="mt-4 text-sm text-slate-600">
                이미 계정이 있으신가요?{" "}
                <Link href={withTenantPrefix("/login", TENANT_TYPE)} className="font-medium text-slate-900 underline">
                  로그인
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
