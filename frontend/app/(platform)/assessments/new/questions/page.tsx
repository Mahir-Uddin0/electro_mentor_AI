"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Sparkles, X } from "lucide-react";

import { AssessmentStepper } from "@/components/assessment/assessment-stepper";
import { Badge, Button, Card, LinkButton, PageHeading } from "@/components/ui";

type AssessmentQuestion = {
  id: number;
  prompt: string;
  points: number;
};

const generatedQuestions: AssessmentQuestion[] = [
  { id: 1, prompt: "Did the student follow proper safety procedures before starting?", points: 15 },
  { id: 2, prompt: "Were the correct tools used for the task?", points: 15 },
  { id: 3, prompt: "Was the work area clean and organized?", points: 10 },
];

export default function AssessmentQuestionsPage() {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(generatedQuestions);
  const [showCustomField, setShowCustomField] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [generating, setGenerating] = useState(false);

  function generateQuestions() {
    setGenerating(true);
    window.setTimeout(() => {
      setQuestions(generatedQuestions);
      setGenerating(false);
    }, 650);
  }

  function addCustomQuestion() {
    const prompt = customQuestion.trim();
    if (!prompt) {
      setShowCustomField(true);
      return;
    }

    setQuestions((current) => [
      ...current,
      { id: Math.max(0, ...current.map((question) => question.id)) + 1, prompt, points: 10 },
    ]);
    setCustomQuestion("");
    setShowCustomField(false);
  }

  return (
    <div>
      <AssessmentStepper currentStep={2} />
      <PageHeading
        title="Assessment Questions"
        description="Step 2 of 6 — Add or generate questions for assessment"
      />

      <Card
        className="question-card"
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <span className="icon-box icon-blue"><Sparkles size={18} /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ display: "block", fontSize: 13 }}>Generate Questions with AI</strong>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              AI will generate relevant assessment questions based on the selected topic
            </span>
          </div>
          <Button icon={Sparkles} onClick={generateQuestions} disabled={generating}>
            {generating ? "Generating…" : "Generate Questions"}
          </Button>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "23px 0 14px" }}>
        <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
        <span style={{ color: "var(--muted)", fontSize: 10 }}>or add custom questions</span>
        <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
      </div>

      {showCustomField ? (
        <Card className="question-card" >
          <label className="field">
            <span style={{ fontSize: 11, fontWeight: 700 }}>Custom question</span>
            <input
              autoFocus
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addCustomQuestion();
                if (event.key === "Escape") setShowCustomField(false);
              }}
              placeholder="What should the assessor verify?"
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <Button variant="ghost" onClick={() => setShowCustomField(false)}>Cancel</Button>
            <Button icon={Plus} onClick={addCustomQuestion}>Add Question</Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" icon={Plus} onClick={() => setShowCustomField(true)}>
            Add Custom Question
          </Button>
        </div>
      )}

      <p style={{ margin: "24px 0 10px", color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>
        {questions.length} {questions.length === 1 ? "question" : "questions"} added
      </p>

      <div className="question-list">
        {questions.map((question, index) => (
          <Card key={question.id} className="question-card">
            <div className="question-head">
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
                <div>
                  <h3>{question.prompt}</h3>
                  <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                    <Badge>Observation</Badge>
                    <Badge tone="amber">{question.points} pts</Badge>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove question ${index + 1}`}
                onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}
              >
                <X size={15} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <div className="wizard-actions">
        <LinkButton href="/assessments/new/upload" variant="secondary" icon={ArrowLeft}>Back</LinkButton>
        <LinkButton href="/assessments/new/answers" icon={ArrowRight}>Next: Fill Answers</LinkButton>
      </div>
    </div>
  );
}
