"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { practicalAssessmentCompetencies } from "@/components/assessment/assessment-competencies";
import { assessmentResultHref } from "@/components/assessment/assessment-links";
import { useLanguage } from "@/components/language-provider";
import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

function scoreColor(score: number) {
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "var(--amber)";
  return "var(--red)";
}

export default function AssessmentSkillsPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
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
    return <AssessmentLoading label="Loading your skill scores…" />;
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
        message="Your completed practical assessment has no saved skill scores."
        retry={() => void refresh().catch(() => {})}
      />
    );
  }

  const skillScoresByCompetency = new Map(
    assessment.evaluation.skill_scores.map((item) => [item.competency, item]),
  );

  return (
    <div>
      <AssessmentStepper
        currentStep={5}
        assessmentStatus={assessment.status}
        videoStatus={assessment.video_status}
        historyAssessmentId={historyAssessmentId}
      />
      <PageHeading
        title={t("Skill-wise Scoring")}
        description={t("Step 5 of 6 — Review your scores across the six practical-work skill areas.")}
      />

      <Card className="question-card assessment-results-section">
        <h2>{t("Skill-wise Scoring")}</h2>
        <div className="assessment-skill-list">
          {practicalAssessmentCompetencies.map(({ key, label }) => {
            const skill = skillScoresByCompetency.get(key);
            const score = skill?.score ?? 0;
            return (
              <div className="assessment-skill-result" key={key}>
                <div>
                  <strong>{t(label)}</strong>
                  <span>{skill?.rationale ?? t("No score rationale was returned for this skill area.")}</span>
                </div>
                <div className="skill-row">
                  <span className="assessment-skill-confidence">
                    {t("{{score}}% confidence", { score: new Intl.NumberFormat(locale).format(skill?.confidence ?? 0) })}
                  </span>
                  <ProgressBar value={score} tone={scoreTone(score)} />
                  <strong style={{ color: scoreColor(score) }}>{new Intl.NumberFormat(locale).format(score)}%</strong>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="wizard-actions">
        <LinkButton
          href={assessmentResultHref("results", historyAssessmentId)}
          variant="secondary"
          icon={ArrowLeft}
        >
          {t("Back")}
        </LinkButton>
        <LinkButton
          href={assessmentResultHref("suggestions", historyAssessmentId)}
          icon={ArrowRight}
        >
          {t("Next: View Suggestions")}
        </LinkButton>
      </div>
    </div>
  );
}
