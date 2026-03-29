"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withTenantPrefix } from "@/lib/tenant";
import {
  normalizeEmail,
  normalizeResetCode,
  normalizeUsername,
  validatePasswordResetRequestInput,
  validatePasswordStrength,
} from "@/lib/validations";

interface PasswordResetResponse {
  message?: string;
  error?: string;
  previewFile?: string;
}

const TEXT = {
  title: "\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30",
  description:
    "\uAC00\uC785\uD55C \uC774\uBA54\uC77C\uB85C \uC778\uC99D\uCF54\uB4DC\uB97C \uBC1B\uC544 \uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uC124\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  username: "\uC544\uC774\uB514",
  usernamePlaceholder: "\uC544\uC774\uB514\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  email: "\uC774\uBA54\uC77C",
  emailPlaceholder: "\uAC00\uC785\uD55C \uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  requestFallback: "\uC785\uB825\uAC12\uC744 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  requestError: "\uC778\uC99D\uCF54\uB4DC \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  requestBusy: "\uC778\uC99D\uCF54\uB4DC \uBC1C\uC1A1 \uC911...",
  requestIdle: "\uC778\uC99D\uCF54\uB4DC \uBC1B\uAE30",
  requestSent: "\uC774\uBA54\uC77C\uB85C \uC778\uC99D\uCF54\uB4DC\uB97C \uBC1C\uC1A1\uD588\uC2B5\uB2C8\uB2E4. \uBA54\uC77C\uD568\uC744 \uD655\uC778\uD55C \uB4A4 \uC544\uB798\uC5D0 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  previewPrefix: "\uB85C\uCEEC \uAC1C\uBC1C \uD658\uACBD\uC774\uB77C \uBA54\uC77C\uC744 \uD30C\uC77C\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4:",
  resetCode: "\uC778\uC99D\uCF54\uB4DC",
  resetCodePlaceholder: "\uC608: ABCD-1234",
  password: "\uC0C8 \uBE44\uBC00\uBC88\uD638",
  passwordPlaceholder: "\uC18C\uBB38\uC790, \uC22B\uC790, \uD2B9\uC218\uBB38\uC790 \uD3EC\uD568 8\uC790 \uC774\uC0C1",
  passwordConfirm: "\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778",
  passwordConfirmPlaceholder: "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  passwordMismatch: "\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  passwordFallback: "\uBE44\uBC00\uBC88\uD638\uB97C \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  resetCodeError: "\uC778\uC99D\uCF54\uB4DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  confirmError: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  confirmBusy: "\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD \uC911...",
  confirmIdle: "\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD",
  successDefault: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC7AC\uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  backToLogin: "\uB85C\uADF8\uC778\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30",
};

const TENANT_TYPE = "police";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { showErrorToast } = useToast();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewFile, setPreviewFile] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);

  const handleRequestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setPreviewFile("");

    const validation = validatePasswordResetRequestInput({ username, email });
    if (!validation.isValid || !validation.data) {
      const message = validation.errors[0] ?? TEXT.requestFallback;
      setErrorMessage(message);
      showErrorToast(message);
      return;
    }

    setIsRequesting(true);

    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validation.data),
    });

    const data = (await response.json()) as PasswordResetResponse;

    if (!response.ok) {
      const message = data.error ?? TEXT.requestError;
      setErrorMessage(message);
      showErrorToast(message);
      setIsRequesting(false);
      return;
    }

    setCodeRequested(true);
    setPreviewFile(data.previewFile ?? "");
    setSuccessMessage(data.message ?? TEXT.requestSent);
    setIsRequesting(false);
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (password !== passwordConfirm) {
      setErrorMessage(TEXT.passwordMismatch);
      showErrorToast(TEXT.passwordMismatch);
      return;
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid || !passwordValidation.data) {
      const message = passwordValidation.errors[0] ?? TEXT.passwordFallback;
      setErrorMessage(message);
      showErrorToast(message);
      return;
    }

    if (normalizeResetCode(resetCode).length !== 8) {
      setErrorMessage(TEXT.resetCodeError);
      showErrorToast(TEXT.resetCodeError);
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: normalizeUsername(username),
        email: normalizeEmail(email),
        resetCode: normalizeResetCode(resetCode),
        password: passwordValidation.data,
      }),
    });

    const data = (await response.json()) as PasswordResetResponse;

    if (!response.ok) {
      const message = data.error ?? TEXT.confirmError;
      setErrorMessage(message);
      showErrorToast(message);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(data.message ?? TEXT.successDefault);
    setIsSubmitting(false);
    setTimeout(() => {
      router.push(withTenantPrefix("/login", TENANT_TYPE));
    }, 1200);
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{TEXT.title}</CardTitle>
          <p className="text-sm text-slate-500">{TEXT.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" onSubmit={handleRequestCode}>
            <div className="space-y-2">
              <Label htmlFor="username">{TEXT.username}</Label>
              <Input id="username" type="text" value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} placeholder={TEXT.usernamePlaceholder} autoCapitalize="none" autoCorrect="off" required disabled={codeRequested} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{TEXT.email}</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(normalizeEmail(event.target.value))} placeholder={TEXT.emailPlaceholder} autoCapitalize="none" autoCorrect="off" required disabled={codeRequested} />
            </div>
            {!codeRequested ? (
              <Button type="submit" className="w-full" disabled={isRequesting}>{isRequesting ? TEXT.requestBusy : TEXT.requestIdle}</Button>
            ) : (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{TEXT.requestSent}</div>
            )}
          </form>

          {previewFile ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{TEXT.previewPrefix} {previewFile}</p> : null}

          {codeRequested ? (
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <div className="space-y-2">
                <Label htmlFor="resetCode">{TEXT.resetCode}</Label>
                <Input id="resetCode" type="text" value={resetCode} onChange={(event) => setResetCode(normalizeResetCode(event.target.value))} placeholder={TEXT.resetCodePlaceholder} autoCapitalize="characters" autoCorrect="off" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{TEXT.password}</Label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={TEXT.passwordPlaceholder} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">{TEXT.passwordConfirm}</Label>
                <Input id="passwordConfirm" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder={TEXT.passwordConfirmPlaceholder} required />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? TEXT.confirmBusy : TEXT.confirmIdle}</Button>
            </form>
          ) : null}

          {errorMessage ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p> : null}
          {successMessage ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

          <p className="text-center text-sm text-slate-600">
            <Link href={withTenantPrefix("/login", TENANT_TYPE)} className="underline-offset-4 hover:underline">{TEXT.backToLogin}</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
