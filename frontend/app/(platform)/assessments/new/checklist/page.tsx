"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  EyeOff,
  Minus,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  AssessmentLoadError,
  AssessmentLoading,
  AssessmentMissing,
} from "@/components/assessment/assessment-page-state";
import { usePracticalAssessment } from "@/components/assessment/assessment-provider";
import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";
import type {
  PracticalAssessmentChecklistStatus,
  PracticalAssessmentCriterionStatus,
} from "@/lib/api/client";

function sectionTone(status: PracticalAssessmentChecklistStatus) {
  if (status === "mastered") return "green" as const;
  if (status === "needs_improvement") return "amber" as const;
  return "gray" as const;
}

function sectionStatusLabel(status: PracticalAssessmentChecklistStatus) {
  if (status === "mastered") return "Mastered";
  if (status === "needs_improvement") return "Needs Improvement";
  return "Not Observed";
}

function criterionStatusLabel(status: PracticalAssessmentCriterionStatus) {
  if (status === "met") return "Met";
  if (status === "not_met") return "Not Met";
  return "Not Observed";
}

function criterionIcon(status: PracticalAssessmentCriterionStatus) {
  if (status === "met") return <Check size={15} />;
  if (status === "not_met") return <X size={15} />;
  return <Minus size={15} />;
}

export default function CompetencyChecklistPage() {
  const router = useRouter();
  const { assessment, loading, error, refresh } = usePracticalAssessment();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && assessment?.status === "draft") {
      router.replace("/assessments/new/answers");
    }
  }, [assessment, loading, router]);

  if (loading || assessment?.status === "draft") {
    return <AssessmentLoading label="Loading your competency checklist…" />;
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
        message="Your completed assessment has no saved competency checklist."
        retry={() => void refresh().catch(() => {})}
      />
    );
  }

  const sections = assessment.evaluation.checklist_sections;
  const masteredCount = sections.filter((item) => item.status === "mastered").length;
  const improvementCount = sections.filter((item) => item.status === "needs_improvement").length;
  const notObservedCount = sections.filter((item) => item.status === "not_observed").length;

  function exportChecklist() {
    const content = [
      `${assessment!.project_name} - Competency Checklist`,
      `Topic: ${assessment!.topic}`,
      `Overall score: ${assessment!.overall_score}% (Grade ${assessment!.grade})`,
      "",
      ...sections.flatMap((section) => [
        `${section.label}: ${sectionStatusLabel(section.status)} (${section.score}%)`,
        ...section.criteria.map(
          (criterion) => `  - ${criterion.label}: ${criterionStatusLabel(criterion.status)} — ${criterion.rationale}`,
        ),
        "",
      ]),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${assessment!.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "practical-assessment"}-competency-checklist.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <AssessmentStepper currentStep={6} assessmentStatus={assessment.status} />
      <PageHeading
        title="Competency Checklist"
        description="Step 6 of 6 — Your fixed competency criteria, scored from the completed assessment."
      />

      <div className="assessment-checklist-summary">
        <div className="chips">
          <Badge tone="green">{masteredCount} Mastered</Badge>
          <Badge tone="amber">{improvementCount} Need Improvement</Badge>
          <Badge tone="gray">{notObservedCount} Not Observed</Badge>
        </div>
        <span>{assessment.project_name} · {assessment.topic}</span>
      </div>

      {notObservedCount > 0 && (
        <div className="alert alert-amber assessment-answer-notice">
          <EyeOff size={19} />
          <div>
            <strong>Some criteria were not observed</strong>
            <p>A “Not Observed” result means the video and answers did not provide enough evidence; it is not proof that you cannot perform the skill.</p>
          </div>
        </div>
      )}

      <div className="alert alert-amber assessment-result-disclaimer">
        <ShieldAlert size={19} />
        <div>
          <strong>Not a safety certification</strong>
          <p>This AI checklist is an instructional competency estimate. It does not certify the user, inspect the installation, or confirm that electrical work is safe to energize.</p>
        </div>
      </div>

      <div className="competency-list">
        {sections.map((section) => {
          const isExpanded = expanded === section.competency;
          const mastered = section.status === "mastered";
          const observedCriteria = section.criteria.filter(
            (criterion) => criterion.status !== "not_observed",
          ).length;
          return (
            <Card key={section.competency} className="assessment-competency-card">
              <button
                type="button"
                className="competency-row assessment-competency-button"
                onClick={() => setExpanded(isExpanded ? null : section.competency)}
                aria-expanded={isExpanded}
              >
                <span
                  className={`competency-status competency-${section.status}`}
                  aria-hidden="true"
                >
                  {mastered ? <Check size={16} /> : section.status === "needs_improvement" ? <X size={16} /> : <Minus size={16} />}
                </span>
                <div className="competency-main">
                  <div className="competency-title">
                    <strong>{section.label}</strong>
                    <Badge tone={sectionTone(section.status)}>{sectionStatusLabel(section.status)}</Badge>
                    <strong style={{ color: mastered ? "var(--green)" : section.status === "needs_improvement" ? "var(--amber)" : "var(--muted)" }}>
                      {section.score}%
                    </strong>
                  </div>
                  <ProgressBar
                    value={section.score}
                    tone={mastered ? "green" : section.status === "needs_improvement" ? "amber" : "red"}
                  />
                </div>
                <span className="assessment-competency-count">
                  {observedCriteria}/{section.criteria.length}
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {isExpanded && (
                <div className="assessment-criteria-list">
                  {section.criteria.map((criterion) => (
                    <div className={`assessment-criterion criterion-${criterion.status}`} key={criterion.criterion_id}>
                      <span>{criterionIcon(criterion.status)}</span>
                      <div>
                        <strong>{criterion.label}</strong>
                        <p>{criterion.rationale}</p>
                      </div>
                      <Badge tone={criterion.status === "met" ? "green" : criterion.status === "not_met" ? "red" : "gray"}>
                        {criterionStatusLabel(criterion.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="wizard-actions">
        <div>
          <LinkButton href="/assessments/new/suggestions" variant="secondary" icon={ArrowLeft}>
            Back
          </LinkButton>
          <Button variant="secondary" icon={Download} onClick={exportChecklist}>
            Export Checklist
          </Button>
        </div>
        <LinkButton href="/dashboard">Finish &amp; Back to Dashboard</LinkButton>
      </div>
    </div>
  );
}
