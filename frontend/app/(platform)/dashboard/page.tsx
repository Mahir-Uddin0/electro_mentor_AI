"use client";

import Link from "next/link";
import {
  Bot,
  CirclePlay,
  FileVideo,
  ImagePlus,
  Library,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AssessmentHistoryCard } from "@/components/assessment/assessment-history-card";
import { useLanguage } from "@/components/language-provider";
import { Badge, Card, SectionTitle } from "@/components/ui";
import {
  type PracticalAssessmentHistoryItem,
  type Task,
  frontendApi,
} from "@/lib/api/client";

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const [greeting, setGreeting] = useState("Welcome back");
  const [assessmentAction, setAssessmentAction] = useState({
    href: "/assessments/new/upload",
    title: "Start a video practical assessment",
    description: "Upload a work video for ten AI-generated questions, skill scoring, and feedback",
    label: "Start Assessment",
  });
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [assessmentHistory, setAssessmentHistory] = useState<PracticalAssessmentHistoryItem[]>([]);
  const [assessmentHistoryTotal, setAssessmentHistoryTotal] = useState(0);
  const [loadingAssessmentHistory, setLoadingAssessmentHistory] = useState(true);
  const [assessmentHistoryError, setAssessmentHistoryError] = useState("");

  useEffect(() => {
    void frontendApi.dashboard().then((data) => setGreeting(data.greeting)).catch(() => {});
    void frontendApi.getMyPracticalAssessment().then(({ assessment }) => {
      if (assessment?.status === "draft") {
        setAssessmentAction({
          href: assessment.video_status === "answers_generated"
            ? "/assessments/new/answers"
            : "/assessments/new/questions",
          title: "Continue your practical assessment",
          description: assessment.video_status === "answers_generated"
            ? "Review Gemini's video-based answers and complete the remaining responses"
            : "Review the ten work-specific questions Gemini generated from your video",
          label: "Resume Assessment",
        });
      }
    }).catch(() => {});
    void frontendApi
      .listPracticalAssessmentHistory({ limit: 3 })
      .then(({ assessments, total }) => {
        setAssessmentHistory(assessments);
        setAssessmentHistoryTotal(total);
      })
      .catch((caught) => {
        setAssessmentHistoryError(
          caught instanceof Error
            ? caught.message
            : "Assessment history could not be loaded.",
        );
      })
      .finally(() => setLoadingAssessmentHistory(false));
    void frontendApi
      .listTasks()
      .then(({ tasks }) =>
        setUpcomingTasks(tasks.filter((t) => t.status !== "completed")),
      )
      .catch(() => {})
      .finally(() => setLoadingTasks(false));
  }, []);

  const taskStatusLabel = (status: Task["status"]) =>
    status === "in_progress" ? t("In Progress") : t("Upcoming");

  const taskStatusTone = (status: Task["status"]): "blue" | "amber" =>
    status === "in_progress" ? "blue" : "amber";

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">{t("Your workshop")}</p><h1>{language === "bn" ? "আবার স্বাগতম!" : greeting}</h1><p>{t("Continue your electrical training journey.")}</p></div>
        <Badge tone="green">{t("Learning streak · 8 days")}</Badge>
      </div>

      <SectionTitle title={t("Quick Actions")} />
      <Card style={{ padding: 12 }}>
        <div className="upload-zone dashboard-assessment-cta">
          <span className="upload-icon"><FileVideo size={25} /></span>
          <h2>{t(assessmentAction.title)}</h2>
          <p>{t(assessmentAction.description)}</p>
          <div className="inline-actions">
            <Link href={assessmentAction.href} className="button button-primary">
              <CirclePlay size={16} /> {t(assessmentAction.label)}
            </Link>
          </div>
          <small style={{ marginTop: 12, color: "var(--muted)" }}>
            {t("AI-generated questions · editable answers · six skill areas")}
          </small>
        </div>
      </Card>

      <div className="quick-action-grid" style={{ marginTop: 12 }}>
        {[
          { href: "/photo-analysis", icon: ImagePlus, title: "Upload Photo", text: "Submit wiring photos for review", tone: "blue" },
          { href: "/safety-checklists/generate", icon: ShieldCheck, title: "Safety Checklist", text: "Generate your safety workflow", tone: "purple" },
          { href: "/assistant", icon: Bot, title: "Ask AI", text: "Get instant help from a mentor", tone: "green" },
          { href: "/guides", icon: Library, title: "Open Guides", text: "Browse wiring guides & tutorials", tone: "amber" },
        ].map((action) => (
          <Link className="card quick-action" href={action.href} key={action.href}>
            <span className={`icon-box icon-${action.tone}`}><action.icon size={19} /></span>
            <strong>{t(action.title)}</strong><span>{t(action.text)}</span>
          </Link>
        ))}
      </div>

      <SectionTitle
        title={t("Assessment History")}
        href={assessmentHistoryTotal > 3 ? "/assessments/history" : undefined}
        linkLabel={t("View More")}
      />
      {loadingAssessmentHistory ? (
        <Card className="assessment-history-loading">
          <span className="spinner" /> {t("Loading assessment history…")}
        </Card>
      ) : assessmentHistoryError ? (
        <Card className="assessment-history-loading">
          <p>{assessmentHistoryError}</p>
        </Card>
      ) : assessmentHistory.length === 0 ? (
        <Card className="assessment-history-empty">
          <FileVideo size={20} />
          <div>
            <strong>{t("No completed assessments yet")}</strong>
            <p>{t("Your completed practical-work assessments will appear here.")}</p>
          </div>
          <Link href="/assessments/new/upload" className="button button-secondary">
            {t("Start Assessment")}
          </Link>
        </Card>
      ) : (
        <div className="assessment-history-grid assessment-history-dashboard">
          {assessmentHistory.map((assessment) => (
            <AssessmentHistoryCard assessment={assessment} key={assessment.id} />
          ))}
        </div>
      )}

      <SectionTitle title={t("Upcoming Tasks")} href="/practice-tracker" linkLabel={t("View all")} />
      <div className="task-list">
        {loadingTasks ? (
          <Card className="task-row">
            <p style={{ color: "var(--muted)" }}>{t("Loading tasks…")}</p>
          </Card>
        ) : upcomingTasks.length === 0 ? (
          <Card className="task-row">
            <p style={{ color: "var(--muted)" }}>
              {t("No upcoming tasks. Head to")}{" "}
              <Link href="/practice-tracker" style={{ color: "var(--accent)" }}>
                {t("Practice Tracker")}
              </Link>{" "}
              {t("to add some.")}
            </p>
          </Card>
        ) : (
          upcomingTasks.map((task) => (
            <Card className="task-row" key={task.id}>
              <div className="task-row-head">
                <div>
                  <Badge tone={taskStatusTone(task.status)}>
                    {taskStatusLabel(task.status)}
                  </Badge>
                  <h3 style={{ marginTop: 8 }}>{task.title}</h3>
                </div>
                <Badge tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "green"}>
                  {t(task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low")}
                </Badge>
              </div>
              {task.description && <p>{task.description}</p>}
            </Card>
          ))
        )}
      </div>
    </>
  );
}
