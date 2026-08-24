"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";

const skills = [
  { label: "Safety Procedures", score: 100 },
  { label: "Tool Usage", score: 0 },
  { label: "Technical Knowledge", score: 0 },
  { label: "Work Quality", score: 0 },
  { label: "Testing & Verification", score: 0 },
  { label: "Documentation", score: 0 },
];

export default function AssessmentResultsPage() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <AssessmentStepper currentStep={4} />
      <PageHeading title="Assessment Results" description="Step 4 of 6 — Review your performance" />

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 15, marginBottom: 7, fontSize: 11 }}>
          <strong>Progress</strong>
          <strong style={{ color: "var(--primary)" }}>3 of 3 questions assessed</strong>
        </div>
        <ProgressBar value={100} />
      </div>

      <Card className="score-card">
        <div className="score-ring">
          <span><strong style={{ color: "var(--green)" }}>100%</strong><small>Score</small></span>
        </div>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Badge tone="green">Grade: A</Badge>
            <Badge tone="green">✓ PASSED</Badge>
          </div>
          <p style={{ margin: "0 0 7px", fontSize: 14 }}>
            Earned <strong style={{ color: "var(--primary)" }}>15</strong> / 15 points
          </p>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>1 of 1 questions correct</span>
        </div>
      </Card>

      <Card className="question-card" >
        <h2 style={{ margin: "0 0 18px", fontSize: 14 }}>Question Results</h2>
        <div style={{ overflow: "hidden", border: "1px solid #bfeedd", borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            style={{
              width: "100%",
              minHeight: 52,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              border: 0,
              color: "var(--text)",
              background: "var(--surface)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <CheckCircle2 size={18} color="var(--green)" />
            <span style={{ flex: 1, fontSize: 12 }}>Did the student follow proper safety procedures before starting?</span>
            <strong style={{ color: "var(--green)", fontSize: 11 }}>15/15</strong>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {expanded && (
            <div style={{ padding: "13px 44px", borderTop: "1px solid #d8f4e9", background: "var(--green-soft)" }}>
              <strong style={{ display: "block", fontSize: 11 }}>Assessor feedback</strong>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 11 }}>
                The required safety checks and isolation procedure were identified correctly.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card className="question-card">
        <h2 style={{ margin: "0 0 15px", fontSize: 14 }}>Skill-wise Scoring</h2>
        <div>
          {skills.map((skill) => (
            <div className="skill-row" key={skill.label}>
              <strong style={{ fontSize: 11 }}>{skill.label}</strong>
              <ProgressBar value={skill.score} tone={skill.score ? "green" : "red"} />
              <span style={{ color: skill.score ? "var(--green)" : "var(--red)", fontWeight: 800 }}>
                {skill.score}%
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/answers" variant="secondary" icon={ArrowLeft}>Back</LinkButton>
        <LinkButton href="/assessments/new/suggestions" icon={ArrowRight}>Next: View Suggestions</LinkButton>
      </div>
    </div>
  );
}
