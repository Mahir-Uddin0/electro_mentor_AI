"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Info,
} from "lucide-react";
import { useEffect } from "react";

import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Card, LinkButton, PageHeading } from "@/components/ui";

export default function AssessmentQuestionsPage() {
  const router = useRouter();
  const {
    assessment,
    questions,
    checklistDefinitions,
    loading,
    error,
    refresh,
  } = usePracticalAssessment();

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

  const competencyLabels = new Map(
    checklistDefinitions.map((section) => [section.competency, section.label]),
  );
  const aiSuggestionCount = assessment.answers.filter(
    (answer) => Boolean(answer.ai_answer),
  ).length;

  return (
    <div>
      <AssessmentStepper currentStep={2} assessmentStatus={assessment.status} />
      <PageHeading
        title="Assessment Questions"
        description="Step 2 of 6 — Review the ten fixed questions used for every practical assessment."
      />

      <Card className="assessment-question-summary">
        <span className="icon-box icon-blue"><ClipboardList size={19} /></span>
        <div>
          <strong>{questions.length} fixed questions</strong>
          <p>
            The questions cannot be added, removed, or AI-generated. They consistently measure the same six competency areas.
          </p>
        </div>
        <Badge tone="purple">
          {questions.reduce((total, question) => total + question.points, 0)} total points
        </Badge>
      </Card>

      {assessment.video_status === "analyzed" ? (
        <div className="alert alert-green assessment-question-alert">
          <Bot size={19} />
          <div>
            <strong>Video review complete</strong>
            <p>
              Gemini found evidence for {aiSuggestionCount} of {questions.length} answers. Unverified answers remain empty for you to complete.
            </p>
          </div>
        </div>
      ) : assessment.video_status === "failed" ? (
        <div className="alert alert-amber assessment-question-alert">
          <Info size={19} />
          <div>
            <strong>Continue with manual answers</strong>
            <p>The optional video could not be analyzed, but you can still complete the assessment normally.</p>
          </div>
        </div>
      ) : (
        <div className="alert alert-amber assessment-question-alert">
          <Info size={19} />
          <div>
            <strong>Manual assessment</strong>
            <p>No video was supplied, so all ten answers will be completed by you.</p>
          </div>
        </div>
      )}

      <div className="question-list">
        {questions.map((question, index) => {
          const suggested = assessment.answers.some(
            (answer) => answer.question_id === question.id && Boolean(answer.ai_answer),
          );
          return (
            <Card key={question.id} className="question-card">
              <div className="question-head">
                <div className="assessment-question-copy">
                  <span className="assessment-question-number">{index + 1}</span>
                  <div>
                    <h3>{question.prompt}</h3>
                    <div className="chips assessment-question-meta">
                      <Badge>{competencyLabels.get(question.competency) ?? question.competency}</Badge>
                      <Badge tone="amber">{question.points} pts</Badge>
                      {suggested && (
                        <Badge tone="purple"><CheckCircle2 size={11} /> AI observation ready</Badge>
                      )}
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
          Back
        </LinkButton>
        <LinkButton href="/assessments/new/answers" icon={ArrowRight}>
          Next: Fill Answers
        </LinkButton>
      </div>
    </div>
  );
}
