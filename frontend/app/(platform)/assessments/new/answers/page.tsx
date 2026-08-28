"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const {
    assessment,
    questions,
    checklistDefinitions,
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
    }
  }, [assessment, loading, router]);

  const answerByQuestion = useMemo(
    () => new Map(
      (assessment?.answers ?? []).map((answer) => [answer.question_id, answer]),
    ),
    [assessment?.answers],
  );
  const competencyLabels = useMemo(
    () => new Map(
      checklistDefinitions.map((section) => [section.competency, section.label]),
    ),
    [checklistDefinitions],
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

  if (loading || assessment?.status === "completed") {
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
      setSavedMessage("Your answer draft has been saved.");
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Your answers could not be saved.",
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
        caught instanceof Error ? caught.message : "Your answers could not be saved.",
      );
      setSavingMode(null);
    }
  }

  async function evaluate() {
    const firstMissing = serializedAnswers.find((item) => !item.answer);
    if (firstMissing) {
      setFormError("Complete all ten answers before requesting your assessment.");
      window.setTimeout(() => {
        document.getElementById(`assessment-answer-${firstMissing.question_id}`)?.focus();
      }, 0);
      return;
    }
    if (!window.confirm(
      "Submit this one-time assessment? After Gemini saves the result, your answers and competency profile cannot be edited or retaken.",
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
        throw new Error("The assessment result was not completed. Please try again.");
      }
      router.push("/assessments/new/results");
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Gemini could not complete the assessment.",
      );
      setSavingMode(null);
    }
  }

  const busy = savingMode !== null;

  return (
    <div>
      <AssessmentStepper currentStep={3} assessmentStatus={assessment.status} />
      <PageHeading
        title="Fill Assessment Answers"
        description="Step 3 of 6 — Review AI observations, complete empty answers, and edit anything that needs correction."
      />

      <div className="assessment-answer-progress">
        <div>
          <strong>Progress</strong>
          <strong>{answeredCount} of {questions.length} questions answered</strong>
        </div>
        <ProgressBar value={progress} tone={progress === 100 ? "green" : "blue"} />
      </div>

      {assessment.video_status === "analyzed" ? (
        <div className="alert alert-green assessment-answer-notice">
          <Bot size={19} />
          <div>
            <strong>AI suggestions are editable</strong>
            <p>Only observations supported by the video were filled. Review every suggestion before submitting.</p>
          </div>
        </div>
      ) : (
        <div className="alert alert-amber assessment-answer-notice">
          <UserRound size={19} />
          <div>
            <strong>Manual answers required</strong>
            <p>
              {assessment.video_status === "failed"
                ? "The optional video could not be analyzed. Complete every answer manually."
                : "No video was provided. Complete every answer manually."}
            </p>
          </div>
        </div>
      )}

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
                <span className="assessment-question-number">{index + 1}</span>
                <div>
                  <strong className="assessment-answer-prompt">{question.prompt}</strong>
                  <div className="chips assessment-question-meta">
                    <Badge>{competencyLabels.get(question.competency) ?? question.competency}</Badge>
                    <Badge tone="amber">{question.points} pts</Badge>
                    {hasAiSuggestion ? (
                      <Badge tone="purple">
                        <Sparkles size={11} /> {!value.trim() ? "AI suggestion cleared" : edited ? "AI suggestion edited" : "AI suggested"}
                      </Badge>
                    ) : (
                      <Badge tone="gray">Manual answer needed</Badge>
                    )}
                  </div>

                  {hasAiSuggestion && (
                    <div className="assessment-confidence">
                      <span>AI confidence</span>
                      <span className="assessment-confidence-track">
                        <span style={{ width: `${confidence}%`, background: confidenceTone }} />
                      </span>
                      <strong style={{ color: confidenceTone }}>{confidence}%</strong>
                    </div>
                  )}

                  <div className="answer-area">
                    <textarea
                      id={`assessment-answer-${question.id}`}
                      maxLength={4000}
                      disabled={busy}
                      aria-label={`Answer to question ${index + 1}`}
                      value={value}
                      placeholder={
                        hasAiSuggestion && value.trim()
                          ? "Review or edit the AI suggestion"
                          : hasAiSuggestion
                            ? "Enter a replacement for the cleared AI suggestion"
                            : "Enter your answer based on the work you performed"
                      }
                      onChange={(event) => {
                        updateLocalAnswer(question.id, event.target.value);
                        setFormError("");
                        setSavedMessage("");
                      }}
                    />
                    <span className="assessment-answer-hint">
                      {value.trim()
                        ? `${value.length.toLocaleString()} / 4,000 characters`
                        : "This answer is required before evaluation."}
                    </span>
                  </div>

                  {storedAnswer?.ai_evidence && (
                    <div className="assessment-evidence">
                      <strong>Observed evidence</strong>
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
            <strong>Gemini is assessing your practical competency…</strong>
            <p>This can take a little while. Keep this page open until the results are saved.</p>
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
          {savingMode === "back" ? "Saving…" : "Back"}
        </Button>
        <div className="assessment-answer-actions">
          <Button
            variant="secondary"
            icon={Save}
            disabled={busy}
            onClick={() => void saveDraft()}
          >
            {savingMode === "draft" ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            icon={answeredCount === questions.length ? CheckCircle2 : ArrowRight}
            disabled={busy || questions.length === 0}
            onClick={() => void evaluate()}
          >
            {savingMode === "evaluate" ? "Assessing…" : "Save & View Results"}
          </Button>
        </div>
      </div>
    </div>
  );
}
