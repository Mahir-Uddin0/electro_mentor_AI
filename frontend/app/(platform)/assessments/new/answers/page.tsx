"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { practicalAssessmentCompetencyLabels } from "@/components/assessment/assessment-competencies";
import { useLanguage } from "@/components/language-provider";
import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, PageHeading, ProgressBar } from "@/components/ui";
import type { PracticalAssessmentAnswer } from "@/lib/api/client";

type SavingMode = "back" | "draft" | "evaluate" | null;

function answerText(answer?: PracticalAssessmentAnswer) {
  return answer?.answer ?? "";
}

function confidencePercent(value: number | null) {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function AssessmentAnswersPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const {
    assessment,
    questions,
    loading,
    error,
    refresh,
    updateLocalAnswer,
    saveAnswers,
    evaluateAssessment,
  } = usePracticalAssessment();
  const [savingMode, setSavingMode] = useState<SavingMode>(null);
  const [formError, setFormError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!loading && assessment?.status === "completed") {
      router.replace("/assessments/new/results");
    } else if (
      !loading &&
      assessment?.status === "draft" &&
      assessment.video_status !== "answers_generated"
    ) {
      router.replace("/assessments/new/questions");
    }
  }, [assessment, loading, router]);

  const answerByQuestion = useMemo(
    () => new Map(
      (assessment?.answers ?? []).map((answer) => [answer.question_id, answer]),
    ),
    [assessment?.answers],
  );
  const serializedAnswers = useMemo(
    () => questions.map((question) => {
      const normalized = answerText(answerByQuestion.get(question.id)).trim();
      return { question_id: question.id, answer: normalized || null };
    }),
    [answerByQuestion, questions],
  );
  const answeredCount = serializedAnswers.filter((item) => item.answer).length;
  const progress = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  if (
    loading ||
    assessment?.status === "completed" ||
    assessment?.video_status === "questions_generated"
  ) {
    return <AssessmentLoading label="Loading your answers…" />;
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
  const assessmentId = assessment.id;

  async function persistAnswers() {
    return saveAnswers(assessmentId, serializedAnswers);
  }

  async function saveDraft() {
    setSavingMode("draft");
    setFormError("");
    setSavedMessage("");
    try {
      await persistAnswers();
      setSavedMessage(t("Your answer draft has been saved."));
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : t("Your answers could not be saved."),
      );
    } finally {
      setSavingMode(null);
    }
  }

  async function saveAndGoBack() {
    setSavingMode("back");
    setFormError("");
    try {
      await persistAnswers();
      router.push("/assessments/new/questions");
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : t("Your answers could not be saved."),
      );
      setSavingMode(null);
    }
  }

  async function evaluate() {
    const firstMissing = serializedAnswers.find((item) => !item.answer);
    if (firstMissing) {
      setFormError(t("Complete all ten answers before generating your assessment results."));
      window.setTimeout(() => {
        document.getElementById(`assessment-answer-${firstMissing.question_id}`)?.focus();
      }, 0);
      return;
    }
    if (!window.confirm(
      t("Submit these final answers for assessment? Gemini will score the work and generate improvement suggestions from the video and your answers."),
    )) {
      return;
    }

    setSavingMode("evaluate");
    setFormError("");
    setSavedMessage("");
    try {
      await persistAnswers();
      const response = await evaluateAssessment(assessmentId);
      if (response.assessment?.status !== "completed") {
        throw new Error(t("The practical assessment was not completed. Please try again."));
      }
      router.push("/assessments/new/results");
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : t("Gemini could not complete your practical assessment."),
      );
      setSavingMode(null);
    }
  }

  const busy = savingMode !== null;

  return (
    <div>
      <AssessmentStepper
        currentStep={3}
        assessmentStatus={assessment.status}
        videoStatus={assessment.video_status}
      />
      <PageHeading
        title={t("Fill Assessment Answers")}
        description={t("Step 3 of 6 — Review Gemini's video-based answers, fill every empty answer, and edit anything that does not accurately describe the work.")}
      />

      <div className="assessment-answer-progress">
        <div>
          <strong>{t("Progress")}</strong>
          <strong>{t("{{answered}} of {{total}} questions answered", { answered: new Intl.NumberFormat(locale).format(answeredCount), total: new Intl.NumberFormat(locale).format(questions.length) })}</strong>
        </div>
        <ProgressBar value={progress} tone={progress === 100 ? "green" : "blue"} />
      </div>

      <div className="alert alert-green assessment-answer-notice">
        <Bot size={19} />
        <div>
          <strong>{t("AI-generated answers are editable")}</strong>
          <p>{t("Gemini filled only answers supported by the work video. Complete blank answers manually and review every generated answer before submission.")}</p>
        </div>
      </div>

      {(formError || savedMessage) && (
        <div className={`auth-message ${formError ? "error" : "success"} assessment-form-message`}>
          {formError || savedMessage}
        </div>
      )}

      <div className="answer-list">
        {questions.map((question, index) => {
          const storedAnswer = answerByQuestion.get(question.id);
          const value = answerText(storedAnswer);
          const hasAiSuggestion = Boolean(storedAnswer?.ai_answer);
          const edited = hasAiSuggestion && value !== storedAnswer?.ai_answer;
          const confidence = confidencePercent(storedAnswer?.ai_confidence ?? null);
          const confidenceTone = confidence >= 80 ? "var(--green)" : "var(--amber)";
          return (
            <Card
              key={question.id}
              className={`answer-card ${!value.trim() ? "needs-answer" : ""}`}
            >
              <div className="assessment-answer-layout">
                <span className="assessment-question-number">{new Intl.NumberFormat(locale).format(index + 1)}</span>
                <div>
                  <strong className="assessment-answer-prompt">{question.prompt}</strong>
                  <div className="chips assessment-question-meta">
                    <Badge>
                      {t(practicalAssessmentCompetencyLabels.get(question.competency) ?? question.competency)}
                    </Badge>
                    {hasAiSuggestion ? (
                      <Badge tone="purple">
                        <Sparkles size={11} /> {!value.trim() ? t("AI suggestion cleared") : edited ? t("AI suggestion edited") : t("AI suggested")}
                      </Badge>
                    ) : (
                      <Badge tone="gray">{t("Manual answer needed")}</Badge>
                    )}
                  </div>

                  {hasAiSuggestion && (
                    <div className="assessment-confidence">
                      <span>{t("AI confidence")}</span>
                      <span className="assessment-confidence-track">
                        <span style={{ width: `${confidence}%`, background: confidenceTone }} />
                      </span>
                      <strong style={{ color: confidenceTone }}>{new Intl.NumberFormat(locale).format(confidence)}%</strong>
                    </div>
                  )}

                  <div className="answer-area">
                    <textarea
                      id={`assessment-answer-${question.id}`}
                      maxLength={4000}
                      disabled={busy}
                      aria-label={`${t("Your answer")} ${new Intl.NumberFormat(locale).format(index + 1)}`}
                      value={value}
                      placeholder={
                        hasAiSuggestion && value.trim()
                          ? t("Review or edit the AI suggestion")
                          : hasAiSuggestion
                            ? t("Enter a replacement for the cleared AI suggestion")
                            : t("Describe the relevant work, decision, or procedure in your own words")
                      }
                      onChange={(event) => {
                        updateLocalAnswer(question.id, event.target.value);
                        setFormError("");
                        setSavedMessage("");
                      }}
                    />
                    <span className="assessment-answer-hint">
                      {value.trim()
                        ? t("{{count}} / 4,000 characters", { count: value.length.toLocaleString(locale) })
                        : t("This answer is required before evaluation.")}
                    </span>
                  </div>

                  {storedAnswer?.ai_evidence && (
                    <div className="assessment-evidence">
                      <strong>{t("Evidence found in your work video")}</strong>
                      <p>{storedAnswer.ai_evidence}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {savingMode === "evaluate" && (
        <Card className="assessment-evaluating">
          <span className="spinner" />
          <div>
            <strong>{t("Gemini is assessing your practical work…")}</strong>
            <p>{t("Skill scoring and improvement suggestions are being generated together. Keep this page open until both are saved.")}</p>
          </div>
        </Card>
      )}

      <div className="wizard-actions">
        <Button
          variant="secondary"
          icon={ArrowLeft}
          disabled={busy}
          onClick={() => void saveAndGoBack()}
        >
          {savingMode === "back" ? t("Saving…") : t("Back")}
        </Button>
        <div className="assessment-answer-actions">
          <Button
            variant="secondary"
            icon={Save}
            disabled={busy}
            onClick={() => void saveDraft()}
          >
            {savingMode === "draft" ? t("Saving…") : t("Save Draft")}
          </Button>
          <Button
            icon={answeredCount === questions.length ? CheckCircle2 : ArrowRight}
            disabled={busy || questions.length === 0}
            onClick={() => void evaluate()}
          >
            {savingMode === "evaluate" ? t("Generating Results…") : t("Save & View Results")}
          </Button>
        </div>
      </div>
    </div>
  );
}
