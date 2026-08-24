"use client";

import {
  ArrowRight,
  CheckSquare,
  HardHat,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Card, LinkButton, PageHeading } from "@/components/ui";

const checklists = [
  {
    id: "house-wiring",
    category: "House Wiring",
    tone: "blue" as const,
    title: "House Wiring Safety Checklist",
    description: "Essential safety checks before, during, and after house wiring installation.",
    items: 12,
    ppe: 4,
  },
  {
    id: "industrial-wiring",
    category: "Industrial Wiring",
    tone: "blue" as const,
    title: "Industrial Wiring Safety Checklist",
    description: "Comprehensive safety checklist for industrial electrical installations.",
    items: 12,
    ppe: 5,
  },
  {
    id: "motor-installation",
    category: "Motor Installation",
    tone: "green" as const,
    title: "Motor Installation Safety Checklist",
    description: "Safety checklist for electric motor installation and commissioning.",
    items: 10,
    ppe: 4,
  },
  {
    id: "workshop-safety",
    category: "General Workshop Safety",
    tone: "amber" as const,
    title: "General Workshop Safety Checklist",
    description: "Daily workshop safety checklist for all electrical work environments.",
    items: 10,
    ppe: 4,
  },
];

export default function SafetyChecklistsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const visibleChecklists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return checklists.filter((checklist) =>
      (category === "All Categories" || checklist.category === category) &&
      (!normalized || `${checklist.title} ${checklist.description} ${checklist.category}`.toLowerCase().includes(normalized)),
    );
  }, [category, query]);

  return (
    <>
      <PageHeading
        title="Wiring & Circuit Guide Library"
        description="Task-specific safety checks for electrical workshop practice."
        action={<LinkButton href="/safety-checklists/generate" icon={Sparkles}>Generate with AI</LinkButton>}
      />

      <div className="filters">
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search checklists…" aria-label="Search checklists" />
        </label>
        <select className="select-field" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
          <option>All Categories</option>
          {checklists.map((checklist) => <option key={checklist.id}>{checklist.category}</option>)}
        </select>
      </div>

      {visibleChecklists.length ? (
        <div className="checklist-grid">
          {visibleChecklists.map((checklist) => (
            <Card key={checklist.id} className="checklist-card">
              <Badge tone={checklist.tone}>{checklist.category}</Badge>
              <h3>{checklist.title}</h3>
              <p>{checklist.description}</p>
              <div className="card-meta">
                <span><CheckSquare size={13} /> {checklist.items} items</span>
                <span><HardHat size={13} /> {checklist.ppe} PPE</span>
              </div>
              <LinkButton href={`/safety-checklists/house-wiring?template=${checklist.id}`} variant="secondary" icon={ArrowRight}>View</LinkButton>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="empty-state">
            <span className="empty-icon"><ShieldCheck size={28} /></span>
            <h2>No checklists found</h2>
            <p>Try a different search term or category.</p>
          </div>
        </Card>
      )}
    </>
  );
}
