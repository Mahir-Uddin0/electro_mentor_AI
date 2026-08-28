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

import { Badge, Card, SectionTitle } from "@/components/ui";
import { type Task, frontendApi } from "@/lib/api/client";

export default function DashboardPage() {
  const [greeting, setGreeting] = useState("Welcome back");
  const [assessmentAction, setAssessmentAction] = useState({
    href: "/assessments/new/upload",
    title: "Start your practical assessment",
    description: "Upload an optional video or continue with manual answers",
    label: "Start Assessment",
  });
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    void frontendApi.dashboard().then((data) => setGreeting(data.greeting)).catch(() => {});
    void frontendApi.getMyPracticalAssessment().then(({ assessment }) => {
      if (assessment?.status === "completed") {
        setAssessmentAction({
          href: "/assessments/new/results",
          title: "Your competency profile is ready",
          description: `Review your ${assessment.overall_score ?? 0}% practical assessment and improvement plan`,
          label: "View Results",
        });
      } else if (assessment) {
        setAssessmentAction({
          href: "/assessments/new/answers",
          title: "Continue your practical assessment",
          description: "Review any video suggestions and finish your ten fixed answers",
          label: "Resume Assessment",
        });
      }
    }).catch(() => {});
    void frontendApi
      .listTasks()
      .then(({ tasks }) =>
        setUpcomingTasks(tasks.filter((t) => t.status !== "completed")),
      )
      .catch(() => {})
      .finally(() => setLoadingTasks(false));
  }, []);

  const taskStatusLabel = (status: Task["status"]) =>
    status === "in_progress" ? "In Progress" : "Upcoming";

  const taskStatusTone = (status: Task["status"]): "blue" | "amber" =>
    status === "in_progress" ? "blue" : "amber";

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Your workshop</p><h1>{greeting}</h1><p>Continue your electrical training journey.</p></div>
        <Badge tone="green">Learning streak · 8 days</Badge>
      </div>

      <SectionTitle title="Quick Actions" />
      <Card style={{ padding: 12 }}>
        <div className="upload-zone dashboard-assessment-cta">
          <span className="upload-icon"><FileVideo size={25} /></span>
          <h2>{assessmentAction.title}</h2>
          <p>{assessmentAction.description}</p>
          <div className="inline-actions">
            <Link href={assessmentAction.href} className="button button-primary">
              <CirclePlay size={16} /> {assessmentAction.label}
            </Link>
          </div>
          <small style={{ marginTop: 12, color: "var(--muted)" }}>
            One-time, user-specific practical competency profile
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
            <strong>{action.title}</strong><span>{action.text}</span>
          </Link>
        ))}
      </div>

      <SectionTitle title="Upcoming Tasks" href="/practice-tracker" />
      <div className="task-list">
        {loadingTasks ? (
          <Card className="task-row">
            <p style={{ color: "var(--muted)" }}>Loading tasks…</p>
          </Card>
        ) : upcomingTasks.length === 0 ? (
          <Card className="task-row">
            <p style={{ color: "var(--muted)" }}>
              No upcoming tasks. Head to{" "}
              <Link href="/practice-tracker" style={{ color: "var(--accent)" }}>
                Practice Tracker
              </Link>{" "}
              to add some.
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
                  {task.priority}
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
