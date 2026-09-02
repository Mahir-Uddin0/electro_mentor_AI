"use client";

import { ChevronRight, CircleUserRound, KeyRound, Languages, Moon, ShieldAlert, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge, Card, PageHeading } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div>{children}</div>;
}

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [photoAlerts, setPhotoAlerts] = useState(true);
  const [safetyAlerts, setSafetyAlerts] = useState(true);
  const [insights, setInsights] = useState(false);
  return (
    <>
      <PageHeading title={t("Settings")} description={t("Manage your account, appearance, notifications, and training preferences.")} />
      <div className="settings-stack">
        <Card className="settings-card"><h2>{t("Account")}</h2>
          <SettingRow title={t("Profile Settings")} description={t("Manage your name, institute, training level, and specialization")}><CircleUserRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title={t("Change Password")} description={t("Update your account password securely")}><KeyRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title={t("Delete Account")} description={t("Permanently delete your account and all data")}><ShieldAlert size={18} color="var(--red)" /></SettingRow>
        </Card>
        <Card className="settings-card"><h2>{t("Appearance")}</h2>
          <SettingRow title={t("Theme")} description={t("Choose light, dark, or system theme")}><div className="inline-actions"><Badge tone="blue"><Moon size={12} /> {t("Light")}</Badge><ChevronRight size={16} /></div></SettingRow>
          <SettingRow title={t("Language")} description={t("Select your preferred language")}><div className="language-switch" aria-label={t("Language selection")}>{(["en", "bn"] as const).map((item) => <button type="button" key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)}><Languages size={12} /> {item.toUpperCase()}</button>)}</div></SettingRow>
        </Card>
        <Card className="settings-card"><h2>{t("Notifications")}</h2>
          <SettingRow title={t("Photo Analysis")} description={t("Notify me when an AI photo analysis is complete")}><button className={`toggle ${photoAlerts ? "on" : ""}`} onClick={() => setPhotoAlerts(!photoAlerts)} aria-label={t("Photo Analysis")} /></SettingRow>
          <SettingRow title={t("Safety Alerts")} description={t("Receive safety warnings and PPE reminders")}><button className={`toggle ${safetyAlerts ? "on" : ""}`} onClick={() => setSafetyAlerts(!safetyAlerts)} aria-label={t("Safety Alerts")} /></SettingRow>
          <SettingRow title={t("AI Insights")} description={t("Allow personalized learning tips based on progress")}><button className={`toggle ${insights ? "on" : ""}`} onClick={() => setInsights(!insights)} aria-label={t("AI Insights")} /></SettingRow>
        </Card>
        <Card className="settings-card"><h2>{t("Electrical Training Preferences")}</h2>
          <SettingRow title={t("Default Process")} description={t("House wiring and electrical installation")}><select className="select-field"><option>{t("House Wiring")}</option><option>{t("Motor Installation")}</option><option>{t("Industrial Control")}</option></select></SettingRow>
          <SettingRow title={t("Default Difficulty")} description={t("Used for recommended guides and practice tasks")}><select className="select-field"><option>{t("Beginner")}</option><option>{t("Intermediate")}</option><option>{t("Advanced")}</option></select></SettingRow>
        </Card>
        <Card className="settings-card"><h2>{t("About")}</h2><SettingRow title="ElectroMentor AI v1.0" description={t("Built for TVET trainees in Bangladesh")}><Sparkles size={18} color="var(--primary)" /></SettingRow></Card>
      </div>
    </>
  );
}
