"use client";

import Link from "next/link";
import {
  Bot,
  Camera,
  CheckSquare,
  CirclePlay,
  FileVideo,
  History,
  ImagePlus,
  Library,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge, Card, ProgressBar, SectionTitle } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

const recentHistory = [
  { title: "Fillet Weld", type: "Possible Undercut", tone: "red" as const, confidence: "88%" },
  { title: "Fillet Weld", type: "Possible Undercut", tone: "red" as const, confidence: "86%" },
  { title: "Butt Joint", type: "Good", tone: "green" as const, confidence: "97%" },
  { title: "Motor Circuit", type: "Missing Ground", tone: "amber" as const, confidence: "91%" },
];

const upcomingTasks = [
  { title: "Two-Way Switch Installation", status: "In progress", progress: 86 },
  { title: "Distribution Board Setup", status: "Pending", progress: 8 },
  { title: "Motor Starter Panel Wiring", status: "In progress", progress: 42 },
];

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [videoName, setVideoName] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    void frontendApi.dashboard().then((data) => setGreeting(data.greeting)).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Your workshop</p><h1>{greeting}</h1><p>Continue your electrical training journey.</p></div>
        <Badge tone="green">Learning streak · 8 days</Badge>
      </div>

      <SectionTitle title="Quick Actions" />
      <Card style={{ padding: 12 }}>
        <div className="upload-zone" onClick={() => inputRef.current?.click()} role="button" tabIndex={0}>
          <span className="upload-icon"><FileVideo size={25} /></span>
          <h2>{videoName || "Upload your practical work video (max 2 min)"}</h2>
          <p>{videoName ? "Ready to create an AI practical assessment" : "Drag and drop or click to browse"}</p>
          <div className="inline-actions">
            <Link href="/assessments/new/upload" className="button button-secondary"><CirclePlay size={16} /> Record Video</Link>
            <button className="button button-primary" type="button"><Upload size={16} /> Choose File</button>
          </div>
          <small style={{ marginTop: 12, color: "var(--muted)" }}>MP4, WebM, MOV · Max 100MB</small>
          <input ref={inputRef} hidden type="file" accept="video/*" capture="environment" onChange={(event) => setVideoName(event.target.files?.[0]?.name ?? "")} />
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

      <SectionTitle title="Recent History" href="/photo-analysis" />
      <div className="history-grid">
        {recentHistory.map((item, index) => (
          <Card className="history-card" key={`${item.title}-${index}`}>
            <div className="history-thumb">{index % 2 ? <Camera size={20} /> : <History size={20} />}</div>
            <h3>{item.title}</h3><p>Analyzed {index + 1} day{index ? "s" : ""} ago</p>
            <div className="history-meta"><Badge tone={item.tone}>{item.type}</Badge><strong>{item.confidence}</strong></div>
          </Card>
        ))}
      </div>

      <SectionTitle title="Upcoming Tasks" href="/practice-tracker" />
      <div className="task-list">
        {upcomingTasks.map((task) => (
          <Card className="task-row" key={task.title}>
            <div className="task-row-head"><div><Badge tone={task.progress > 20 ? "blue" : "amber"}>{task.status}</Badge><h3 style={{ marginTop: 8 }}>{task.title}</h3></div><strong>{task.progress}%</strong></div>
            <ProgressBar value={task.progress} /><p>Complete the practical exercise and request instructor feedback.</p>
          </Card>
        ))}
      </div>
    </>
  );
}
