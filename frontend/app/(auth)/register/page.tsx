"use client";

import { Eye, EyeOff, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/brand";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui";
import { AuthApiError, isPreviewModeAllowed } from "@/lib/auth/client";

export default function RegisterPage() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { enterPreviewMode, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("Password must be at least 8 characters."));
    if (password !== confirmation) return setError(t("The passwords do not match."));
    if (!accepted) return setError(t("Please accept the terms to continue."));

    setSubmitting(true);
    try {
      await register({ email, password, displayName: fullName });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        t(
          error instanceof AuthApiError
            ? error.message
            : "Authentication could not be completed.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openPreview() {
    enterPreviewMode();
    router.replace("/dashboard");
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Brand />
        <div className="auth-copy">
          <h1>{t("Build safer electrical skills, one task at a time.")}</h1>
          <p>{t("Create your trainee account to save progress, review assessments, and get AI-supported guidance.")}</p>
        </div>
        <div className="auth-feature-list"><span>{t("Guided practice")}</span><span>{t("Progress tracking")}</span><span>{t("Bangla-ready learning")}</span></div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="language-switch auth-language-switch" aria-label={t("Language selection")}>{(["en", "bn"] as const).map((item) => <button type="button" key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)}>{item.toUpperCase()}</button>)}</div>
          <h2>{t("Create your account")}</h2>
          <p>{t("Start your ElectroMentor learning journey.")}</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field"><span>{t("Full name")}</span><input autoComplete="name" maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} required placeholder={t("Your full name")} /></label>
            <label className="field"><span>{t("Email address")}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="student@example.com" /></label>
            <label className="field">
              <span>{t("Password")}</span>
              <span className="password-wrap">
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={t("At least 8 characters")} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("Hide password") : t("Show password")}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
            <label className="field"><span>{t("Confirm password")}</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required placeholder={t("Repeat your password")} /></label>
            <label className="auth-options"><span><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> {t("I agree to the terms and safety policy.")}</span></label>
            {error && <div className="auth-message error" role="alert">{error}</div>}
            <Button type="submit" icon={UserPlus} disabled={submitting || !fullName || !email || !password || !confirmation}>{submitting ? t("Creating account…") : t("Create account")}</Button>
          </form>
          <p className="auth-switch">{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></p>
          {isPreviewModeAllowed && (
            <div className="preview-note">
              <p>{t("Mock API mode is active.")}</p>
              <Button type="button" variant="secondary" icon={ShieldCheck} onClick={openPreview}>{t("Open safe preview")}</Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
