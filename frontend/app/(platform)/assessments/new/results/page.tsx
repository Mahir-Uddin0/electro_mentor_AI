"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { assessmentResultHref } from "@/components/assessment/assessment-links";
import { useLanguage } from "@/components/language-provider";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";

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

function evidenceLabel(value: "video" | "answer" | "both" | "insufficient") {
  if (value === "both") return "Video + answer";
  if (value === "video") return "Video evidence";
  if (value === "answer") return "Answer evidence";
  return "Limited evidence";
}

export default function AssessmentResultsPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const {
    assessment,
    questions,
    loading,
    error,
    refresh,
    historyAssessmentId,
  } = usePracticalAssessment();
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

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
    return <AssessmentLoading label="Loading your assessment results…" />;
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

  const evaluation = assessment.evaluation;
  if (!evaluation || assessment.overall_score === null) {
    return (
      <AssessmentLoadError
        message="Your completed practical assessment is missing its generated results."
        retry={() => void refresh().catch(() => {})}
      />
    );
  }

  const overallScore = assessment.overall_score;
  const tone = scoreTone(overallScore);
  const feedbackByQuestion = new Map(
    evaluation.question_feedback.map((item) => [item.question_id, item]),
  );

  return (
    <div>
      <AssessmentStepper
        currentStep={4}
        assessmentStatus={assessment.status}
        videoStatus={assessment.video_status}
        historyAssessmentId={historyAssessmentId}
      />
      <PageHeading
        title={t("Assessment Results")}
        description={t("Step 4 of 6 — Review the question-by-question results for your practical work.")}
      />

      <div className="assessment-answer-progress">
        <div>
          <strong>{t("Assessment complete")}</strong>
          <strong>{t("{{answered}} of {{total}} answers reviewed", { answered: new Intl.NumberFormat(locale).format(evaluation.question_feedback.length), total: new Intl.NumberFormat(locale).format(questions.length) })}</strong>
        </div>
        <ProgressBar value={100} tone="green" />
      </div>

      <Card className="score-card assessment-score-card">
        <div
          className="score-ring"
          style={{ borderColor: scoreColor(overallScore) }}
        >
          <span>
            <strong style={{ color: scoreColor(overallScore) }}>{new Intl.NumberFormat(locale).format(overallScore)}%</strong>
            <small>{t("Assessment score")}</small>
          </span>
        </div>
        <div className="assessment-score-summary">
          <div className="chips">
            <Badge tone={tone}>{t("Grade {{grade}}", { grade: assessment.grade ?? "—" })}</Badge>
            <Badge tone={assessment.passed ? "green" : "amber"}>
              {assessment.passed ? <CheckCircle2 size={12} /> : <Info size={12} />}
              {assessment.passed ? t("PASSED") : t("NEEDS IMPROVEMENT")}
            </Badge>
          </div>
          <h2>{t("Practical work assessment")}</h2>
          <p>{evaluation.summary}</p>
          <span>{t("Created {{date}} from your work video and final answers", { date: assessment.completed_at ? new Date(assessment.completed_at).toLocaleDateString(locale) : t("recently") })}</span>
        </div>
      </Card>

      <div className="alert alert-amber assessment-result-disclaimer">
        <Info size={19} />
        <div>
          <strong>{t("An AI-supported practical assessment")}</strong>
          <p>{t("This result is based only on visible video evidence and your answers. It supports learning and feedback, but it is not a formal qualification, certification, electrical inspection, or proof that work is safe to energize.")}</p>
        </div>
      </div>

      <Card className="question-card assessment-results-section">
        <h2>{t("Question Results")}</h2>
        <div className="assessment-feedback-list">
          {questions.map((question, index) => {
            const feedback = feedbackByQuestion.get(question.id);
            if (!feedback) return null;
            const expanded = expandedQuestion === question.id;
            const feedbackTone = scoreTone(feedback.score * 10);
            return (
              <div className={`assessment-feedback-item tone-${feedbackTone}`} key={question.id}>
                <button
                  type="button"
                  onClick={() => setExpandedQuestion(expanded ? null : question.id)}
                  aria-expanded={expanded}
                >
                  {feedback.score >= 8
                    ? <CheckCircle2 size={18} color="var(--green)" />
                    : <Info size={18} color={scoreColor(feedback.score * 10)} />}
                  <span><small>{t("Question")} {new Intl.NumberFormat(locale).format(index + 1)}</small>{question.prompt}</span>
                  <Badge tone={feedbackTone}>{new Intl.NumberFormat(locale).format(feedback.score)}/{new Intl.NumberFormat(locale).format(10)}</Badge>
                  {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {expanded && (
                  <div className="assessment-feedback-detail">
                    <Badge tone="gray">{t(evidenceLabel(feedback.evidence_basis))}</Badge>
                    <p>{feedback.feedback}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="wizard-actions">
        <LinkButton href="/dashboard" variant="secondary" icon={ArrowLeft}>
          {t("Back to Dashboard")}
        </LinkButton>
        <LinkButton
          href={assessmentResultHref("skills", historyAssessmentId)}
          icon={ArrowRight}
        >
          {t("Next: Skill-wise Scoring")}
        </LinkButton>
      </div>
    </div>
  );
}
