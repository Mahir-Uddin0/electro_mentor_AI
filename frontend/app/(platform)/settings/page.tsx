"use client";

import { ChevronRight, CircleUserRound, KeyRound, Languages, Moon, ShieldAlert, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge, Card, PageHeading } from "@/components/ui";

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div>{children}</div>;
}

export default function SettingsPage() {
  const [photoAlerts, setPhotoAlerts] = useState(true);
  const [safetyAlerts, setSafetyAlerts] = useState(true);
  const [insights, setInsights] = useState(false);
  return (
    <>
      <PageHeading title="Settings" description="Manage your account, appearance, notifications, and training preferences." />
      <div className="settings-stack">
        <Card className="settings-card"><h2>Account</h2>
          <SettingRow title="Profile Settings" description="Manage your name, institute, training level, and specialization"><CircleUserRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title="Change Password" description="Update your account password securely"><KeyRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title="Delete Account" description="Permanently delete your account and all data"><ShieldAlert size={18} color="var(--red)" /></SettingRow>
        </Card>
        <Card className="settings-card"><h2>Appearance</h2>
          <SettingRow title="Theme" description="Choose light, dark, or system theme"><div className="inline-actions"><Badge tone="blue"><Moon size={12} /> Light</Badge><ChevronRight size={16} /></div></SettingRow>
          <SettingRow title="Language" description="Select your preferred language"><div className="inline-actions"><Badge tone="gray"><Languages size={12} /> EN / English</Badge><ChevronRight size={16} /></div></SettingRow>
        </Card>
        <Card className="settings-card"><h2>Notifications</h2>
          <SettingRow title="Photo Analysis" description="Notify me when an AI photo analysis is complete"><button className={`toggle ${photoAlerts ? "on" : ""}`} onClick={() => setPhotoAlerts(!photoAlerts)} aria-label="Toggle photo analysis notifications" /></SettingRow>
          <SettingRow title="Safety Alerts" description="Receive safety warnings and PPE reminders"><button className={`toggle ${safetyAlerts ? "on" : ""}`} onClick={() => setSafetyAlerts(!safetyAlerts)} aria-label="Toggle safety alerts" /></SettingRow>
          <SettingRow title="AI Insights" description="Allow personalized learning tips based on progress"><button className={`toggle ${insights ? "on" : ""}`} onClick={() => setInsights(!insights)} aria-label="Toggle AI insights" /></SettingRow>
        </Card>
        <Card className="settings-card"><h2>Electrical Training Preferences</h2>
          <SettingRow title="Default Process" description="House wiring and electrical installation"><select className="select-field"><option>House Wiring</option><option>Motor Installation</option><option>Industrial Control</option></select></SettingRow>
          <SettingRow title="Default Difficulty" description="Used for recommended guides and practice tasks"><select className="select-field"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></SettingRow>
        </Card>
        <Card className="settings-card"><h2>About</h2><SettingRow title="ElectroMentor AI v1.0" description="Built for TVET trainees in Bangladesh"><Sparkles size={18} color="var(--primary)" /></SettingRow></Card>
      </div>
    </>
  );
}
