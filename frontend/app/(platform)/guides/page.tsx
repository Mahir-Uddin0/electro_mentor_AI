"use client";

import Link from "next/link";
import { BookOpen, Clock3, Eye, Layers3, Search, Star, Users, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Card, PageHeading } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

const guides = [
  { title: "Lighting Circuit Design", category: "Lighting Circuit", level: "Beginner", tone: "green" as const, cover: "gradient-yellow", description: "Learn how to design and install lighting circuits including single switch, two-way switch, and dimmer setups." },
  { title: "Three-Phase Motor Starter Wiring", category: "Motor Starter", level: "Advanced", tone: "red" as const, cover: "gradient-blue", description: "Step-by-step guide for wiring DOL, star-delta and soft-starter motor control panels." },
  { title: "Distribution Board Wiring", category: "Distribution Board", level: "Intermediate", tone: "amber" as const, cover: "gradient-purple", description: "Wire a distribution board including MCB selection, RCCB integration and circuit grouping." },
  { title: "House Wiring Fundamentals", category: "House Wiring", level: "Beginner", tone: "green" as const, cover: "gradient-cyan", description: "Understand cable sizing, socket circuits, earthing and safe residential wiring practices." },
  { title: "Industrial Control Circuits", category: "Control Wiring", level: "Intermediate", tone: "amber" as const, cover: "gradient-green", description: "Build reliable control circuits with contactors, relays, overloads and push-button stations." },
  { title: "RCCB Installation & Testing", category: "Protection", level: "Intermediate", tone: "amber" as const, cover: "gradient-blue", description: "Install, test, and troubleshoot residual-current protection for people and equipment." },
];

const featured: { title: string; description: string; icon: LucideIcon }[] = [
  { title: "Three-Phase Motor Starter Wiring", description: "Advanced motor control", icon: Layers3 },
  { title: "Basic House Wiring Guide", description: "Most popular this week", icon: BookOpen },
  { title: "RCCB Installation & Testing", description: "Essential safety skill", icon: Star },
];

export default function GuidesPage() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("All Levels");
  const [total, setTotal] = useState(24);
  useEffect(() => { void frontendApi.guides().then((data) => setTotal(data.total)).catch(() => {}); }, []);
  const filtered = useMemo(() => guides.filter((guide) =>
    guide.title.toLowerCase().includes(query.toLowerCase()) && (level === "All Levels" || guide.level === level),
  ), [query, level]);

  return (
    <>
      <PageHeading title="Wiring & Circuit Guide Library" description={`Browse ${total} practical, curriculum-aligned electrical guides.`} />
      <div className="featured-grid">
        {featured.map(({ title, description, icon: Icon }) => (
          <Card className="featured-card" key={title}><Icon size={20} color="var(--primary)" /><h3>{title}</h3><p>{description}</p></Card>
        ))}
      </div>
      <div className="filters">
        <label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guides…" /></label>
        <select className="select-field" aria-label="Category"><option>All Categories</option><option>House Wiring</option><option>Motor Starter</option></select>
        <select className="select-field" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option>All Levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
        <select className="select-field" aria-label="Sort"><option>Most Popular</option><option>Newest</option></select>
      </div>
      <div className="content-grid">
        {filtered.map((guide, index) => (
          <Link href="/guides/lighting-circuit-design" className="card guide-card" key={guide.title}>
            <div className={`guide-cover ${guide.cover}`}><BookOpen size={38} /><Badge tone={guide.tone}>{guide.level}</Badge></div>
            <div className="guide-body"><Badge tone="blue">{guide.category}</Badge><h3 style={{ marginTop: 10 }}>{guide.title}</h3><p>{guide.description}</p>
              <div className="card-meta"><span><Clock3 size={12} /> 25 min</span><span><Eye size={12} /> {1.2 + index / 10}k</span><span><Users size={12} /> {280 + index * 31}</span></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
