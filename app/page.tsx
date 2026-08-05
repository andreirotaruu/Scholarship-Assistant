"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/app/lib/api";

type Section = "review" | "profile" | "experiences" | "applications";
type FieldState = "approved" | "review" | "missing" | "manual";

type ReviewField = {
  id: string;
  label: string;
  answer: string;
  source: string;
  confidence: number | null;
  state: FieldState;
  kind: "profile" | "draft" | "ask" | "sensitive";
};

type ProfileField = {
  id: string;
  path: string;
  label: string;
  value: string;
  source: string;
  updated: string;
  verified: boolean;
};

type ExperienceRecord = {
  id: number;
  title: string;
  situation: string;
  actions: string[];
  results: string[];
  themes: string[];
  verified: boolean;
  source: string;
  updated_at: string;
};

type ApplicationRecord = {
  id: number;
  name: string;
  url: string;
  deadline: string | null;
  status: string;
  fields_completed: number;
  fields_total: number;
  missing_fields: number;
  updated_at: string;
};

const initialReviewFields: ReviewField[] = [
  { id: "first_name", label: "First name", answer: "Andrei", source: "Verified profile · Personal", confidence: 0.99, state: "approved", kind: "profile" },
  { id: "major", label: "What is your major?", answer: "Computer Science and Mathematics", source: "Verified profile · Education", confidence: 0.97, state: "approved", kind: "profile" },
  {
    id: "technical_challenge",
    label: "Describe a technical challenge you overcame.",
    answer: "While building Price Intel, I learned that marketplace data rarely arrives clean enough to trust at face value. I built a FastAPI backend to collect eBay listings, calculate median prices, and surface resale metrics. When irrelevant comparables distorted the results, I designed filters to remove misleading listings. The project strengthened my judgment about data quality and taught me to treat a working prototype as the beginning of the problem-solving process, not the end.",
    source: "Drafted from “Building Price Intel” · 3 verified facts",
    confidence: 0.82,
    state: "review",
    kind: "draft",
  },
  { id: "volunteer_hours", label: "How many volunteer hours have you completed?", answer: "", source: "No verified source found", confidence: 0.38, state: "missing", kind: "ask" },
  { id: "income", label: "Annual household income", answer: "", source: "Sensitive information", confidence: null, state: "manual", kind: "sensitive" },
];

const initialProfile: ProfileField[] = [
  { id: "first", path: "personal.first_name", label: "First name", value: "Andrei", source: "Student-entered", updated: "Today", verified: true },
  { id: "last", path: "personal.last_name", label: "Last name", value: "Rotaru", source: "Student-entered", updated: "Today", verified: true },
  { id: "email", path: "personal.email", label: "Email", value: "example@email.com", source: "Student-entered", updated: "Today", verified: true },
  { id: "school", path: "education.school", label: "School", value: "Marquette University", source: "Enrollment record", updated: "Jul 24, 2026", verified: true },
  { id: "majors", path: "education.majors", label: "Majors", value: "Computer Science, Mathematics", source: "Student-entered", updated: "Jul 24, 2026", verified: true },
  { id: "graduation", path: "education.graduation_date", label: "Graduation date", value: "May 2028", source: "Enrollment record", updated: "Jul 24, 2026", verified: true },
  { id: "gpa", path: "education.gpa", label: "GPA", value: "", source: "No source", updated: "Never", verified: false },
];

const navigation: { id: Section; label: string; count?: number }[] = [
  { id: "review", label: "Application review", count: 3 },
  { id: "profile", label: "My profile" },
  { id: "experiences", label: "Experience bank", count: 2 },
  { id: "applications", label: "Applications", count: 1 },
];

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>;
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="confidence manual">Manual</span>;
  const label = value >= 0.9 ? "High" : value >= 0.7 ? "Review" : "Low";
  return <span className={`confidence ${label.toLowerCase()}`}>{Math.round(value * 100)}% · {label}</span>;
}

function ReviewCard({ field, onChange, onApprove, onReject }: {
  field: ReviewField;
  onChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = {
    approved: { icon: "✓", title: "Approved" },
    review: { icon: "!", title: "Review needed" },
    missing: { icon: "?", title: "Information needed" },
    manual: { icon: "⌁", title: "Manual entry" },
  }[field.state];

  return (
    <article className={`review-card ${field.state}`}>
      <div className="status-rail"><span>{status.icon}</span></div>
      <div className="review-content">
        <div className="review-heading">
          <div>
            <div className="eyebrow-row">
              <span className={`state-label ${field.state}`}>{status.title}</span>
              <ConfidenceBadge value={field.confidence} />
            </div>
            <h3>{field.label}</h3>
          </div>
          <button className="icon-button" aria-label={`More options for ${field.label}`}>•••</button>
        </div>
        {field.kind === "sensitive" ? (
          <div className="manual-message">
            <span className="lock-dot">⌁</span>
            <div><strong>Enter this directly on the scholarship website</strong><p>ScholarSafe never stores or suggests financial information.</p></div>
          </div>
        ) : (
          <textarea
            aria-label={`Answer for ${field.label}`}
            className={field.kind === "draft" ? "answer essay-answer" : "answer"}
            placeholder={field.state === "missing" ? "Add a verified answer before this field can be filled" : ""}
            value={field.answer}
            onChange={(event) => onChange(event.target.value)}
            rows={field.kind === "draft" ? 6 : 2}
          />
        )}
        <div className="source-row">
          <span className="source-icon">{field.kind === "draft" ? "✦" : field.state === "missing" ? "?" : "↗"}</span>
          <span>{field.source}</span>
          {field.kind === "draft" && <button className="text-button">View facts used</button>}
        </div>
        {field.kind !== "sensitive" && (
          <div className="card-actions">
            {field.state !== "approved" && <button className="button small primary" onClick={onApprove} disabled={!field.answer.trim()}>Approve answer</button>}
            {field.state === "approved" && <span className="approved-note">✓ Ready to fill</span>}
            {field.kind === "draft" && <button className="button small ghost">Regenerate draft</button>}
            <button className="button small quiet" onClick={onReject}>Reject</button>
          </div>
        )}
      </div>
    </article>
  );
}

function ReviewView() {
  const [fields, setFields] = useState(initialReviewFields);
  const [filled, setFilled] = useState(false);
  const approved = fields.filter((field) => field.state === "approved").length;
  const needsReview = fields.filter((field) => field.state === "review").length;
  const missing = fields.filter((field) => field.state === "missing" || field.state === "manual").length;
  const updateField = (id: string, patch: Partial<ReviewField>) => {
    setFilled(false);
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  };

  return (
    <>
      <header className="page-header">
        <div><div className="breadcrumb"><span>Applications</span><b>/</b>Horizon STEM Scholarship</div><h1>Review every answer</h1><p>Nothing is placed on the application until you approve it.</p></div>
        <div className="header-actions">
          <a className="button ghost" href="/demo-application.html" target="_blank" rel="noreferrer">Open safe test form ↗</a>
          <button className="button primary" onClick={() => setFilled(true)} disabled={approved === 0}>{filled ? "Approved fields filled ✓" : `Fill approved fields · ${approved}`}</button>
        </div>
      </header>
      <section className="progress-card">
        <div className="progress-copy">
          <div className="progress-ring" style={{ "--progress": `${approved / fields.length * 100}%` } as React.CSSProperties}><div><strong>{approved}</strong><span>of 5</span></div></div>
          <div><span className="kicker">APPLICATION PROGRESS</span><h2>{filled ? "Approved answers are ready on the page" : "Three answers need your attention"}</h2><p>{filled ? "Check the scholarship tab, then return here for final review." : "Review the draft and add any missing information before filling."}</p></div>
        </div>
        <div className="progress-stats">
          <div><i className="dot green" /><span><b>{approved}</b> approved</span></div>
          <div><i className="dot amber" /><span><b>{needsReview}</b> to review</span></div>
          <div><i className="dot gray" /><span><b>{missing}</b> manual or missing</span></div>
        </div>
      </section>
      <div className="review-toolbar"><h2>Application fields <span>5</span></h2><div className="legend"><span><i className="dot green" />Ready</span><span><i className="dot amber" />Review</span><span><i className="dot gray" />Manual</span></div></div>
      <div className="review-list">
        {fields.map((field) => (
          <ReviewCard
            key={field.id}
            field={field}
            onChange={(answer) => updateField(field.id, { answer, state: field.state === "approved" ? "review" : field.state })}
            onApprove={() => updateField(field.id, { state: "approved", confidence: Math.max(field.confidence ?? 0.7, 0.7) })}
            onReject={() => updateField(field.id, { answer: "", state: "missing", confidence: 0.3, source: "Suggestion rejected · Add a verified answer" })}
          />
        ))}
      </div>
      <div className="final-review"><div><span>✓</span><div><strong>You stay in control</strong><p>ScholarSafe can prepare answers, but only you can review and submit.</p></div></div><button className="button dark">Open final review</button></div>
    </>
  );
}

function ProfileView() {
  const [profile, setProfile] = useState(initialProfile);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const verifiedCount = profile.filter((field) => field.verified).length;
  useEffect(() => {
    let active = true;
    apiRequest<{ fields: Array<{ path: string; label: string; value: unknown; verified: boolean; source: string; updated_at?: string }> }>("/api/profile")
      .then((payload) => {
        if (!active || !Array.isArray(payload.fields)) return;
        setProfile(payload.fields.map((field: { path: string; label: string; value: unknown; verified: boolean; source: string; updated_at?: string }) => ({
          id: field.path.replaceAll(".", "-"),
          path: field.path,
          label: field.label,
          value: Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? ""),
          verified: field.verified,
          source: field.source,
          updated: field.updated_at ? new Date(field.updated_at).toLocaleDateString() : "Never",
        })));
      })
      .catch(() => setSaveState("offline"));
    return () => { active = false; };
  }, []);

  const saveProfile = async () => {
    setSaveState("saving");
    try {
      await apiRequest("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: profile.map((field) => ({
            path: field.path,
            label: field.label,
            value: field.path === "education.majors" ? field.value.split(",").map((value) => value.trim()).filter(Boolean) : field.value || null,
            verified: field.verified,
            source: field.source,
          })),
        }),
      });
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  };
  return (
    <>
      <header className="page-header"><div><div className="breadcrumb"><span>Profile</span><b>/</b>Verified facts</div><h1>Your verified profile</h1><p>Only facts you verify can be used to prepare applications.</p></div><button className="button primary" onClick={saveProfile} disabled={saveState === "saving"}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "offline" ? "Save when API is online" : "Save profile"}</button></header>
      <section className="profile-summary"><div className="avatar">AR</div><div><span className="kicker">PROFILE READINESS</span><h2>{verifiedCount} of {profile.length} facts verified</h2><p>Complete and verify your GPA to improve matching confidence.</p></div><div className="mini-progress"><span style={{ width: `${verifiedCount / profile.length * 100}%` }} /></div></section>
      <section className="data-panel">
        <div className="panel-heading"><div><span className="section-icon">01</span><div><h2>Personal & education</h2><p>Core facts used for deterministic autofill.</p></div></div><span className="verified-pill">{verifiedCount} verified</span></div>
        <div className="profile-grid">
          {profile.map((field) => (
            <div className="profile-field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <input id={field.id} value={field.value} placeholder="Not provided" onChange={(event) => setProfile((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value, verified: false, updated: "Unsaved" } : item))} />
              <div className="field-meta"><span>{field.source} · {field.updated}</span><label className="verify-control"><input type="checkbox" checked={field.verified} onChange={(event) => setProfile((current) => current.map((item) => item.id === field.id ? { ...item, verified: event.target.checked, updated: "Today" } : item))} /><span>{field.verified ? "Verified" : "Verify"}</span></label></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ExperiencesView() {
  const previewExperiences: ExperienceRecord[] = [
    { id: -1, title: "Building Price Intel", situation: "Built a FastAPI marketplace intelligence MVP and learned to filter noisy comparable listings.", themes: ["Entrepreneurship", "Problem solving", "Technology"], actions: ["Built a FastAPI backend", "Collected marketplace data", "Calculated pricing metrics", "Filtered inaccurate comparables"], results: ["Created a working MVP", "Improved backend skills", "Learned to evaluate noisy data"], verified: true, source: "Preview data", updated_at: "" },
    { id: -2, title: "Logistics engineering internship", situation: "Collected container tracking events with Python, Selenium, APIs, and XML for CargoWise workflows.", themes: ["Systems thinking", "Persistence"], actions: ["Collected tracking events", "Worked with APIs", "Integrated XML workflows"], results: ["Built a tracking integration", "Improved systems knowledge"], verified: true, source: "Preview data", updated_at: "" },
  ];
  const [experiences, setExperiences] = useState(previewExperiences);
  const [showForm, setShowForm] = useState(false);
  const [connection, setConnection] = useState<"loading" | "live" | "offline">("loading");
  const [form, setForm] = useState({ title: "", situation: "", actions: "", results: "", themes: "" });

  useEffect(() => {
    let active = true;
    apiRequest<ExperienceRecord[]>("/api/experiences")
      .then((records) => { if (active) { setExperiences(records); setConnection("live"); } })
      .catch(() => { if (active) setConnection("offline"); });
    return () => { active = false; };
  }, []);

  const saveExperience = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await apiRequest<ExperienceRecord>("/api/experiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(), situation: form.situation.trim(),
          actions: form.actions.split("\n").map((item) => item.trim()).filter(Boolean),
          results: form.results.split("\n").map((item) => item.trim()).filter(Boolean),
          themes: form.themes.split(",").map((item) => item.trim()).filter(Boolean),
          verified: false, source: "Student-entered",
        }),
      });
      setExperiences((current) => [created, ...current]);
      setForm({ title: "", situation: "", actions: "", results: "", themes: "" });
      setShowForm(false);
      setConnection("live");
    } catch { setConnection("offline"); }
  };

  const toggleVerification = async (experience: ExperienceRecord) => {
    if (experience.id < 0) return;
    try {
      const updated = await apiRequest<ExperienceRecord>(`/api/experiences/${experience.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...experience, verified: !experience.verified }),
      });
      setExperiences((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch { setConnection("offline"); }
  };
  return (
    <>
      <header className="page-header"><div><div className="breadcrumb"><span>Profile</span><b>/</b>Experience bank</div><h1>Stories grounded in fact</h1><p>Essay drafts may use only the experiences you verify here.</p></div><button className="button primary" onClick={() => setShowForm((value) => !value)} disabled={connection === "offline"}>{showForm ? "Cancel" : "+ Add experience"}</button></header>
      <div className="experience-intro"><span>✦</span><div><strong>A guardrail against invented stories</strong><p>Situation, actions, and results stay traceable. Drafts will show every fact they use.</p></div></div>
      {connection === "offline" && <div className="offline-banner">Preview data is shown. Start FastAPI to add and verify experiences.</div>}
      {showForm && <form className="experience-form" onSubmit={saveExperience}>
        <div className="panel-heading"><div><span className="section-icon">NEW</span><div><h2>Add an experience</h2><p>Save the facts first, then verify the record when every detail is accurate.</p></div></div></div>
        <label>Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="wide">Situation<textarea required rows={3} value={form.situation} onChange={(event) => setForm({ ...form, situation: event.target.value })} /></label>
        <label>Actions <span>one per line</span><textarea required rows={5} value={form.actions} onChange={(event) => setForm({ ...form, actions: event.target.value })} /></label>
        <label>Results <span>one per line</span><textarea required rows={5} value={form.results} onChange={(event) => setForm({ ...form, results: event.target.value })} /></label>
        <label className="wide">Themes <span>comma separated</span><input value={form.themes} onChange={(event) => setForm({ ...form, themes: event.target.value })} /></label>
        <div className="wide form-actions"><button className="button primary" type="submit">Save unverified experience</button></div>
      </form>}
      <div className="experience-grid">
        {experiences.map((experience, index) => (
          <article className="experience-card" key={experience.title}>
            <div className="experience-number">{String(index + 1).padStart(2, "0")}</div><div className="experience-card-head"><span className={`verified-pill ${experience.verified ? "" : "pending"}`}>{experience.verified ? "✓ Verified" : "Needs verification"}</span></div>
            <h2>{experience.title}</h2><p>{experience.situation}</p><div className="theme-list">{experience.themes.map((theme) => <span key={theme}>{theme}</span>)}</div>
            <div className="experience-stats"><span><b>{experience.actions.length}</b> actions</span><span><b>{experience.results.length}</b> results</span></div><button className="button ghost full" onClick={() => toggleVerification(experience)} disabled={experience.id < 0}>{experience.verified ? "Mark as needing changes" : "Verify these facts"}</button>
          </article>
        ))}
      </div>
    </>
  );
}

function ApplicationsView({ onReview }: { onReview: () => void }) {
  const preview: ApplicationRecord[] = [{ id: -1, name: "Horizon STEM Scholarship", url: "https://horizon-foundation.org", deadline: "2026-10-15", status: "needs_review", fields_completed: 3, fields_total: 5, missing_fields: 2, updated_at: "" }];
  const [applications, setApplications] = useState(preview);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest<ApplicationRecord[]>("/api/applications")
      .then((records) => { if (active) { setApplications(records.length ? records : []); setOffline(false); } })
      .catch(() => { if (active) setOffline(true); });
    return () => { active = false; };
  }, []);
  const statusLabel = (status: string) => status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  return (
    <>
      <header className="page-header"><div><div className="breadcrumb"><span>Workspace</span><b>/</b>Applications</div><h1>Your applications</h1><p>Track prepared answers, missing information, and deadlines.</p></div><a className="button primary" href="/demo-application.html" target="_blank" rel="noreferrer">Open safe test application</a></header>
      <section className="application-table">
        <div className="table-head"><span>Scholarship</span><span>Deadline</span><span>Progress</span><span>Status</span><span /></div>
        {applications.map((application) => <div className="table-row" key={application.id}>
          <div className="scholarship-cell"><div className="scholarship-logo">{application.name.charAt(0).toUpperCase()}</div><div><strong>{application.name}</strong><span>{new URL(application.url).hostname}</span></div></div><span>{application.deadline ? new Date(`${application.deadline}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not listed"}</span>
          <div className="table-progress"><div><span style={{ width: `${application.fields_total ? application.fields_completed / application.fields_total * 100 : 0}%` }} /></div><b>{application.fields_completed} / {application.fields_total}</b></div><span className="status-pill">{statusLabel(application.status)}</span><button className="button small ghost" onClick={onReview}>Review answers</button>
        </div>)}
        {!applications.length && <div className="table-empty">No applications yet. Analyze the safe test form with the extension to create one.</div>}
      </section>
      {offline && <div className="offline-banner">Preview data is shown. Start FastAPI to see applications analyzed by the extension.</div>}
      <div className="privacy-callout"><div className="shield-shape">✓</div><div><strong>No automatic submission—ever.</strong><p>Applications move to “ready to submit” only after your final review. You submit on the scholarship website.</p></div></div>
    </>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("review");
  const title = useMemo(() => navigation.find((item) => item.id === section)?.label, [section]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><BrandMark /><div><strong>ScholarSafe</strong><span>Application copilot</span></div></div>
        <nav aria-label="Main navigation">
          <span className="nav-kicker">WORKSPACE</span>
          {navigation.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}><span className="nav-glyph">{item.id === "review" ? "◫" : item.id === "profile" ? "◯" : item.id === "experiences" ? "✦" : "▤"}</span><span>{item.label}</span>{item.count && <b>{item.count}</b>}</button>)}
        </nav>
        <div className="safety-card"><div className="shield-shape">✓</div><strong>Review before fill</strong><p>Every suggestion waits for your approval.</p><a href="#safety">How safety works →</a></div>
        <div className="user-card"><div className="user-avatar">AR</div><div><strong>Andrei Rotaru</strong><span>Student profile</span></div><button aria-label="Account menu">⌄</button></div>
      </aside>
      <main aria-label={title}>
        <div className="topbar"><span><i className="connection-dot" />Extension connected</span><button>Help & safety</button></div>
        <div className="main-content">
          {section === "review" && <ReviewView />}
          {section === "profile" && <ProfileView />}
          {section === "experiences" && <ExperiencesView />}
          {section === "applications" && <ApplicationsView onReview={() => setSection("review")} />}
        </div>
      </main>
    </div>
  );
}
