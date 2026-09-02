"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";

import { PracticalAssessmentProvider } from "@/components/assessment/assessment-provider";
import { useLanguage } from "@/components/language-provider";

export default function NewAssessmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="full-loader"><span className="spinner" /> {t("Loading assessment…")}</div>}>
      <PracticalAssessmentProvider>{children}</PracticalAssessmentProvider>
    </Suspense>
  );
}
