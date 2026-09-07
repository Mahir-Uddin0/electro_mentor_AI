"use client";

import {
  ClipboardList,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Badge, Button, Card, PageHeading, ProgressBar } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";
import {
  frontendApi,
  type GeneratedChecklistPriority,
  type GeneratedSafetyChecklist,
} from "@/lib/api/client";

const priorityLabels: Record<GeneratedChecklistPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const priorityTones: Record<
  GeneratedChecklistPriority,
  "red" | "amber" | "blue" | "gray"
> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "gray",
};

export default function GenerateSafetyChecklistPage() {
  const { locale, t } = useLanguage();
  const [task, setTask] = useState("");
  const [generated, setGenerated] = useState<GeneratedSafetyChecklist | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const itemCount = useMemo(
    () => generated?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0,
    [generated],
  );
  const progress = itemCount ? Math.round((checked.size / itemCount) * 100) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTask = task.trim();
    if (!normalizedTask) {
      setError(t("Describe the electrical task before generating a checklist."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await frontendApi.generateChecklist(normalizedTask);
      if (result.outcome === "invalid_prompt") {
        setGenerated(null);
        setChecked(new Set());
        setError(result.message);
        return;
      }
      setGenerated(result);
      setChecked(new Set());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("The checklist could not be generated."));
    } finally {
      setLoading(false);
    }
  }

  function toggle(itemKey: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  }

  return (
    <>
      <PageHeading
        title={t("AI Safety Tracker Generator")}
        description={t("Describe your electrical work and receive a task-aware safety checklist.")}
      />

      <Card className="generator-card">
        <form onSubmit={submit}>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder={t("e.g., Install a distribution board with 4 circuits for a house")}
            aria-label={t("Describe the electrical task")}
            maxLength={2000}
            disabled={loading}
          />
          <div className="generator-actions">
            <Button type="submit" icon={Sparkles} disabled={loading || !task.trim()}>
              {loading ? t("Generating…") : t("Generate Checklist")}
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
              <h2>{t("No checklist generated yet")}</h2>
              <p>{t("Describe your electrical task above and click “Generate Checklist” to get an AI-powered safety checklist.")}</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="checklist-items">
              <div className="result-title">
                <div>
                  <Badge tone="purple">
                    {t("AI generated")} · {generated.generation_id.slice(0, 8).toUpperCase()}
                  </Badge>
                  <h2 style={{ margin: "10px 0 3px", fontSize: 17 }}>{generated.title}</h2>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 11 }}>
                    {generated.task_summary}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={() => {
                    setGenerated(null);
                    setChecked(new Set());
                    setError("");
                  }}
                >
                  {t("Start Over")}
                </Button>
              </div>
              <div className="checklist-guidance">{generated.message}</div>
              <div style={{ display: "grid", gap: 7, margin: "8px 0" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{new Intl.NumberFormat(locale).format(checked.size)} / {new Intl.NumberFormat(locale).format(itemCount)} {t("completed")}</span>
                <ProgressBar value={progress} tone={progress === 100 ? "green" : "blue"} />
              </div>
              {generated.sections.map((section, sectionIndex) => (
                <section className="generated-checklist-section" key={`${section.title}-${sectionIndex}`}>
                  <h3>{section.title}</h3>
                  {section.items.map((item, itemIndex) => {
                    const itemKey = `${sectionIndex}-${itemIndex}`;
                    return (
                      <label
                        key={itemKey}
                        className={`check-row ${checked.has(itemKey) ? "checked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(itemKey)}
                          onChange={() => toggle(itemKey)}
                        />
                        <span className="generated-checklist-copy">
                          <span className="generated-checklist-action">{item.action}</span>
                          <span className="generated-checklist-reason">{item.reason}</span>
                        </span>
                        <Badge tone={priorityTones[item.priority]}>
                          {t(priorityLabels[item.priority])}
                        </Badge>
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
