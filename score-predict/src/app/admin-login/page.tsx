"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/ToastProvider";
import { normalizeUsername } from "@/lib/validations";

const POST_LOGIN_REDIRECT_PATH = "/admin";

const TEXT = {
  title: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778",
  description:
    "\uAD00\uB9AC\uC790 \uC804\uC6A9 \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4. \uC77C\uBC18 \uD68C\uC6D0\uC740 \uC77C\uBC18 \uB85C\uADF8\uC778 \uD654\uBA74\uC744 \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.",
  username: "\uAD00\uB9AC\uC790 \uC544\uC774\uB514",
  usernamePlaceholder: "\uAD00\uB9AC\uC790 \uC544\uC774\uB514\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  password: "\uBE44\uBC00\uBC88\uD638",
  passwordPlaceholder: "\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  otp: "\u0032\uCC28 \uC778\uC99D \uCF54\uB4DC",
  otpPlaceholder: "\u0036\uC790\uB9AC \uCF54\uB4DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694. (\uC124\uC815\uB41C \uACBD\uC6B0)",
  required: "\uAD00\uB9AC\uC790 \uC544\uC774\uB514\uC640 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  invalid: "\uAD00\uB9AC\uC790 \uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  adminOnly: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD55C \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4.",
  otpHelp: "\uAD00\uB9AC\uC790 2\uCC28 \uC778\uC99D\uC744 \uC124\uC815\uD55C \uACBD\uC6B0 Google Authenticator, 1Password, Microsoft Authenticator \uB4F1\uC758 \u0036\uC790\uB9AC \uCF54\uB4DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  help:
    "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30\uB294 \uBCC4\uB3C4 \uC790\uB3D9 \uAE30\uB2A5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD544\uC694\uD558\uBA74 \uC6B4\uC601\uC790 \uB610\uB294 \uC0C1\uC704 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uCD08\uAE30\uD654\uB97C \uC694\uCCAD\uD574 \uC8FC\uC138\uC694.",
  submitIdle: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778",
  submitBusy: "\uB85C\uADF8\uC778 \uC911...",
};

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") ?? POST_LOGIN_REDIRECT_PATH;
  const adminOnlyError = searchParams.get("error") === "admin_only";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const normalizedUsername = normalizeUsername(username);
    const trimmedPassword = password.trim();

    if (!normalizedUsername || !trimmedPassword) {
      setErrorMessage(TEXT.required);
      return;
    }

    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username: normalizedUsername,
      password: trimmedPassword,
      adminOnly: "true",
      adminOtp: adminOtp.trim(),
      redirect: false,
    });

    if (result?.ok) {
      router.replace(callbackUrl);
      router.refresh();
      return;
    }

    setErrorMessage(TEXT.invalid);
    showErrorToast(TEXT.invalid);
    setIsSubmitting(false);
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{TEXT.title}</CardTitle>
          <p className="text-sm text-slate-500">{TEXT.description}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">{TEXT.username}</Label>
              <Input id="username" type="text" value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} placeholder={TEXT.usernamePlaceholder} autoCapitalize="none" autoCorrect="off" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{TEXT.password}</Label>
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={TEXT.passwordPlaceholder} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-otp">{TEXT.otp}</Label>
              <Input id="admin-otp" type="text" inputMode="numeric" value={adminOtp} onChange={(event) => setAdminOtp(event.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder={TEXT.otpPlaceholder} maxLength={6} />
              <p className="text-xs text-slate-500">{TEXT.otpHelp}</p>
            </div>
            {adminOnlyError ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{TEXT.adminOnly}</p> : null}
            {errorMessage ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p> : null}
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{TEXT.help}</p>
            <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? TEXT.submitBusy : TEXT.submitIdle}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginContent />
    </Suspense>
  );
}
