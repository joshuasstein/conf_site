"use client";

import { StatusBadge } from "@/components/submission/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubmissionStatus } from "@/lib/api";
import {
  BookOpen,
  User as UserIcon,
  ClipboardCheck,
  CalendarCog,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

const ROLES: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  can: string[];
}[] = [
  {
    name: "Submitter",
    icon: UserIcon,
    summary: "An author who submits and presents work.",
    can: [
      "Create and edit draft submissions before the deadline",
      "Submit an abstract for review",
      "Confirm or withdraw an accepted presentation",
      "Upload final presentation / poster files after confirming",
      "Track their submission status in real time",
    ],
  },
  {
    name: "Reviewer",
    icon: ClipboardCheck,
    summary: "A committee member who evaluates assigned submissions.",
    can: [
      "Assigned to submissions by a program chair or admin (reviewers do not self-select)",
      "View submissions assigned to them for review",
      "Download the abstract files of assigned submissions",
      "Submit a score (1–5), comments, and a recommendation",
      "Cannot review their own submissions",
    ],
  },
  {
    name: "Program Chair",
    icon: CalendarCog,
    summary: "Builds the program and manages the review process.",
    can: [
      "Everything a reviewer can do, plus:",
      "View all submissions and all reviews",
      "Assign reviewers to submissions",
      "Create sessions and assign accepted submissions to slots",
      "Publish the public program",
      "Monitor uploaded files and email groups of users",
    ],
  },
  {
    name: "Admin",
    icon: ShieldCheck,
    summary: "Full control over the conference and its data.",
    can: [
      "Everything a program chair can do, plus:",
      "Manage users and change roles",
      "Configure deadlines and conference settings",
      "Bulk-notify decisions and force any status change (audit-logged)",
      "Edit email templates and reset all data",
    ],
  },
];

const LIFECYCLE: { status: SubmissionStatus; who: string; desc: string }[] = [
  { status: "draft", who: "Submitter", desc: "The submitter is creating or editing the submission. Freely editable, and the abstract document can be uploaded. Not yet visible to reviewers." },
  { status: "submitted", who: "Submitter", desc: "The submitter has submitted the abstract. It is now locked from further editing (except by an admin) and enters the review queue." },
  { status: "under_review", who: "Program Chair / Reviewers", desc: "A chair assigns reviewers; reviewers submit scores, comments, and recommendations. Reviewers cannot review their own work." },
  { status: "decided", who: "Program Chair / Admin", desc: "A decision has been recorded — accepted (oral or poster) or rejected — based on the reviews." },
  { status: "assigned_to_session", who: "Program Chair", desc: "An accepted submission has been placed into a session slot, building the conference schedule." },
  { status: "notified", who: "Admin", desc: "The presenter has been emailed their decision (via bulk notify). Accepted presenters are asked to confirm; from here they may also withdraw." },
  { status: "confirmed", who: "Submitter", desc: "The presenter has confirmed they will attend and present. They can now upload their final presentation / poster files." },
  { status: "files_submitted", who: "Submitter", desc: "The presenter has uploaded their final files. The submission is complete." },
];

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 text-sm text-slate-600 leading-relaxed">{children}</div>;
}

export default function DocumentationPage() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Documentation</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        How roles and the submission workflow fit together in this system.
      </p>

      {/* Roles */}
      <h2 className="text-lg font-semibold text-slate-800 mb-3">Roles</h2>
      <p className="text-sm text-slate-500 mb-4">
        Each role builds on the previous one. A user may hold a single role; separate accounts
        can be used for separate roles (e.g. a person who both submits and reviews).
      </p>
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {ROLES.map((r) => (
          <Card key={r.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <r.icon className="h-5 w-5 text-indigo-600" />
                {r.name}
              </CardTitle>
              <p className="text-sm text-slate-500">{r.summary}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-slate-600">
                {r.can.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-indigo-400 shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submission lifecycle */}
      <h2 className="text-lg font-semibold text-slate-800 mb-3">Submission lifecycle</h2>
      <p className="text-sm text-slate-500 mb-4">
        Every submission moves through a defined set of states. Transitions are enforced by the
        system; an admin can force any change, and all forced changes are recorded in the Audit Log.
      </p>

      <Card className="mb-4">
        <CardContent className="py-5">
          <ol className="space-y-4">
            {LIFECYCLE.map((step, i) => (
              <li key={step.status} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-mono text-slate-400 w-5 text-center">{i + 1}</span>
                  {i < LIFECYCLE.length - 1 && <span className="flex-1 w-px bg-slate-200 my-1" />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <StatusBadge status={step.status} />
                    <span className="text-xs text-slate-400">acted by {step.who}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-sm text-slate-500 mb-10">
        <StatusBadge status="notified" />
        <ArrowRight className="h-4 w-4" />
        <StatusBadge status="withdrawn" />
        <span>— a notified presenter who declines to participate withdraws instead of confirming.</span>
      </div>

      {/* Files */}
      <h2 className="text-lg font-semibold text-slate-800 mb-3">Files</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        <Card>
          <CardHeader><CardTitle className="text-base">Abstract document</CardTitle></CardHeader>
          <CardContent>
            <Section>
              <p>The document form of the abstract, uploaded by the submitter.</p>
              <p>Can be attached only while the submission is <StatusBadge status="draft" /> or <StatusBadge status="submitted" />.</p>
            </Section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Presentation &amp; poster</CardTitle></CardHeader>
          <CardContent>
            <Section>
              <p>The final presentation or poster files, uploaded by the presenter.</p>
              <p>Available only after the presenter reaches <StatusBadge status="confirmed" />. Chairs can track which slots are still missing files in <strong>Files → By Session</strong>.</p>
            </Section>
          </CardContent>
        </Card>
      </div>

      {/* Tools */}
      <h2 className="text-lg font-semibold text-slate-800 mb-3">Program &amp; admin tools</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <Card><CardHeader><CardTitle className="text-base">Sessions &amp; Program</CardTitle></CardHeader>
          <CardContent><Section>
            <p>Chairs create sessions with time slots and assign accepted submissions to them, then publish the public program page.</p>
          </Section></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Presenters</CardTitle></CardHeader>
          <CardContent><Section>
            <p>A roster of confirmed presenters, exportable as CSV for event logistics.</p>
          </Section></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Email Users</CardTitle></CardHeader>
          <CardContent><Section>
            <p>Admins and chairs can email a filtered group of users (by role, submission status, or verification) with a custom message. Every send is audit-logged.</p>
          </Section></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent><Section>
            <p>Bulk-notify decisions to presenters, send test emails, and monitor the delivery status of every queued email.</p>
          </Section></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Audit Log</CardTitle></CardHeader>
          <CardContent><Section>
            <p>A complete history of admin actions, forced status changes (with reason), and broadcasts — who did what, and when.</p>
          </Section></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Settings &amp; Users</CardTitle></CardHeader>
          <CardContent><Section>
            <p>Admins configure the conference (name, dates, deadlines, sender address, email templates) and manage user accounts and roles.</p>
          </Section></CardContent></Card>
      </div>
    </div>
  );
}
