"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Flame,
  HardHat,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Card, ProgressBar } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

const checklistItems = [
  "Main power supply is disconnected and locked out",
  "Voltage tester confirms zero voltage at work area",
  "Insulated gloves and safety shoes are worn",
  "Correct wire gauge selected for circuit load",
  "All wires are properly color coded",
  "Earth wire connected to all points",
  "All terminal connections are tight",
  "No exposed conductors visible",
  "Insulation resistance test passed",
  "MCB/RCCB tested for proper operation",
  "All circuits labeled correctly",
  "Fire extinguisher is nearby",
];

const STORAGE_KEY = "electromentor.checklist.house-wiring";

export default function HouseWiringChecklistPage() {
  const { locale, t } = useLanguage();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const progress = useMemo(() => Math.round((checked.size / checklistItems.length) * 100), [checked]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as number[];
      setChecked(new Set(saved.filter((index) => Number.isInteger(index) && index >= 0 && index < checklistItems.length)));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function toggle(index: number) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <>
      <Link href="/safety-checklists" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 16, color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>
        <ArrowLeft size={14} /> {t("Back to Checklists")}
      </Link>

      <div className="page-heading">
        <div>
          <Badge tone="blue">{t("House Wiring")}</Badge>
          <h1 style={{ marginTop: 8 }}>{t("House Wiring Safety Checklist")}</h1>
          <p>{t("Essential safety checks before, during, and after house wiring installation.")}</p>
        </div>
      </div>

      <Card className="generator-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 9 }}>
          <strong style={{ fontSize: 11 }}>{t("Progress")}</strong>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>{new Intl.NumberFormat(locale).format(checked.size)} / {new Intl.NumberFormat(locale).format(checklistItems.length)} {t("completed")}</span>
        </div>
        <ProgressBar value={progress} tone={progress === 100 ? "green" : "blue"} />
      </Card>

      <div style={{ height: 1, margin: "20px 0", background: "var(--line)" }} />

      <Card>
        <div className="checklist-items">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 15 }}>
            <CheckCircle2 size={18} color="var(--green)" /> {t("Checklist Items")}
          </h2>
          {checklistItems.map((item, index) => (
            <label key={item} className={`check-row ${checked.has(index) ? "checked" : ""}`}>
              <input type="checkbox" checked={checked.has(index)} onChange={() => toggle(index)} />
              <span>{t(item)}</span>
            </label>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 14 }}>
        <Card className="detail-section">
          <h2><ShieldCheck size={18} color="var(--green)" /> {t("PPE Required")}</h2>
          <div className="chips">
            <Badge tone="green"><HardHat size={12} /> {t("Insulated Gloves")}</Badge>
            <Badge tone="green"><HardHat size={12} /> {t("Safety Shoes")}</Badge>
            <Badge tone="green"><HardHat size={12} /> {t("Safety Goggles")}</Badge>
            <Badge tone="green"><HardHat size={12} /> {t("Fire Extinguisher")}</Badge>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card className="detail-section">
          <h2><AlertTriangle size={18} color="var(--red)" /> {t("Emergency Procedures")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="alert alert-red"><AlertTriangle size={16} /><p>{t("In case of electric shock: Disconnect power immediately, call emergency services")}</p></div>
            <div className="alert alert-red"><Flame size={16} /><p>{t("In case of fire: Use CO2 or dry chemical extinguisher, never water")}</p></div>
            <div className="alert alert-red"><ShieldCheck size={16} /><p>{t("First aid kit location: Workshop entrance")}</p></div>
          </div>
        </Card>
      </div>
    </>
  );
}
