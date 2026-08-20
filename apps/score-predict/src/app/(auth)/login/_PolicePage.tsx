"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/providers/ToastProvider";
import UserFormPageShell from "@/components/layout/UserFormPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeUsername, validateLoginInput } from "@/lib/police/validations";
import { resolveSafeAuthCallback } from "@/lib/auth-callback";
import { parseTenantTypeFromHostname, withTenantPrefix } from "@/lib/tenant";

const TENANT_TYPE = "police";
const POST_LOGIN_REDIRECT_PATH = withTenantPrefix("/", TENANT_TYPE);

const TEXT = {
  title: "\uB85C\uADF8\uC778",
  description: "\uC544\uC774\uB514\uC640 \uBE44\uBC00\uBC88\uD638\uB85C \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.",
  username: "\uC544\uC774\uB514",
  usernamePlaceholder: "\uC544\uC774\uB514\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  password: "\uBE44\uBC00\uBC88\uD638",
  passwordPlaceholder: "\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  validationFallback: "\uB85C\uADF8\uC778 \uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  invalidCredentials: "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  registered: "\uD68C\uC6D0\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.",
  submitIdle: "\uB85C\uADF8\uC778",
  submitBusy: "\uB85C\uADF8\uC778 \uC911...",
  forgotPassword: "\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30",
  register: "\uD68C\uC6D0\uAC00\uC785",
  adminPrefix: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778\uC740",
  adminLink: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778",
  adminSuffix: "\uC5D0\uC11C \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.",
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestedCallbackUrl = searchParams.get("callbackUrl");
  const isRegistered = searchParams.get("registered") === "1";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const validation = validateLoginInput({ username, password });
    if (!validation.isValid || !validation.data) {
      const message = validation.errors[0] ?? TEXT.validationFallback;
      setErrorMessage(message);
      showErrorToast(message);
      return;
    }

    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username: validation.data.username,
      password: validation.data.password,
      redirect: false,
    });

    if (result?.ok) {
      const fallbackCallback =
        parseTenantTypeFromHostname(window.location.hostname) === TENANT_TYPE
          ? "/"
          : POST_LOGIN_REDIRECT_PATH;
      const callbackUrl = resolveSafeAuthCallback(
        requestedCallbackUrl,
        fallbackCallback,
        TENANT_TYPE
      );
      router.replace(callbackUrl);
      router.refresh();
      return;
    }

    setErrorMessage(TEXT.invalidCredentials);
    showErrorToast(TEXT.invalidCredentials);
    setIsSubmitting(false);
  };

  return (
    <UserFormPageShell title={TEXT.title} description={TEXT.description}>
      {isRegistered ? <p className="mb-4 border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{TEXT.registered}</p> : null}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="username" className="user-data-label">{TEXT.username}</Label>
          <Input id="username" type="text" value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} placeholder={TEXT.usernamePlaceholder} autoCapitalize="none" autoCorrect="off" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="user-data-label">{TEXT.password}</Label>
          <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={TEXT.passwordPlaceholder} required />
        </div>
        {errorMessage ? <p className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>{isSubmitting ? TEXT.submitBusy : TEXT.submitIdle}</Button>
      </form>
      <p className="mt-3 text-xs text-slate-500">아이디와 비밀번호는 영문 대소문자를 구분하지 않습니다.</p>
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-sm">
        <Link href={withTenantPrefix("/find-account", TENANT_TYPE)} className="text-slate-600 underline-offset-4 hover:text-service-700 hover:underline">아이디 찾기</Link>
        <Link href={withTenantPrefix("/forgot-password", TENANT_TYPE)} className="text-slate-600 underline-offset-4 hover:text-service-700 hover:underline">{TEXT.forgotPassword}</Link>
        <Link href={withTenantPrefix("/register", TENANT_TYPE)} className="text-slate-600 underline-offset-4 hover:text-service-700 hover:underline">{TEXT.register}</Link>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {TEXT.adminPrefix}{" "}
        <Link href={withTenantPrefix("/admin-login", TENANT_TYPE)} className="underline-offset-4 hover:underline">{TEXT.adminLink}</Link>
        {" "}{TEXT.adminSuffix}
      </p>
    </UserFormPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
