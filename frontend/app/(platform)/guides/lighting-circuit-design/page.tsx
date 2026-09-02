"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, Clock3, Hammer, PackageCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge, Card, PageHeading } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

const tools = ["Screwdriver set", "Wire stripper", "Multimeter", "Pliers", "Voltage tester", "Insulated side cutter"];
const materials = ["1.5mm² PVC wire", "Switches", "Ceiling rose", "MCB", "Distribution box", "Junction boxes"];
const installationSteps = [
  "Study the circuit diagram and identify the supply and load points.",
  "Isolate the supply and prove dead with an approved voltage tester.",
  "Route conductors without exceeding the permitted bend radius.",
  "Terminate line, neutral and protective conductors at the correct points.",
  "Inspect, test continuity and insulation resistance before energizing.",
];

export default function LightingCircuitGuidePage() {
  const { locale, t } = useLanguage();
  const [tab, setTab] = useState("Overview");
  return (
    <>
      <Link href="/guides" className="button button-ghost" style={{ paddingLeft: 0 }}><ArrowLeft size={16} /> {t("Back to Guides")}</Link>
      <PageHeading title={t("Lighting Circuit Design")} description={t("Design and safely install reliable residential lighting circuits.")} action={<div className="inline-actions"><Badge tone="green">{t("Beginner")}</Badge><Badge tone="blue"><Clock3 size={12} /> {t("25 min")}</Badge></div>} />
      <div className="detail-tabs">{["Overview", "Instructions", "Safety"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{t(item)}</button>)}</div>
      {tab === "Overview" && <>
        <Card className="detail-section"><h2><Hammer size={17} color="var(--primary)" /> {t("Required Tools")}</h2><ul className="two-column-list">{tools.map((item) => <li key={item}>{t(item)}</li>)}</ul></Card>
        <Card className="detail-section"><h2><PackageCheck size={17} color="var(--green)" /> {t("Required Materials")}</h2><ul className="two-column-list">{materials.map((item) => <li key={item}>{t(item)}</li>)}</ul></Card>
        <div className="alert alert-amber"><CircleAlert size={19} /><div><strong>{t("Common mistakes")}</strong><p>{t("Do not turn off only the wall switch—always isolate the circuit at the distribution board. Avoid incorrect colour coding, loose terminals, and overloaded circuits.")}</p></div></div>
      </>}
      {tab === "Instructions" && <Card className="detail-section"><h2><PackageCheck size={17} color="var(--primary)" /> {t("Installation steps")}</h2><ol className="step-list">{installationSteps.map((step,index)=><li key={step}><i>{new Intl.NumberFormat(locale).format(index+1)}</i><span>{t(step)}</span></li>)}</ol></Card>}
      {tab === "Safety" && <div className="alert alert-red"><ShieldCheck size={19} /><div><strong>{t("Never work on an energized circuit")}</strong><p>{t("Lock out and tag the supply, verify isolation, wear appropriate PPE, and work under qualified supervision.")}</p></div></div>}
    </>
  );
}
