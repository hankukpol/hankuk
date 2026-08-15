"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeContactPhone,
  normalizeEmail,
  normalizeUsername,
  validateRegisterInput,
} from "@/lib/police/validations";
import { formatPoliceContactPhone } from "@/lib/police/contact-phone";
import { withBrowserTenantPath, withTenantPrefix } from "@/lib/tenant";
import { passwordsMatchIgnoringCase } from "@/lib/credential-policy";

interface RegisterResponse {
  message?: string;
  error?: string;
  code?: "USERNAME_EXISTS" | "ACCOUNT_EXISTS";
}

type UsernameAvailability = "idle" | "checking" | "available" | "unavailable";

interface SiteSettingsResponse {
  settings?: Record<string, string | boolean | number | null>;
}

const TENANT_TYPE = "police";

const TEXT = {
  title: "\uD68C\uC6D0\uAC00\uC785",
  description:
    "\uC544\uC774\uB514\uC640 \uBE44\uBC00\uBC88\uD638\uB85C \uB85C\uADF8\uC778\uD558\uBA70, \uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30\uB294 \uAC00\uC785\uD55C \uC774\uBA54\uC77C\uB85C \uC9C4\uD589\uD569\uB2C8\uB2E4.",
  name: "\uC774\uB984",
  namePlaceholder: "\uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  username: "\uC544\uC774\uB514",
  usernamePlaceholder: "\uC601\uBB38, \uC22B\uC790, _, - \uD3EC\uD568 4~20\uC790",
  contactPhone: "연락처",
  contactPhonePlaceholder: "010-1234-5678",
  email: "\uC774\uBA54\uC77C",
  emailPlaceholder: "\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30\uC5D0 \uC0AC\uC6A9\uD560 \uC774\uBA54\uC77C",
  password: "\uBE44\uBC00\uBC88\uD638",
  passwordPlaceholder: "8자 이상, 영문·숫자·특수문자 포함 (대소문자 구분 없음)",
  passwordConfirm: "\uBE44\uBC00\uBC88\uD638 \uD655\uC778",
  passwordConfirmPlaceholder: "\uBE44\uBC00\uBC88\uD638\uB97C \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  passwordMismatch: "\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  validationFallback: "\uD68C\uC6D0\uAC00\uC785 \uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  submitError: "\uD68C\uC6D0\uAC00\uC785 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  submitIdle: "\uD68C\uC6D0\uAC00\uC785",
  submitBusy: "\uAC00\uC785 \uCC98\uB9AC \uC911...",
  termsTitle: "\uC774\uC6A9\uC57D\uAD00 \uB3D9\uC758(\uD544\uC218)",
  termsBody:
    "\uD68C\uC6D0 \uC2DD\uBCC4, \uB85C\uADF8\uC778 \uC11C\uBE44\uC2A4 \uC81C\uACF5, \uC2DC\uD5D8 \uB370\uC774\uD130 \uC800\uC7A5 \uBC0F \uC870\uD68C\uB97C \uC704\uD574 \uACC4\uC815\uC744 \uC6B4\uC601\uD569\uB2C8\uB2E4.",
  privacyTitle: "\uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1 \uBC0F \uC774\uC6A9 \uB3D9\uC758(\uD544\uC218)",
  privacyBody:
    "수집 항목은 이름, 아이디, 연락처, 이메일이며 회원가입과 계정 찾기, 비밀번호 재설정, 서비스 제공 목적으로 사용합니다.",
  loginPrompt: "\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uB098\uC694?",
  loginLink: "\uB85C\uADF8\uC778",
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>("idle");
  const [usernameAvailabilityMessage, setUsernameAvailabilityMessage] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);
  const [termsBody, setTermsBody] = useState(TEXT.termsBody);
  const [privacyBody, setPrivacyBody] = useState(TEXT.privacyBody);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/site-settings", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as SiteSettingsResponse;
        const nextTerms = data.settings?.["site.termsOfService"];
        const nextPrivacy = data.settings?.["site.privacyPolicy"];

        if (!cancelled && typeof nextTerms === "string" && nextTerms.trim()) {
          setTermsBody(nextTerms);
        }

        if (!cancelled && typeof nextPrivacy === "string" && nextPrivacy.trim()) {
          setPrivacyBody(nextPrivacy);
        }
      } catch {
        // Keep fallback agreement copy when site settings are unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUsernameChange = (value: string) => {
    setUsername(normalizeUsername(value));
    setUsernameAvailability("idle");
    setUsernameAvailabilityMessage("");
    setExistingAccount(false);
  };

  const checkUsernameAvailability = async () => {
    const normalized = normalizeUsername(username);
    if (!/^[a-z0-9][a-z0-9_-]{3,19}$/.test(normalized)) {
      const message = "아이디는 영문, 숫자, 밑줄(_), 하이픈(-)을 사용해 4~20자로 입력해 주세요.";
      setUsernameAvailability("unavailable");
      setUsernameAvailabilityMessage(message);
      showErrorToast(message);
      return;
    }

    setUsernameAvailability("checking");
    setUsernameAvailabilityMessage("");
    try {
      const response = await fetch(`/api/auth/username-availability?username=${encodeURIComponent(normalized)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as { available?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "아이디 중복을 확인하지 못했습니다.");
      const available = data.available === true;
      setUsernameAvailability(available ? "available" : "unavailable");
      setUsernameAvailabilityMessage(data.message ?? (available ? "사용할 수 있는 아이디입니다." : "이미 사용 중인 아이디입니다."));
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "아이디 중복을 확인하지 못했습니다.";
      setUsernameAvailability("unavailable");
      setUsernameAvailabilityMessage(message);
      showErrorToast(message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setExistingAccount(false);

    if (usernameAvailability !== "available") {
      const message = "아이디 중복 확인을 먼저 진행해 주세요.";
      setErrorMessage(message);
      showErrorToast(message);
      return;
    }

    if (!passwordsMatchIgnoringCase(password, passwordConfirm)) {
      setErrorMessage(TEXT.passwordMismatch);
      showErrorToast(TEXT.passwordMismatch);
      return;
    }

    const validation = validateRegisterInput({
      name,
      username,
      contactPhone,
      email,
      password,
      agreeToTerms,
      agreeToPrivacy,
    });

    if (!validation.isValid || !validation.data) {
      const message = validation.errors[0] ?? TEXT.validationFallback;
      setErrorMessage(message);
      showErrorToast(message);
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validation.data),
    });

    const data = (await response.json()) as RegisterResponse;

    if (!response.ok) {
      const message = data.error ?? TEXT.submitError;
      if (data.code === "USERNAME_EXISTS") {
        setUsernameAvailability("unavailable");
        setUsernameAvailabilityMessage("이미 사용 중인 아이디입니다.");
      }
      if (data.code === "ACCOUNT_EXISTS") setExistingAccount(true);
      setErrorMessage(message);
      showErrorToast(message);
      setIsSubmitting(false);
      return;
    }

    const loginParams = new URLSearchParams({ registered: "1" });
    const callbackUrl = searchParams.get("callbackUrl");
    if (callbackUrl) {
      loginParams.set("callbackUrl", callbackUrl);
    }
    router.push(`${withBrowserTenantPath("/login", TENANT_TYPE)}?${loginParams.toString()}`);
    router.refresh();
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{TEXT.title}</CardTitle>
          <p className="text-sm text-slate-500">{TEXT.description}</p>
        </CardHeader>
        <CardContent>
          <div className="mb-5 border-l-2 border-service-500 bg-service-50 px-4 py-3 text-sm leading-6 text-slate-700">
            예전에 가입했는지 확실하지 않다면 새로 가입하기 전에{" "}
            <Link
              href={withTenantPrefix("/find-account", TENANT_TYPE)}
              className="font-semibold text-service-800 underline underline-offset-4"
            >
              아이디 찾기
            </Link>
            를 먼저 이용해 주세요. 연락처를 입력하지 않았던 기존 회원도 확인할 수 있습니다.
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">{TEXT.name}</Label>
              <Input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={TEXT.namePlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">{TEXT.username}</Label>
              <div className="flex gap-2">
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => handleUsernameChange(event.target.value)}
                  placeholder={TEXT.usernamePlaceholder}
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-describedby="username-availability-message"
                  aria-invalid={usernameAvailability === "unavailable"}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void checkUsernameAvailability()}
                  disabled={usernameAvailability === "checking"}
                  aria-controls="username-availability-message"
                >
                  {usernameAvailability === "checking" ? "확인 중" : "중복 확인"}
                </Button>
              </div>
              <p
                id="username-availability-message"
                className={`text-xs ${
                  usernameAvailability === "available"
                    ? "text-emerald-700"
                    : usernameAvailability === "unavailable"
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
                aria-live="polite"
              >
                {usernameAvailabilityMessage || "중복 확인을 완료해야 가입할 수 있습니다. 영문 대소문자는 같은 아이디로 처리됩니다."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">{TEXT.contactPhone}</Label>
              <Input id="contactPhone" type="tel" value={contactPhone} onChange={(event) => { setContactPhone(formatPoliceContactPhone(normalizeContactPhone(event.target.value))); setExistingAccount(false); }} placeholder={TEXT.contactPhonePlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{TEXT.email}</Label>
              <Input id="email" type="email" value={email} onChange={(event) => { setEmail(normalizeEmail(event.target.value)); setExistingAccount(false); }} placeholder={TEXT.emailPlaceholder} autoCapitalize="none" autoCorrect="off" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{TEXT.password}</Label>
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={TEXT.passwordPlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">{TEXT.passwordConfirm}</Label>
              <Input id="passwordConfirm" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder={TEXT.passwordConfirmPlaceholder} required />
            </div>
            <div className="space-y-4 rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agreeToTerms} onChange={(event) => setAgreeToTerms(event.target.checked)} />
                  <span className="font-medium">{TEXT.termsTitle}</span>
                </label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                  <span className="whitespace-pre-wrap">{termsBody}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agreeToPrivacy} onChange={(event) => setAgreeToPrivacy(event.target.checked)} />
                  <span className="font-medium">{TEXT.privacyTitle}</span>
                </label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                  <span className="whitespace-pre-wrap">{privacyBody}</span>
                </div>
              </div>
            </div>
            {errorMessage ? <p className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
            {existingAccount ? (
              <div className="space-y-2 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>기존 계정을 확인한 뒤 로그인해 주세요.</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 font-medium">
                  <Link href={withTenantPrefix("/find-account", TENANT_TYPE)} className="underline underline-offset-4">아이디 찾기</Link>
                  <Link href={withTenantPrefix("/forgot-password", TENANT_TYPE)} className="underline underline-offset-4">비밀번호 찾기</Link>
                  <Link href={withTenantPrefix("/login", TENANT_TYPE)} className="underline underline-offset-4">로그인</Link>
                </div>
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={isSubmitting || usernameAvailability !== "available"}>{isSubmitting ? TEXT.submitBusy : TEXT.submitIdle}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            {TEXT.loginPrompt}{" "}
            <Link
              href={
                searchParams.get("callbackUrl")
                  ? `${withTenantPrefix("/login", TENANT_TYPE)}?callbackUrl=${encodeURIComponent(searchParams.get("callbackUrl") as string)}`
                  : withTenantPrefix("/login", TENANT_TYPE)
              }
              className="underline-offset-4 hover:underline"
            >
              {TEXT.loginLink}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
