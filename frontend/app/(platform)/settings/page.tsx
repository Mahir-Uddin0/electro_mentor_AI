"use client";

import { ChevronRight, CircleUserRound, ExternalLink, KeyRound, Languages, Moon, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useApiKey } from "@/components/api-key-provider";
import { Badge, Card, PageHeading } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div>{children}</div>;
}

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const { status: apiKeyStatus, loading: apiKeyLoading, error: apiKeyLoadError, save: saveApiKey, remove: removeApiKey } = useApiKey();
  const [photoAlerts, setPhotoAlerts] = useState(true);
  const [safetyAlerts, setSafetyAlerts] = useState(true);
  const [insights, setInsights] = useState(false);
  const [replacingApiKey, setReplacingApiKey] = useState(false);
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");

  useEffect(() => {
    if (apiKeyStatus?.configured === false) setReplacingApiKey(true);
  }, [apiKeyStatus?.configured]);

  async function submitApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiKeyBusy(true);
    setApiKeyError("");
    setApiKeyMessage("");
    try {
      await saveApiKey(event.currentTarget);
      setReplacingApiKey(false);
      setApiKeyMessage(t("Your Gemini API key has been saved securely."));
    } catch (caught) {
      setApiKeyError(
        caught instanceof Error ? caught.message : t("Your API key could not be saved."),
      );
    } finally {
      setApiKeyBusy(false);
    }
  }

  async function deleteApiKey() {
    if (!window.confirm(t("Delete your saved Gemini API key? AI features will stop working until you add another key."))) return;
    setApiKeyBusy(true);
    setApiKeyError("");
    setApiKeyMessage("");
    try {
      await removeApiKey();
      setReplacingApiKey(true);
      setApiKeyMessage(t("Your Gemini API key has been deleted."));
    } catch (caught) {
      setApiKeyError(
        caught instanceof Error ? caught.message : t("Your API key could not be deleted."),
      );
    } finally {
      setApiKeyBusy(false);
    }
  }

  return (
    <>
      <PageHeading title={t("Settings")} description={t("Manage your account, appearance, notifications, and training preferences.")} />
      <div className="settings-stack">
        <Card className="settings-card"><h2>{t("Account")}</h2>
          <SettingRow title={t("Profile Settings")} description={t("Manage your name, institute, training level, and specialization")}><CircleUserRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title={t("Change Password")} description={t("Update your account password securely")}><KeyRound size={18} color="var(--primary)" /></SettingRow>
          <SettingRow title={t("Delete Account")} description={t("Permanently delete your account and all data")}><ShieldAlert size={18} color="var(--red)" /></SettingRow>
        </Card>
        <Card className="settings-card api-key-settings" id="gemini-api-key">
          <h2><KeyRound size={17} /> {t("Gemini API key")}</h2>
          <div className="api-key-settings-body">
            <div>
              <strong>{t("Use your own Gemini API key")}</strong>
              <p>{t("ElectroMentor uses your key only from the backend for AI requests. After saving, the full key is never returned to or displayed by the app.")}</p>
            </div>
            <ol className="api-key-instructions">
              <li>{t("Open Google AI Studio and sign in with your Google account.")}</li>
              <li>{t("Choose Create API key, select a project, and copy the generated key.")}</li>
              <li>{t("Paste the key below and save it. The field masks the key while you type or paste.")}</li>
            </ol>
            <a className="button button-secondary api-key-studio-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> {t("Generate a key in Google AI Studio")}
            </a>

            {apiKeyLoading ? (
              <div className="api-key-status"><span className="spinner" /> {t("Checking your API key…")}</div>
            ) : apiKeyStatus?.configured && !replacingApiKey ? (
              <div className="api-key-current">
                <div>
                  <span>{t("Saved API key")}</span>
                  <strong aria-label={t("Saved API key is hidden")}>{apiKeyStatus.masked_key ?? "****"}</strong>
                </div>
                <div className="inline-actions">
                  <button className="button button-secondary" type="button" disabled={apiKeyBusy} onClick={() => { setReplacingApiKey(true); setApiKeyMessage(""); }}>
                    <KeyRound size={14} /> {t("Replace API key")}
                  </button>
                  <button className="button button-danger" type="button" disabled={apiKeyBusy} onClick={() => void deleteApiKey()}>
                    <Trash2 size={14} /> {t("Delete API key")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="api-key-form" onSubmit={submitApiKey}>
                <label className="field">
                  <span>{apiKeyStatus?.configured ? t("Replacement Gemini API key") : t("Gemini API key")}</span>
                  <input
                    name="api_key"
                    type="password"
                    minLength={20}
                    maxLength={512}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={apiKeyBusy}
                    placeholder="•••••••••••••••••••••••••••••••••••••••"
                  />
                </label>
                <div className="inline-actions">
                  <button className="button button-primary" type="submit" disabled={apiKeyBusy}>
                    <KeyRound size={14} /> {apiKeyBusy ? t("Saving…") : t("Save API key")}
                  </button>
                  {apiKeyStatus?.configured && (
                    <button className="button button-ghost" type="button" disabled={apiKeyBusy} onClick={() => { setReplacingApiKey(false); setApiKeyError(""); }}>
                      {t("Cancel")}
                    </button>
                  )}
                </div>
              </form>
            )}
            {(apiKeyError || apiKeyLoadError) && <div className="auth-message error">{apiKeyError || apiKeyLoadError}</div>}
            {apiKeyMessage && <div className="auth-message success">{apiKeyMessage}</div>}
          </div>
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
