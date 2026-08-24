"use client";

import { CheckCircle2, CircleDashed, Clock3, Plus, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, Card, MetricCard, PageHeading, ProgressBar } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

const initialTasks = [
  { title: "Install a Single Light Switch Circuit", category: "Lighting Circuit", status: "Completed", progress: 100, note: "Successfully installed a single-pole switch controlling one light fixture.", date: "Started 18 Jul 2026", rating: 5 },
  { title: "Wire a Distribution Board with 4 Circuits", category: "Distribution Board", status: "In Progress", progress: 60, note: "Completed MCB mounting and bus bar connection. Working on outgoing circuit wiring.", date: "Started 04 Aug 2026", rating: 0 },
  { title: "Install Two-Way Switch for Staircase", category: "Lighting Circuit", status: "Pending", progress: 8, note: "Review the wiring diagram and collect the required materials.", date: "Not started", rating: 0 },
  { title: "Test and Commission a Motor Circuit", category: "Motor Installation", status: "Pending", progress: 0, note: "Complete insulation, continuity, and operational tests.", date: "Not started", rating: 0 },
];

export default function PracticeTrackerPage() {
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [apiTotal, setApiTotal] = useState(4);
  useEffect(() => { void frontendApi.tasks().then((data) => setApiTotal(data.total)).catch(() => {}); }, []);
  const filtered = useMemo(() => tasks.filter((task) => (status === "All" || task.status === status) && task.title.toLowerCase().includes(query.toLowerCase())), [tasks, status, query]);
  const createTask = () => setTasks((items) => [...items, { title: "New Electrical Practice Task", category: "General Workshop", status: "Pending", progress: 0, note: "Add your task notes and practical evidence.", date: "Created today", rating: 0 }]);

  return (
    <>
      <PageHeading title="Practice Task Tracker" description="Plan your workshop practice and monitor progress across the curriculum." action={<Button icon={Plus} onClick={createTask}>Create Task</Button>} />
      <div className="metric-grid">
        <MetricCard label="All Tasks" value={apiTotal} icon={CircleDashed} />
        <MetricCard label="Completed" value={tasks.filter((t) => t.status === "Completed").length} icon={CheckCircle2} tone="green" />
        <MetricCard label="In Progress" value={tasks.filter((t) => t.status === "In Progress").length} icon={Clock3} tone="blue" />
        <MetricCard label="Pending" value={tasks.filter((t) => t.status === "Pending").length} icon={CircleDashed} tone="amber" />
      </div>
      <div className="filters" style={{ marginTop: 17 }}>
        <label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search practice tasks…" /></label>
        {['All','Pending','In Progress','Completed'].map((item) => <button className={`button ${status === item ? 'button-primary' : 'button-secondary'}`} onClick={() => setStatus(item)} key={item}>{item}</button>)}
      </div>
      <div className="task-list">
        {filtered.map((task) => (
          <Card className="task-row" key={task.title}>
            <div className="task-row-head"><div><div className="inline-actions" style={{ justifyContent: "flex-start" }}><Badge tone="blue">{task.category}</Badge><Badge tone={task.status === "Completed" ? "green" : task.status === "In Progress" ? "blue" : "amber"}>{task.status}</Badge></div><h3 style={{ marginTop: 9 }}>{task.title}</h3></div><strong>{task.progress}%</strong></div>
            <ProgressBar value={task.progress} tone={task.progress === 100 ? "green" : "blue"} /><p>{task.note}</p>
            <div className="history-meta"><span style={{ color: "var(--muted)", fontSize: 10 }}>{task.date}</span>{task.rating > 0 && <span style={{ display: "flex", color: "var(--amber)" }}>{Array.from({ length: task.rating }).map((_, i) => <Star key={i} size={13} fill="currentColor" />)}</span>}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
