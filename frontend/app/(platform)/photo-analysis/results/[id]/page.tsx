"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Clock3,
  Download,
  Eye,
  HardHat,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge, Button, Card, LinkButton, PageHeading, SectionTitle } from "@/components/ui";

const repairSteps = [
  "Turn OFF the main power supply at the distribution board.",
  "Verify power is off using a voltage tester.",
  "Wear insulated gloves and safety shoes.",
  "Retighten the terminal screw firmly using a properly sized screwdriver.",
  "Inspect the wire for any signs of heat damage or discoloration.",
  "If the wire is damaged, cut back and re-strip before reconnecting.",
  "Perform a continuity test to verify the connection.",
  "Restore power and test the circuit.",
];

const previousAnalyses = [
  { id: "AN-1039", title: "Exposed Live Wire", date: "2025-01-10", severity: "Critical", confidence: "99%" },
  { id: "AN-1040", title: "Overloaded Circuit", date: "2025-01-08", severity: "High", confidence: "91%" },
  { id: "AN-1041", title: "Missing Ground Connection", date: "2025-01-05", severity: "High", confidence: "87%" },
  { id: "AN-1038", title: "Loose Neutral Wire", date: "2025-01-02", severity: "High", confidence: "96%" },
];

export default function PhotoAnalysisResultPage() {
  const params = useParams<{ id: string }>();

  return (
    <>
      <PageHeading title="AI Fault Detection" eyebrow={`Analysis ${params.id}`} />

      <div className="alert alert-red" style={{ marginBottom: 14 }}>
        <AlertTriangle size={20} />
        <div>
          <strong>High Severity Fault Detected</strong>
          <p>Immediate attention required. Do not attempt repair without proper safety measures.</p>
        </div>
      </div>

      <Card className="result-hero">
        <div className="result-title">
          <div><h1>Loose Neutral Wire</h1><p>Detected at the terminal block connection.</p></div>
          <div className="chips"><Badge tone="green">96% Confidence</Badge><Badge tone="red">High Severity</Badge></div>
        </div>

        <div className="result-info-grid">
          <div className="result-info">
            <span><MapPin size={12} /> Location</span>
            <strong>Terminal Block</strong>
          </div>
          <div className="result-info">
            <span><AlertTriangle size={12} /> Possible cause</span>
            <strong>Vibration, thermal cycling, or improper initial installation may have loosened the terminal screw.</strong>
          </div>
        </div>

        <div className="alert alert-green">
          <Wrench size={19} />
          <div style={{ width: "100%" }}>
            <strong>Repair Recommendation</strong>
            <ol className="step-list">
              {repairSteps.map((step, index) => <li key={step}><i>{index + 1}</i><span>{step}</span></li>)}
            </ol>
          </div>
        </div>

        <div className="alert alert-red">
          <AlertTriangle size={19} />
          <div><strong>Safety Warning</strong><p>Loose neutral connections are extremely dangerous. Always de-energize before working.</p></div>
        </div>

        <div className="result-info-grid">
          <div className="result-info">
            <span><ShieldCheck size={12} /> Required PPE</span>
            <div className="chips" style={{ marginTop: 8 }}>
              <Badge tone="blue">Insulated Gloves (Class 00)</Badge><Badge tone="blue">Safety Shoes</Badge><Badge tone="blue">Safety Goggles</Badge>
            </div>
          </div>
          <div className="result-info">
            <span><HardHat size={12} /> Required tools</span>
            <div className="chips" style={{ marginTop: 8 }}>
              <Badge tone="amber">Screwdriver Set</Badge><Badge tone="amber">Voltage Tester</Badge><Badge tone="amber">Wire Stripper</Badge><Badge tone="amber">Multimeter</Badge>
            </div>
          </div>
        </div>
        <div className="result-info">
          <span><Clock3 size={12} /> Estimated repair time</span>
          <strong>15–20 minutes</strong>
        </div>
      </Card>

      <SectionTitle title="Other Faults Detected" />
      <div className="result-info-grid">
        <Card className="detail-section">
          <div className="result-title"><div><h2>Poor Insulation</h2></div><Badge tone="amber">Medium</Badge></div>
          <p style={{ color: "var(--muted)", fontSize: 11 }}>Cable insulation appears worn at the entry point of the junction box, potentially exposing the conductor.</p>
          <div className="alert alert-green" style={{ marginTop: 12 }}><Wrench size={15} /><p>Replace the cable section or apply appropriate insulation tape.</p></div>
        </Card>
        <Card className="detail-section">
          <div className="result-title"><div><h2>Improper Cable Routing</h2></div><Badge tone="blue">Low</Badge></div>
          <p style={{ color: "var(--muted)", fontSize: 11 }}>Cables are not properly secured in the cable tray and are hanging loosely.</p>
          <div className="alert alert-green" style={{ marginTop: 12 }}><Wrench size={15} /><p>Use cable ties to secure all cables properly in the tray.</p></div>
        </Card>
      </div>

      <div className="inline-actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
        <Button icon={Download} onClick={() => window.print()}>Save Report</Button>
        <LinkButton href="/guides" variant="secondary" icon={BookOpen}>Related Guide</LinkButton>
        <LinkButton href="/photo-analysis" variant="secondary" icon={RotateCcw}>New Analysis</LinkButton>
      </div>

      <SectionTitle title="Previous Analyses" href="#previous-analyses" />
      <div id="previous-analyses" className="history-grid">
        {previousAnalyses.map((analysis) => (
          <Link key={analysis.id} href={`/photo-analysis/results/${analysis.id}`}>
            <Card className="history-card">
              <div className="history-thumb" style={{ position: "relative" }}>
                <Camera size={22} />
                <span style={{ position: "absolute", top: 9, right: 9 }}><Badge tone="red">{analysis.severity}</Badge></span>
              </div>
              <h3>{analysis.title}</h3><p>{analysis.date}</p>
              <div className="history-meta"><span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 10 }}><Eye size={12} /> View</span><Badge tone="green">{analysis.confidence}</Badge></div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
