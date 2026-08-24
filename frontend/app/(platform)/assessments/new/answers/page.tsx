"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Pencil, RotateCcw, Sparkles } from "lucide-react";

import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";

const questions = [
  {
    prompt: "Did the student follow proper safety procedures before starting?",
    points: 15,
    confidence: 63,
    suggestion: "No",
  },
  {
    prompt: "Were the correct tools used for the task?",
    points: 15,
    confidence: 88,
    suggestion: "Yes",
  },
  {
    prompt: "Was the work area clean and organized?",
    points: 10,
    confidence: 85,
    suggestion: "Yes",
  },
];

export default function AssessmentAnswersPage() {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [answers, setAnswers] = useState(
    questions.map((question) => ({ text: question.suggestion, accepted: false })),
  );
  const answeredCount = answers.filter((answer) => answer.accepted && answer.text.trim()).length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  function updateAnswer(index: number, text: string) {
    setAnswers((current) => current.map((answer, answerIndex) => (
      answerIndex === index ? { text, accepted: Boolean(text.trim()) } : answer
    )));
  }

  function regenerateAnswers() {
    setMode("ai");
    setAnswers(questions.map((question) => ({ text: question.suggestion, accepted: false })));
  }

  function switchToManual() {
    setMode("manual");
    setAnswers((current) => current.map((answer) => (
      answer.accepted ? answer : { text: "", accepted: false }
    )));
  }

  return (
    <div>
      <AssessmentStepper currentStep={3} />
      <PageHeading
        title="Fill Assessment Answers"
        description="Step 3 of 6 — Provide answers for each question"
      />

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 15, marginBottom: 7, fontSize: 11 }}>
          <strong>Progress</strong>
          <strong style={{ color: "var(--primary)" }}>
            {answeredCount} of {questions.length} questions answered
          </strong>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Button
          variant={mode === "ai" ? "primary" : "secondary"}
          icon={Bot}
          onClick={() => setMode("ai")}
        >
          AI Auto-Fill
        </Button>
        <Button
          variant={mode === "manual" ? "primary" : "secondary"}
          icon={Pencil}
          onClick={switchToManual}
        >
          Manual Fill
        </Button>
      </div>

      {mode === "ai" && (
        <Button variant="secondary" icon={RotateCcw} onClick={regenerateAnswers}>
          Regenerate All AI Answers
        </Button>
      )}

      <div className="answer-list" style={{ marginTop: 17 }}>
        {questions.map((question, index) => {
          const confidenceTone = question.confidence >= 80 ? "var(--green)" : "var(--amber)";
          return (
            <Card key={question.prompt} className="answer-card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                    color: "var(--primary)",
                    borderRadius: "50%",
                    background: "var(--primary-soft)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 12 }}>{question.prompt}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
                    <Badge>Observation</Badge>
                    <Badge tone="amber">{question.points} pts</Badge>
                  </div>

                  {mode === "ai" && (
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
                      <Badge tone="purple"><Sparkles size={11} /> AI Suggested</Badge>
                      <span style={{ color: "var(--muted)", fontSize: 9 }}>AI Confidence:</span>
                      <span style={{ width: 92, height: 5, overflow: "hidden", borderRadius: 99, background: "var(--line)" }}>
                        <span style={{ display: "block", width: `${question.confidence}%`, height: "100%", background: confidenceTone }} />
                      </span>
                      <strong style={{ color: confidenceTone, fontSize: 9 }}>{question.confidence}%</strong>
                    </div>
                  )}

                  <div className="answer-area">
                    <textarea
                      aria-label={`Answer to question ${index + 1}`}
                      value={answers[index].text}
                      placeholder="Enter your answer"
                      onChange={(event) => updateAnswer(index, event.target.value)}
                    />
                    <span style={{ display: "block", marginTop: -5, color: "var(--muted)", fontSize: 9 }}>
                      {mode === "ai" && !answers[index].accepted
                        ? "Edit the AI suggestion to confirm this answer"
                        : "Your answer is ready"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/questions" variant="secondary" icon={ArrowLeft}>Back</LinkButton>
        <LinkButton href="/assessments/new/results" icon={ArrowRight}>Next: View Results</LinkButton>
      </div>
    </div>
  );
}
