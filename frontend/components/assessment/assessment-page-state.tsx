"use client";

import { AlertCircle, ClipboardList } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button, Card, LinkButton } from "@/components/ui";

export function AssessmentLoading({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="full-loader assessment-loader">
      <span className="spinner" /> {t(label ?? "Loading your practical assessment…")}
    </div>
  );
}

export function AssessmentLoadError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="assessment-state-card">
      <span className="icon-box icon-amber"><AlertCircle size={20} /></span>
      <div>
        <h1>{t("Couldn't load your practical assessment")}</h1>
        <p>{message}</p>
      </div>
      <Button variant="secondary" onClick={retry}>{t("Try Again")}</Button>
    </Card>
  );
}

export function AssessmentMissing({
  description = "Upload a practical-work video before opening this step.",
}: {
  description?: string;
}) {
  const { t } = useLanguage();
  return (
    <Card className="assessment-state-card">
      <span className="icon-box icon-blue"><ClipboardList size={20} /></span>
      <div>
        <h1>{t("No practical assessment started")}</h1>
        <p>{t(description)}</p>
      </div>
      <LinkButton href="/assessments/new/upload">{t("Start Assessment")}</LinkButton>
    </Card>
  );
}
