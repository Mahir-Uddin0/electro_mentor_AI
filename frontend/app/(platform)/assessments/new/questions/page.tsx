"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ClipboardList,
} from "lucide-react";
import { useEffect, useState } from "react";

import { practicalAssessmentCompetencyLabels } from "@/components/assessment/assessment-competencies";
import { useLanguage } from "@/components/language-provider";
import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading } from "@/components/ui";

export default function AssessmentQuestionsPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const {
    assessment,
    questions,
    loading,
    error,
    refresh,
    generateAnswers,
  } = usePracticalAssessment();
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  useEffect(() => {
    if (!loading && assessment?.status === "completed") {
      router.replace("/assessments/new/results");
    }
  }, [assessment, loading, router]);

  if (loading || assessment?.status === "completed") {
    return <AssessmentLoading label="Preparing your questions…" />;
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

  const hasTenQuestions = questions.length === 10;
  const assessmentId = assessment.id;
  const answersAlreadyGenerated = assessment.video_status === "answers_generated";

  async function continueToAnswers() {
    if (!hasTenQuestions) {
      setGenerationError(
        t("This assessment does not contain the required ten questions. Replace the video and try again."),
      );
      return;
    }
    if (answersAlreadyGenerated) {
      router.push("/assessments/new/answers");
      return;
    }
    setGenerating(true);
    setGenerationError("");
    try {
      await generateAnswers(assessmentId);
      router.push("/assessments/new/answers");
    } catch (caught) {
      setGenerationError(
        caught instanceof Error
          ? caught.message
          : t("Gemini could not generate answers from your work video."),
      );
      setGenerating(false);
    }
  }

  return (
    <div>
      <AssessmentStepper
        currentStep={2}
        assessmentStatus={assessment.status}
        videoStatus={assessment.video_status}
      />
      <PageHeading
        title={t("Assessment Questions")}
        description={t("Step 2 of 6 — Review ten questions Gemini generated specifically from your practical-work video.")}
      />

      <Card className="assessment-question-summary">
        <span className="icon-box icon-blue"><ClipboardList size={19} /></span>
        <div>
          <strong>{t("{{count}} AI-generated questions", { count: new Intl.NumberFormat(locale).format(questions.length) })}</strong>
          <p>
            {t("The questions cover observable decisions, safety, tool use, technique, testing, and documentation relevant to the work shown.")}
          </p>
        </div>
        <Badge tone="purple">{t("Work assessment")}</Badge>
      </Card>

      <div className="alert alert-green assessment-question-alert">
        <Bot size={19} />
        <div>
          <strong>{t("Question generation complete")}</strong>
          <p>
            {t("Continue when you are ready. Gemini will review the video again and fill only answers that the video supports.")}
          </p>
        </div>
      </div>

      {generationError && (
        <div className="auth-message error assessment-form-message">
          {generationError}
        </div>
      )}

      <div className="question-list">
        {questions.map((question, index) => {
          return (
            <Card key={question.id} className="question-card">
              <div className="question-head">
                <div className="assessment-question-copy">
                  <span className="assessment-question-number">{new Intl.NumberFormat(locale).format(index + 1)}</span>
                  <div>
                    <h3>{question.prompt}</h3>
                    <div className="chips assessment-question-meta">
                      <Badge>
                        {t(practicalAssessmentCompetencyLabels.get(question.competency) ?? question.competency)}
                      </Badge>
                      <Badge tone="purple">{t("{{count}} points", { count: new Intl.NumberFormat(locale).format(question.points) })}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/upload" variant="secondary" icon={ArrowLeft}>
          {t("Back")}
        </LinkButton>
        <Button
          icon={ArrowRight}
          disabled={generating || !hasTenQuestions}
          onClick={() => void continueToAnswers()}
        >
          {generating ? t("Generating Video Answers…") : t("Next: Generate Answers")}
        </Button>
      </div>
    </div>
  );
}
