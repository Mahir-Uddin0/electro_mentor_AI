"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import type {
  PracticalAssessmentStatus,
  PracticalAssessmentVideoStatus,
} from "@/lib/api/client";
import { assessmentResultHref } from "@/components/assessment/assessment-links";
import { useLanguage } from "@/components/language-provider";

const steps = [
  { number: 1, label: "Upload", href: "/assessments/new/upload" },
  { number: 2, label: "Questions", href: "/assessments/new/questions" },
  { number: 3, label: "Answers", href: "/assessments/new/answers" },
  { number: 4, label: "Results", href: "/assessments/new/results" },
  { number: 5, label: "Skills", href: "/assessments/new/skills" },
  { number: 6, label: "Suggestions", href: "/assessments/new/suggestions" },
] as const;

export function AssessmentStepper({
  currentStep,
  assessmentStatus,
  videoStatus,
  historyAssessmentId,
}: {
  currentStep: number;
  assessmentStatus?: PracticalAssessmentStatus | null;
  videoStatus?: PracticalAssessmentVideoStatus | null;
  historyAssessmentId?: string | null;
}) {
  const { locale, t } = useLanguage();
  return (
    <nav className="assessment-stepper" aria-label={t("Practical assessment progress")}>
      {steps.map((step) => {
        const href = step.number >= 4
          ? assessmentResultHref(
              step.number === 4
                ? "results"
                : step.number === 5
                  ? "skills"
                  : "suggestions",
              historyAssessmentId,
            )
          : step.href;
        const state = step.number < currentStep ? "done" : step.number === currentStep ? "active" : "";
        const accessible = assessmentStatus === "completed"
          ? step.number >= 4
          : assessmentStatus === "draft"
            ? step.number <= (videoStatus === "answers_generated" ? 3 : 2)
            : step.number === 1;
        const contents = (
          <>
            <span className="step-dot" aria-hidden="true">
              {step.number < currentStep ? <Check size={15} strokeWidth={2.5} /> : new Intl.NumberFormat(locale).format(step.number)}
            </span>
            <span>{t(step.label)}</span>
          </>
        );

        return accessible ? (
          <Link
            key={step.number}
            href={href}
            className={`assessment-step ${state}`}
            aria-current={step.number === currentStep ? "step" : undefined}
          >
            {contents}
          </Link>
        ) : (
          <span
            key={step.number}
            className={`assessment-step ${state} locked`}
            aria-current={step.number === currentStep ? "step" : undefined}
            aria-disabled="true"
            title={t("Complete the earlier assessment steps first")}
          >
            {contents}
          </span>
        );
      })}
    </nav>
  );
}
