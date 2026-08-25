"use client";

import {
  CheckCircle2,
  ClipboardList,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Badge, Button, Card, LinkButton, PageHeading, ProgressBar } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

const generatedItems = [
  "Disconnect and lock out the main power supply before starting.",
  "Verify zero voltage at every conductor with an approved tester.",
  "Inspect tools, leads, insulation, and protective equipment for damage.",
  "Confirm cable sizes and protective devices match the intended load.",
  "Keep the work area dry, well lit, and clear of obstructions.",
  "Use insulated gloves, safety shoes, and eye protection.",
  "Check earth continuity before energizing the installation.",
  "Label circuits and record the final test results.",
];

type GeneratedChecklist = { id: string; title: string };

export default function GenerateSafetyChecklistPage() {
  const [task, setTask] = useState("");
  const [generated, setGenerated] = useState<GeneratedChecklist | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const progress = useMemo(() => Math.round((checked.size / generatedItems.length) * 100), [checked]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTask = task.trim();
    if (!normalizedTask) {
      setError("Describe the electrical task before generating a checklist.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await frontendApi.generateChecklist(normalizedTask);
      setGenerated(result);
      setChecked(new Set());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The checklist could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(index: number) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <>
      <PageHeading
        title="AI Safety Tracker Generator"
        description="Describe your electrical work and receive a task-aware safety checklist."
      />

      <Card className="generator-card">
        <form onSubmit={submit}>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="e.g., Install a distribution board with 4 circuits for a house"
            aria-label="Describe the electrical task"
          />
          <div className="generator-actions">
            <Button type="submit" icon={Sparkles} disabled={loading || !task.trim()}>
              {loading ? "Generating…" : "Generate Checklist"}
            </Button>
          </div>
          {error && <div className="auth-message error" style={{ marginTop: 10 }}>{error}</div>}
        </form>
      </Card>

      <div style={{ marginTop: 14 }}>
        {!generated ? (
          <Card>
            <div className="empty-state">
              <span className="empty-icon"><ClipboardList size={29} /></span>
              <h2>No checklist generated yet</h2>
              <p>Describe your electrical task above and click “Generate Checklist” to get an AI-powered safety checklist.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="checklist-items">
              <div className="result-title">
                <div>
                  <Badge tone="purple">AI generated · {generated.id}</Badge>
                  <h2 style={{ margin: "10px 0 3px", fontSize: 17 }}>{generated.title}</h2>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 11 }}>Review each item with your instructor before starting work.</p>
                </div>
                <Button variant="ghost" icon={RotateCcw} onClick={() => setGenerated(null)}>Start Over</Button>
              </div>
              <div style={{ display: "grid", gap: 7, margin: "8px 0" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{checked.size} / {generatedItems.length} completed</span>
                <ProgressBar value={progress} tone={progress === 100 ? "green" : "blue"} />
              </div>
              {generatedItems.map((item, index) => (
                <label key={item} className={`check-row ${checked.has(index) ? "checked" : ""}`}>
                  <input type="checkbox" checked={checked.has(index)} onChange={() => toggle(index)} />
                  <span>{item}</span>
                </label>
              ))}
              <div className="inline-actions" style={{ justifyContent: "flex-start", marginTop: 5 }}>
                <LinkButton href="/safety-checklists/house-wiring" variant="secondary" icon={CheckCircle2}>Open Full Checklist</LinkButton>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
