"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Download, RotateCcw, X } from "lucide-react";

import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";

const competencies = [
  { name: "Safety Procedures", status: "Mastered", score: 100, completed: 3, total: 3 },
  { name: "Tool Usage", status: "Not Started", score: 0, completed: 0, total: 3 },
  { name: "Technical Knowledge", status: "Not Started", score: 0, completed: 0, total: 3 },
  { name: "Work Quality", status: "Not Started", score: 0, completed: 0, total: 3 },
  { name: "Testing & Verification", status: "Not Started", score: 0, completed: 0, total: 3 },
  { name: "Documentation", status: "Not Started", score: 0, completed: 0, total: 3 },
];

export default function CompetencyChecklistPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  function exportChecklist() {
    const content = [
      "Three Phase - Competency Checklist",
      "",
      ...competencies.map((item) => `${item.name}: ${item.status} (${item.score}%) - ${item.completed}/${item.total}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "three-phase-competency-checklist.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <AssessmentStepper currentStep={6} />
      <PageHeading title="Competency Checklist" description="Step 6 of 6 — Track your skill mastery" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Badge tone="green">1 Mastered</Badge>
          <Badge tone="amber">0 Need Improvement</Badge>
          <Badge tone="red">5 Not Started</Badge>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 10 }}>Three Phase - Competency Checklist</span>
      </div>

      <div className="competency-list">
        {competencies.map((competency) => {
          const mastered = competency.status === "Mastered";
          const isExpanded = expanded === competency.name;
          return (
            <Card key={competency.name}>
              <div className="competency-row">
                <span
                  className="competency-status"
                  style={{ color: mastered ? "var(--green)" : "var(--red)", background: mastered ? "var(--green-soft)" : "var(--red-soft)" }}
                >
                  {mastered ? <Check size={16} /> : <X size={16} />}
                </span>
                <div className="competency-main">
                  <div className="competency-title">
                    <strong>{competency.name}</strong>
                    <Badge tone={mastered ? "green" : "red"}>{competency.status}</Badge>
                    <strong style={{ color: mastered ? "var(--green)" : "var(--red)", fontSize: 11 }}>{competency.score}%</strong>
                  </div>
                  <div style={{ maxWidth: 220 }}>
                    <ProgressBar value={competency.score} tone={mastered ? "green" : "red"} />
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setExpanded(isExpanded ? null : competency.name)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${competency.name}`}
                  style={{ width: "auto", paddingInline: 7, color: "var(--muted)", gap: 7 }}
                >
                  <span style={{ fontSize: 10 }}>{competency.completed}/{competency.total}</span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {isExpanded && (
                <div style={{ padding: "0 18px 18px 66px", color: "var(--muted)", fontSize: 11 }}>
                  {mastered
                    ? "All observed criteria were demonstrated successfully in this assessment."
                    : "Complete three practical observations to establish competency in this skill."}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="wizard-actions">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <LinkButton href="/assessments/new/suggestions" variant="secondary" icon={ArrowLeft}>Back</LinkButton>
          <Button variant="secondary" icon={Download} onClick={exportChecklist}>Export Checklist</Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button icon={RotateCcw} onClick={() => router.push("/assessments/new/upload")}>
            Save &amp; Start New Assessment
          </Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    </div>
  );
}
