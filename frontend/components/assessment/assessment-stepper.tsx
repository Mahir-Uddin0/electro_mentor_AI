import Link from "next/link";
import { Check } from "lucide-react";

import type { PracticalAssessmentStatus } from "@/lib/api/client";

const steps = [
  { number: 1, label: "Upload", href: "/assessments/new/upload" },
  { number: 2, label: "Questions", href: "/assessments/new/questions" },
  { number: 3, label: "Answers", href: "/assessments/new/answers" },
  { number: 4, label: "Results", href: "/assessments/new/results" },
  { number: 5, label: "Suggestions", href: "/assessments/new/suggestions" },
  { number: 6, label: "Checklist", href: "/assessments/new/checklist" },
] as const;

export function AssessmentStepper({
  currentStep,
  assessmentStatus,
}: {
  currentStep: number;
  assessmentStatus?: PracticalAssessmentStatus | null;
}) {
  return (
    <nav className="assessment-stepper" aria-label="Assessment progress">
      {steps.map((step) => {
        const state = step.number < currentStep ? "done" : step.number === currentStep ? "active" : "";
        const accessible = assessmentStatus === "completed"
          ? step.number >= 4
          : assessmentStatus === "draft"
            ? step.number <= 3
            : step.number === 1;
        const contents = (
          <>
            <span className="step-dot" aria-hidden="true">
              {step.number < currentStep ? <Check size={15} strokeWidth={2.5} /> : step.number}
            </span>
            <span>{step.label}</span>
          </>
        );

        return accessible ? (
          <Link
            key={step.number}
            href={step.href}
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
            title="Complete the earlier assessment steps first"
          >
            {contents}
          </span>
        );
      })}
    </nav>
  );
}
