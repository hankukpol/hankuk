"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/ToastProvider";
import { formatPoliceContactPhone } from "@/lib/police/contact-phone";
import type { TenantType } from "@/lib/tenant";
import { withTenantPrefix } from "@/lib/tenant";

type LookupResponse = {
  error?: string;
  message?: string;
  username?: string;
  usernames?: string[];
};

export default function UnifiedAccountLookupForm({ tenantType }: { tenantType: TenantType }) {
  const { showErrorToast } = useToast();
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [password, setPassword] = useState("");
  const [usernames, setUsernames] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState("");
  const [legacyMode, setLegacyMode] = useState(false);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  if (tenantType === "fire") {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl" role="heading" aria-level={1}>아이디 확인</CardTitle>
            <p className="text-sm text-slate-500">소방 계정은 가입한 휴대전화 번호가 아이디입니다.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="border-l-2 border-service-400 bg-service-50 px-4 py-3 text-sm leading-6 text-slate-700">
              가입 여부가 기억나지 않으면 휴대전화 번호로 로그인을 시도하거나 비밀번호 찾기를 이용해 주세요.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild><Link href={withTenantPrefix("/login", tenantType)}>로그인</Link></Button>
              <Button asChild variant="outline"><Link href={withTenantPrefix("/forgot-password", tenantType)}>비밀번호 찾기</Link></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function findUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsBusy(true);
    try {
      const response = await fetch(
        legacyMode
          ? "/api/auth/account-lookup/legacy-contact"
          : "/api/auth/account-lookup/request",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contactPhone, ...(legacyMode ? { password } : {}) }),
        }
      );
      const data = (await response.json()) as LookupResponse;
      const foundUsernames =
        Array.isArray(data.usernames) && data.usernames.length > 0
          ? data.usernames
          : data.username
            ? [data.username]
            : [];
      if (!response.ok || foundUsernames.length === 0) {
        throw new Error(data.error ?? "아이디를 확인하지 못했습니다.");
      }
      setUsernames(foundUsernames);
      setResultMessage(data.message ?? "회원 정보를 확인했습니다.");
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : "아이디를 확인하지 못했습니다.";
      setError(nextError);
      showErrorToast(nextError);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl" role="heading" aria-level={1}>아이디 찾기</CardTitle>
          <p className="text-sm text-slate-500">
            이름과 휴대전화가 일치하면 메일 인증 없이 아이디를 바로 안내합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {usernames.length > 0 ? (
            <div className="space-y-4">
              <div className="border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-800">{resultMessage || "확인된 아이디"}</p>
                <div className="mt-2 divide-y divide-emerald-200" data-testid="found-usernames">
                  {usernames.map((foundUsername, index) => (
                    <div key={foundUsername} className="flex min-h-11 items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <p
                        className="min-w-0 break-all text-lg font-bold text-slate-900"
                        data-testid={index === 0 ? "found-username" : "found-username-alt"}
                      >
                        {foundUsername}
                      </p>
                      <Link
                        href={`${withTenantPrefix("/forgot-password", tenantType)}?identity=${encodeURIComponent(foundUsername)}`}
                        className="shrink-0 text-xs font-semibold text-service-700 underline underline-offset-4 hover:text-service-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-500"
                      >
                        비밀번호 재설정
                      </Link>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-600">아이디와 비밀번호는 영문 대소문자를 구분하지 않습니다.</p>
                {usernames.length > 1 ? (
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    같은 철자의 기존 아이디가 여러 개면 위에 표시된 대소문자 그대로 입력해 주세요.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild><Link href={withTenantPrefix("/login", tenantType)}>로그인</Link></Button>
                <Button asChild variant="outline">
                  <Link href={withTenantPrefix("/forgot-password", tenantType)}>비밀번호 찾기</Link>
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setUsernames([]);
                  setName("");
                  setContactPhone("");
                  setPassword("");
                  setResultMessage("");
                }}
              >
                다른 회원 정보 확인
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={findUsername}>
              <div className="space-y-2">
                <Label htmlFor="lookupName">가입한 이름</Label>
                <Input id="lookupName" value={name} onChange={(event) => setName(event.target.value)} placeholder="홍길동" disabled={isBusy} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lookupContactPhone">
                  {legacyMode ? "새로 등록할 휴대전화" : "가입한 휴대전화"}
                </Label>
                <Input
                  id="lookupContactPhone"
                  type="tel"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(formatPoliceContactPhone(event.target.value))}
                  placeholder="010-1234-5678"
                  disabled={isBusy}
                  required
                />
              </div>
              {legacyMode ? (
                <div className="space-y-2">
                  <Label htmlFor="lookupPassword">기존 비밀번호</Label>
                  <Input
                    id="lookupPassword"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="가입할 때 사용한 비밀번호"
                    disabled={isBusy}
                    required
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    이름만으로는 계정을 연결하지 않습니다. 기존 비밀번호 확인 후 이 연락처를 등록합니다.
                  </p>
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={isBusy}>
                {isBusy
                  ? "확인 중..."
                  : legacyMode
                    ? "연락처 등록 후 아이디 확인"
                    : "아이디 확인"}
              </Button>
            </form>
          )}

          {error ? <p className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

          {usernames.length === 0 ? (
            <section className="space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
              <div>
                <p className="font-medium text-slate-900">예전에 가입해 연락처를 입력하지 않았나요?</p>
                <p className="mt-1 leading-6">
                  기존 비밀번호로 본인을 확인하면 현재 휴대전화를 등록하고 아이디를 바로 확인할 수 있습니다.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setLegacyMode((current) => !current);
                  setError("");
                  setPassword("");
                }}
              >
                {legacyMode ? "일반 아이디 찾기로 돌아가기" : "연락처 미등록 기존 회원 확인"}
              </Button>
              {legacyMode ? (
                <p className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  기존 비밀번호도 기억나지 않으면 학원 관리자가 신원을 확인한 뒤 연락처를 등록해야 합니다.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <p>회원 정보를 찾을 수 없으면 학원 관리자에게 이름과 휴대전화 번호로 계정 확인을 요청해 주세요.</p>
            <Link href={withTenantPrefix("/login", tenantType)} className="inline-block font-medium text-slate-800 underline underline-offset-4 hover:text-service-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-500">
              로그인으로 돌아가기
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
