"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckSquare2,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";

import { practicalAssessmentCompetencyLabels } from "@/components/assessment/assessment-competencies";
import { assessmentResultHref } from "@/components/assessment/assessment-links";
import { useLanguage } from "@/components/language-provider";
import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Card, LinkButton, PageHeading } from "@/components/ui";
import type { PracticalAssessmentPriority } from "@/lib/api/client";

function priorityTone(priority: PracticalAssessmentPriority) {
  if (priority === "high") return "red" as const;
  if (priority === "medium") return "amber" as const;
  return "green" as const;
}

function suggestionIcon(competency: string): LucideIcon {
  if (competency === "safety_procedures") return ShieldCheck;
  if (competency === "tool_usage" || competency === "work_quality") return Wrench;
  if (competency === "technical_knowledge" || competency === "documentation") return BookOpen;
  return BarChart3;
}

export default function AssessmentSuggestionsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const {
    assessment,
    loading,
    error,
    refresh,
    historyAssessmentId,
  } = usePracticalAssessment();

  useEffect(() => {
    if (!loading && assessment?.status === "draft") {
      router.replace(
        assessment.video_status === "answers_generated"
          ? "/assessments/new/answers"
          : "/assessments/new/questions",
      );
    }
  }, [assessment, loading, router]);

  if (loading || assessment?.status === "draft") {
    return <AssessmentLoading label="Loading your suggestions…" />;
  }
  if (error) {
    return (
      <AssessmentLoadError
        message={error}
        retry={() => void refresh().catch(() => {})}
      />
    );
  }
  if (!assessment) return <AssessmentMissing />;
  if (!assessment.evaluation) {
    return (
      <AssessmentLoadError
        message="Your completed practical assessment has no saved improvement suggestions."
        retry={() => void refresh().catch(() => {})}
      />
    );
  }
  return (
    <div>
      <AssessmentStepper
        currentStep={6}
        assessmentStatus={assessment.status}
        videoStatus={assessment.video_status}
        historyAssessmentId={historyAssessmentId}
      />
      <PageHeading
        title={t("Improvement Suggestions")}
        description={t("Step 6 of 6 — Prioritized feedback generated from your practical-work video and final answers.")}
      />

      <Card className="assessment-suggestion-summary">
        <span className="icon-box icon-blue"><BarChart3 size={19} /></span>
        <div>
          <strong>{t("Focused on your demonstrated work")}</strong>
          <p>
            {t("These suggestions target the strongest opportunities Gemini identified from the video evidence and your answers.")}
          </p>
        </div>
        <Badge>{t("Work feedback")}</Badge>
      </Card>

      <div className="assessment-suggestion-list">
        {assessment.evaluation.suggestions.map((suggestion, index) => {
          const Icon = suggestionIcon(suggestion.competency);
          const tone = priorityTone(suggestion.priority);
          return (
            <Card
              className={`suggestion-card assessment-suggestion priority-${suggestion.priority}`}
              key={`${suggestion.competency}-${suggestion.title}-${index}`}
            >
              <span className={`icon-box icon-${tone === "red" ? "amber" : tone}`}>
                <Icon size={18} />
              </span>
              <div>
                <div className="chips">
                  <Badge tone={tone}>{t(suggestion.priority === "high" ? "High" : suggestion.priority === "medium" ? "Medium" : "Low")} {t("Priority")}</Badge>
                  <Badge tone="gray">
                    {t(practicalAssessmentCompetencyLabels.get(suggestion.competency) ?? suggestion.competency.replaceAll("_", " "))}
                  </Badge>
                </div>
                <h3>{suggestion.title}</h3>
                <p>{suggestion.description}</p>
                <strong className="assessment-next-steps-title">{t("ACTION STEPS")}</strong>
                <ol className="assessment-next-steps">
                  {suggestion.action_steps.map((step, stepIndex) => (
                    <li key={`${stepIndex}-${step}`}>
                      <CheckSquare2 size={15} />
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="assessment-guide-link">
        <BookOpen size={18} />
        <div>
          <strong>{t("Continue learning with the Guide Library")}</strong>
          <p>{t("Use relevant wiring and circuit guides as you work through these learning actions.")}</p>
        </div>
        <LinkButton href="/guides" variant="secondary">{t("Open Guides")}</LinkButton>
      </div>

      <div className="wizard-actions">
        <LinkButton
          href={assessmentResultHref("skills", historyAssessmentId)}
          variant="secondary"
          icon={ArrowLeft}
        >
          {t("Back")}
        </LinkButton>
        <LinkButton href="/dashboard" icon={ArrowRight}>
          {t("Finish Assessment")}
        </LinkButton>
      </div>
    </div>
  );
}
