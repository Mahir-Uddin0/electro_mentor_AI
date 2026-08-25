"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, Clock3, Hammer, PackageCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge, Card, PageHeading } from "@/components/ui";

export default function LightingCircuitGuidePage() {
  const [tab, setTab] = useState("Overview");
  return (
    <>
      <Link href="/guides" className="button button-ghost" style={{ paddingLeft: 0 }}><ArrowLeft size={16} /> Back to Guides</Link>
      <PageHeading title="Lighting Circuit Design" description="Design and safely install reliable residential lighting circuits." action={<div className="inline-actions"><Badge tone="green">Beginner</Badge><Badge tone="blue"><Clock3 size={12} /> 25 min</Badge></div>} />
      <div className="detail-tabs">{["Overview", "Instructions", "Safety"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
      {tab === "Overview" && <>
        <Card className="detail-section"><h2><Hammer size={17} color="var(--primary)" /> Required Tools</h2><ul className="two-column-list"><li>Screwdriver set</li><li>Wire stripper</li><li>Multimeter</li><li>Pliers</li><li>Voltage tester</li><li>Insulated side cutter</li></ul></Card>
        <Card className="detail-section"><h2><PackageCheck size={17} color="var(--green)" /> Required Materials</h2><ul className="two-column-list"><li>1.5mm² PVC wire</li><li>Switches</li><li>Ceiling rose</li><li>MCB</li><li>Distribution box</li><li>Junction boxes</li></ul></Card>
        <div className="alert alert-amber"><CircleAlert size={19} /><div><strong>Common mistakes</strong><p>Do not turn off only the wall switch—always isolate the circuit at the distribution board. Avoid incorrect colour coding, loose terminals, and overloaded circuits.</p></div></div>
      </>}
      {tab === "Instructions" && <Card className="detail-section"><h2><PackageCheck size={17} color="var(--primary)" /> Installation steps</h2><ol className="step-list">{["Study the circuit diagram and identify the supply and load points.","Isolate the supply and prove dead with an approved voltage tester.","Route conductors without exceeding the permitted bend radius.","Terminate line, neutral and protective conductors at the correct points.","Inspect, test continuity and insulation resistance before energizing."].map((step,index)=><li key={step}><i>{index+1}</i><span>{step}</span></li>)}</ol></Card>}
      {tab === "Safety" && <div className="alert alert-red"><ShieldCheck size={19} /><div><strong>Never work on an energized circuit</strong><p>Lock out and tag the supply, verify isolation, wear appropriate PPE, and work under qualified supervision.</p></div></div>}
    </>
  );
}
