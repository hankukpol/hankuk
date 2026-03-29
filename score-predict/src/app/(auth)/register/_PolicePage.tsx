"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { withTenantPrefix } from "@/lib/tenant";

interface RegisterResponse {
  message?: string;
  error?: string;
}

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
  passwordPlaceholder: "\uC18C\uBB38\uC790, \uC22B\uC790, \uD2B9\uC218\uBB38\uC790 \uD3EC\uD568 8\uC790 \uC774\uC0C1",
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
    "\uC218\uC9D1 \uD56D\uBAA9\uC740 \uC774\uB984, \uC544\uC774\uB514, \uC774\uBA54\uC77C\uC774\uBA70 \uD68C\uC6D0\uAC00\uC785\uACFC \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815, \uC11C\uBE44\uC2A4 \uC81C\uACF5 \uBAA9\uC801\uC73C\uB85C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
  loginPrompt: "\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uB098\uC694?",
  loginLink: "\uB85C\uADF8\uC778",
};

export default function RegisterPage() {
  const router = useRouter();
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (password !== passwordConfirm) {
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
      setErrorMessage(message);
      showErrorToast(message);
      setIsSubmitting(false);
      return;
    }

    router.push(`${withTenantPrefix("/login", TENANT_TYPE)}?registered=1`);
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
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">{TEXT.name}</Label>
              <Input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={TEXT.namePlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">{TEXT.username}</Label>
              <Input id="username" type="text" value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} placeholder={TEXT.usernamePlaceholder} autoCapitalize="none" autoCorrect="off" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">{TEXT.contactPhone}</Label>
              <Input id="contactPhone" type="tel" value={contactPhone} onChange={(event) => setContactPhone(normalizeContactPhone(event.target.value))} placeholder={TEXT.contactPhonePlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{TEXT.email}</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(normalizeEmail(event.target.value))} placeholder={TEXT.emailPlaceholder} autoCapitalize="none" autoCorrect="off" required />
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
                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                  <span className="whitespace-pre-wrap">{termsBody}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agreeToPrivacy} onChange={(event) => setAgreeToPrivacy(event.target.checked)} />
                  <span className="font-medium">{TEXT.privacyTitle}</span>
                </label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                  <span className="whitespace-pre-wrap">{privacyBody}</span>
                </div>
              </div>
            </div>
            {errorMessage ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? TEXT.submitBusy : TEXT.submitIdle}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            {TEXT.loginPrompt}{" "}
            <Link href={withTenantPrefix("/login", TENANT_TYPE)} className="underline-offset-4 hover:underline">{TEXT.loginLink}</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
