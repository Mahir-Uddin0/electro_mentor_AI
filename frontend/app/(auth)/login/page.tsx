"use client";

import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui";
import {
  getSupabaseBrowserClient,
  isPreviewModeAllowed,
} from "@/lib/supabase/client";

function requestedPath() {
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { configured, enterPreviewMode, loading, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("reason") === "session_expired") {
      setError("Your session expired. Please sign in again.");
    } else if (searchParams.get("error") === "confirmation_failed") {
      setError("The email confirmation link is invalid or has expired. Please try signing in again.");
    }
    if (!loading && session) router.replace(requestedPath());
  }, [loading, router, session]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Use preview mode for now.");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace(requestedPath());
    router.refresh();
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
          <h1>Practical electrical learning, powered by AI.</h1>
          <p>Diagnose wiring faults, follow safety guidance, and build workshop confidence from one learning workspace.</p>
        </div>
        <div className="auth-feature-list">
          <span>AI troubleshooting</span><span>Photo fault detection</span><span>Safety checklists</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p>Sign in to continue to your learning workspace.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="student@example.com" />
            </label>
            <label className="field">
              <span>Password</span>
              <span className="password-wrap">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter your password" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <div className="auth-message error" role="alert">{error}</div>}
            <Button type="submit" icon={LogIn} disabled={submitting || !email || !password}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="auth-switch">New to ElectroMentor? <Link href="/register">Create an account</Link></p>
          {isPreviewModeAllowed && (
            <div className="preview-note">
              <p>{configured ? "Mock API mode is active." : "Supabase credentials have not been added yet."}</p>
              <Button type="button" variant="secondary" icon={ShieldCheck} onClick={openPreview}>Open safe preview</Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
