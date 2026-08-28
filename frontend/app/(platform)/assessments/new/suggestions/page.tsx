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
  const { assessment, loading, error, refresh } = usePracticalAssessment();

  useEffect(() => {
    if (!loading && assessment?.status === "draft") {
      router.replace("/assessments/new/answers");
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
        message="Your completed assessment has no saved suggestions."
        retry={() => void refresh().catch(() => {})}
      />
    );
  }
  const competencyLabels = new Map(
    assessment.evaluation.skill_scores.map((skill) => [skill.competency, skill.label]),
  );

  return (
    <div>
      <AssessmentStepper currentStep={5} assessmentStatus={assessment.status} />
      <PageHeading
        title="Improvement Suggestions"
        description="Step 5 of 6 — Prioritized guidance generated from your saved assessment."
      />

      <Card className="assessment-suggestion-summary">
        <span className="icon-box icon-blue"><BarChart3 size={19} /></span>
        <div>
          <strong>Personalized for {assessment.project_name}</strong>
          <p>
            These actions are based on your final answers{assessment.video_status === "analyzed" ? " and observable video evidence" : ""}.
          </p>
        </div>
        <Badge>{assessment.topic}</Badge>
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
                  <Badge tone={tone}>{suggestion.priority.toUpperCase()} PRIORITY</Badge>
                  <Badge tone="gray">
                    {competencyLabels.get(suggestion.competency) ?? suggestion.competency.replaceAll("_", " ")}
                  </Badge>
                </div>
                <h3>{suggestion.title}</h3>
                <p>{suggestion.description}</p>
                <strong className="assessment-next-steps-title">ACTION STEPS</strong>
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
          <strong>Continue learning with the Guide Library</strong>
          <p>Use the relevant wiring and circuit guides while practising these actions.</p>
        </div>
        <LinkButton href="/guides" variant="secondary">Open Guides</LinkButton>
      </div>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/results" variant="secondary" icon={ArrowLeft}>
          Back
        </LinkButton>
        <LinkButton href="/assessments/new/checklist" icon={ArrowRight}>
          Next: Competency Checklist
        </LinkButton>
      </div>
    </div>
  );
}
