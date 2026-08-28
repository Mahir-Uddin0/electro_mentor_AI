"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
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
  const {
    assessment,
    questions,
    loading,
    error,
    refresh,
  } = usePracticalAssessment();
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && assessment?.status === "draft") {
      router.replace("/assessments/new/answers");
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
        message="Your saved assessment is missing its evaluation result."
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
      <AssessmentStepper currentStep={4} assessmentStatus={assessment.status} />
      <PageHeading
        title="Assessment Results"
        description="Step 4 of 6 — Review the competency profile saved for your account."
      />

      <div className="assessment-answer-progress">
        <div>
          <strong>Assessment complete</strong>
          <strong>{evaluation.question_feedback.length} of {questions.length} questions assessed</strong>
        </div>
        <ProgressBar value={100} tone="green" />
      </div>

      <Card className="score-card assessment-score-card">
        <div
          className="score-ring"
          style={{ borderColor: scoreColor(overallScore) }}
        >
          <span>
            <strong style={{ color: scoreColor(overallScore) }}>{overallScore}%</strong>
            <small>Overall score</small>
          </span>
        </div>
        <div className="assessment-score-summary">
          <div className="chips">
            <Badge tone={tone}>Grade: {assessment.grade}</Badge>
            <Badge tone={assessment.passed ? "green" : "red"}>
              {assessment.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {assessment.passed ? "PASSED" : "NEEDS IMPROVEMENT"}
            </Badge>
          </div>
          <h2>{assessment.project_name}</h2>
          <p>{evaluation.summary}</p>
          <span>{assessment.topic} · completed {assessment.completed_at ? new Date(assessment.completed_at).toLocaleDateString() : "recently"}</span>
        </div>
      </Card>

      <div className="alert alert-amber assessment-result-disclaimer">
        <Info size={19} />
        <div>
          <strong>Instructional assessment only</strong>
          <p>This AI-generated estimate is not a qualification, certification, electrical inspection, or proof that the completed work is electrically safe.</p>
        </div>
      </div>

      <Card className="question-card assessment-results-section">
        <h2>Question Feedback</h2>
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
                  <span><small>Question {index + 1}</small>{question.prompt}</span>
                  <Badge tone={feedbackTone}>{feedback.score}/10</Badge>
                  {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {expanded && (
                  <div className="assessment-feedback-detail">
                    <Badge tone="gray">{evidenceLabel(feedback.evidence_basis)}</Badge>
                    <p>{feedback.feedback}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="question-card assessment-results-section">
        <h2>Skill-wise Scoring</h2>
        <div className="assessment-skill-list">
          {evaluation.skill_scores.map((skill) => (
            <div className="assessment-skill-result" key={skill.competency}>
              <div>
                <strong>{skill.label}</strong>
                <span>{skill.rationale}</span>
              </div>
              <div className="skill-row">
                <span className="assessment-skill-confidence">
                  {skill.confidence}% confidence
                </span>
                <ProgressBar value={skill.score} tone={scoreTone(skill.score)} />
                <strong style={{ color: scoreColor(skill.score) }}>{skill.score}%</strong>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="wizard-actions">
        <LinkButton href="/dashboard" variant="secondary" icon={ArrowLeft}>
          Back to Dashboard
        </LinkButton>
        <LinkButton href="/assessments/new/suggestions" icon={ArrowRight}>
          Next: View Suggestions
        </LinkButton>
      </div>
    </div>
  );
}
