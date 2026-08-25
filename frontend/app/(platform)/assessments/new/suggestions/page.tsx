"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, CheckSquare2, Wrench } from "lucide-react";

import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading } from "@/components/ui";

const nextSteps = [
  "Review the related guide in the Guide Library",
  "Practise the specific weak areas identified",
  "Discuss difficult concepts with your instructor",
  "Record another assessment video after practice",
];

export default function AssessmentSuggestionsPage() {
  const router = useRouter();
  const [completed, setCompleted] = useState<boolean[]>(nextSteps.map(() => false));

  return (
    <div>
      <AssessmentStepper currentStep={5} />
      <PageHeading
        title="Improvement Suggestions"
        description="Step 5 of 6 — Personalized recommendations"
      />

      <div style={{ display: "grid", gap: 14 }}>
        <Card className="suggestion-card">
          <span className="icon-box icon-blue"><BarChart3 size={18} /></span>
          <div>
            <Badge tone="green">LOW PRIORITY</Badge>
            <h3 style={{ marginTop: 9 }}>Good Performance</h3>
            <p>
              You scored 100% on Three Phase. Strong understanding overall. Focus on the few areas that need attention.
            </p>
          </div>
        </Card>

        <Card className="suggestion-card">
          <span className="icon-box icon-amber"><Wrench size={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Badge tone="amber">MEDIUM PRIORITY</Badge>
            <h3 style={{ marginTop: 9 }}>Recommended Practice</h3>
            <p>
              Practise the Three Phase task at least 2 more times, focusing on the areas where mistakes were made. Record a new video after each practice session.
            </p>
            <strong style={{ display: "block", marginTop: 13, color: "var(--muted)", fontSize: 9, letterSpacing: ".06em" }}>
              NEXT STEPS:
            </strong>
            <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
              {nextSteps.map((step, index) => (
                <label
                  key={step}
                  style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 11, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={completed[index]}
                    onChange={() => setCompleted((items) => items.map((item, itemIndex) => itemIndex === index ? !item : item))}
                    style={{ accentColor: "var(--green)" }}
                  />
                  <span style={{ textDecoration: completed[index] ? "line-through" : "none" }}>{step}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card className="suggestion-card">
          <span className="icon-box icon-green"><BookOpen size={18} /></span>
          <div>
            <Badge tone="amber">MEDIUM PRIORITY</Badge>
            <h3 style={{ marginTop: 9 }}>Study Recommended Guide</h3>
            <p>Review “Three Phase Guide” in the Guide Library for detailed step-by-step instructions.</p>
            <Button
              variant="secondary"
              icon={CheckSquare2}
              onClick={() => router.push("/guides/lighting-circuit-design")}
              style={{ marginTop: 11 }}
            >
              Open Guide
            </Button>
          </div>
        </Card>
      </div>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/results" variant="secondary" icon={ArrowLeft}>Back</LinkButton>
        <LinkButton href="/assessments/new/checklist" icon={ArrowRight}>Next: Skill Checklist</LinkButton>
      </div>
    </div>
  );
}
