// Typed API client for the conference abstract management backend.
// Stores access token in module-level variable; on 401 tries /auth/refresh then retries.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Module-level token store
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "submitter" | "reviewer" | "program_chair" | "admin";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "decided"
  | "assigned_to_session"
  | "notified"
  | "confirmed"
  | "files_submitted"
  | "withdrawn";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution?: string;
  email_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface CoAuthor {
  name: string;
  email: string;
  institution?: string;
}

export interface PresenterInfo {
  id: string;
  full_name: string;
  email: string;
  institution?: string;
}

export interface Submission {
  id: string;
  title: string;
  abstract_text: string;
  co_authors: CoAuthor[];
  keywords: string[];
  track?: string;
  submission_type_preference: string;
  status: SubmissionStatus;
  presenting_author_id: string;
  presenting_author: PresenterInfo;
  submitted_at?: string;
  updated_at: string;
  attachments: Attachment[];
}

export interface SubmissionCreate {
  title: string;
  abstract_text: string;
  co_authors: CoAuthor[];
  keywords: string[];
  track?: string;
  submission_type_preference?: string;
}

export interface Review {
  id: string;
  submission_id: string;
  reviewer_id: string;
  score?: number;
  recommendation?: string;
  comments?: string;
  comments_for_author?: string;
  submitted_at?: string;
  created_at: string;
}

export interface SubmissionSummary {
  id: string;
  title: string;
  abstract_text: string;
  keywords: string[];
  track?: string;
  submission_type_preference?: string;
  attachments: Attachment[];
}

export interface ReviewWithSubmission extends Review {
  submission: SubmissionSummary;
}

export interface Attachment {
  id: string;
  file_type: "abstract_document" | "final_presentation" | "final_poster";
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface AdminFile {
  attachment_id: string;
  file_type: "abstract_document" | "final_presentation" | "final_poster";
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  submission_id: string;
  submission_title: string;
  presenter_name: string;
  submission_status: SubmissionStatus;
  session_title: string | null;
  slot_order: number | null;
}

export interface SlotAttachment {
  attachment_id: string;
  file_type: "abstract_document" | "final_presentation" | "final_poster";
  original_filename: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface SlotFileStatus {
  slot_id: string;
  slot_order: number;
  slot_type: SlotType;
  submission_id: string | null;
  submission_title: string | null;
  presenter_name: string | null;
  expected: boolean;
  uploaded: boolean;
  attachments: SlotAttachment[];
}

export interface SessionFiles {
  session_id: string;
  title: string;
  session_type: string;
  session_date: string;
  start_time: string;
  room: string | null;
  chair_name: string | null;
  total_expected: number;
  total_uploaded: number;
  total_missing: number;
  slots: SlotFileStatus[];
}

export interface AudienceFilter {
  roles: UserRole[];
  submission_statuses: SubmissionStatus[];
  email_verified: boolean | null;
}

export interface BroadcastRecipient {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
}

export interface BroadcastPreview {
  count: number;
  sample: BroadcastRecipient[];
}

export interface ConferenceSettings {
  conference_name: string;
  location?: string;
  conference_start_date?: string;
  conference_end_date?: string;
  submission_deadline?: string;
  confirmation_deadline?: string;
  file_submission_deadline?: string;
  tracks: string[];
  email_from_address?: string;
  email_from_name?: string;
  preview_variables: Record<string, string>;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  session_type: SessionType;
  session_date: string;
  start_time: string;
  end_time: string;
  room?: string;
  chair_name?: string;
  max_slots: number;
  is_published: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  slots?: SessionSlot[];
}

export type SlotType = "talk" | "qa" | "discussion" | "poster";
export type SessionType = "oral" | "poster" | "networking_break" | "lunch" | "happy_hour";

export const NO_SLOT_SESSION_TYPES: SessionType[] = ["networking_break", "lunch", "happy_hour"];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  oral: "Oral",
  poster: "Poster",
  networking_break: "Networking Break",
  lunch: "Lunch",
  happy_hour: "Happy Hour",
};

// Reviewer recommendation labels. "reject" is legacy (kept for old reviews).
export const RECOMMENDATION_LABELS: Record<string, string> = {
  oral: "Oral",
  poster: "Poster",
  na: "N/A",
  reject: "Reject",
};

export interface SessionSlot {
  id: string;
  session_id: string;
  submission_id: string | null;
  slot_type: SlotType;
  slot_order: number;
  duration_minutes: number;
  board_number: string | null;
  poster_number: number | null;
  created_at: string;
}

export interface ProgramSlot {
  slot_order: number;
  slot_type: SlotType;
  duration_minutes: number;
  abstract_title: string | null;
  abstract_text: string | null;
  presenter_name: string | null;
  presenter_institution: string | null;
  board_number: string | null;
  poster_number: number | null;
}

export interface ProgramSession {
  id: string;
  title: string;
  description?: string;
  session_type: string;
  session_date: string;
  start_time: string;
  end_time: string;
  room?: string;
  chair_name?: string;
  slots: ProgramSlot[];
}

export interface SessionCreate {
  title: string;
  description?: string;
  session_type?: SessionType;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  room?: string;
  chair_name?: string;
  max_slots?: number;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface EmailTemplate {
  alias: string;
  subject: string;
  html: string;
  text: string;
  updated_at: string;
}

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────────

class ApiRequestError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiRequestError";
  }
}

export { ApiRequestError };

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiError;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map((e) => e.msg).join("; ");
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

async function refreshTokens(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string };
    setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  // If body is FormData let the browser set Content-Type (with boundary)
  const isFormData = options.body instanceof FormData;
  const extraHeaders = (options.headers as Record<string, string>) ?? {};
  const headers: Record<string, string> = isFormData
    ? { ...extraHeaders }
    : { "Content-Type": "application/json", ...extraHeaders };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
    setAccessToken(null);
    throw new ApiRequestError(401, "Session expired. Please log in again.");
  }

  if (!res.ok) {
    const detail = await parseError(res);
    throw new ApiRequestError(res.status, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth endpoints ────────────────────────────────────────────────────────────

export const auth = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await parseError(res);
      throw new ApiRequestError(res.status, detail);
    }
    const data = (await res.json()) as AuthResponse;
    setAccessToken(data.access_token);
    return data;
  },

  async register(payload: {
    username: string;
    email: string;
    password: string;
    full_name: string;
    institution?: string;
  }): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAccessToken(data.access_token);
    return data;
  },

  async refresh(): Promise<{ access_token: string } | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { access_token: string };
      setAccessToken(data.access_token);
      return data;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
    }
  },

  async verifyEmail(token: string): Promise<void> {
    await apiFetch<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async resendVerification(): Promise<void> {
    await apiFetch<{ message: string }>("/auth/resend-verification", { method: "POST" });
  },

  async forgotUsername(email: string): Promise<void> {
    await apiFetch<{ message: string }>("/auth/forgot-username", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async forgotPassword(username: string): Promise<void> {
    await apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  },

  async resetPassword(token: string, new_password: string): Promise<void> {
    await apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
  },

  async me(): Promise<User> {
    // Try the standard /auth/me endpoint first; fall back to JWT payload decoding.
    try {
      return await apiFetch<User>("/auth/me");
    } catch {
      // Decode JWT payload as fallback (no signature verification — trust the server-issued token)
      const token = accessToken;
      if (!token) throw new Error("Not authenticated");
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid token");
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return {
        id: payload.sub ?? payload.id ?? 0,
        username: payload.username ?? "",
        email: payload.email ?? "",
        full_name: payload.full_name ?? payload.name ?? payload.email ?? "Unknown",
        role: (payload.role ?? "submitter") as UserRole,
        institution: payload.institution,
        email_verified: payload.email_verified ?? false,
        created_at: new Date().toISOString(),
      };
    }
  },
};

// ─── Submissions endpoints ─────────────────────────────────────────────────────

export const submissions = {
  list(): Promise<Submission[]> {
    return apiFetch<Submission[]>("/submissions/");
  },

  get(id: string): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}`);
  },

  create(payload: SubmissionCreate): Promise<Submission> {
    return apiFetch<Submission>("/submissions/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: string, payload: Partial<SubmissionCreate>): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/submissions/${id}`, { method: "DELETE" });
  },

  submit(id: string): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}/submit`, { method: "POST" });
  },

  confirm(id: string): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}/confirm`, { method: "POST" });
  },

  withdraw(id: string): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}/withdraw`, { method: "POST" });
  },

  submitFiles(id: string, formData: FormData): Promise<Submission> {
    // Body is FormData — apiFetch will detect this and omit Content-Type header
    // so the browser can set it with the proper multipart boundary.
    return apiFetch<Submission>(`/submissions/${id}/submit-files`, {
      method: "POST",
      body: formData,
    });
  },

  requestFileReplacement(id: string): Promise<Submission> {
    return apiFetch<Submission>(`/submissions/${id}/request-file-replacement`, {
      method: "POST",
    });
  },
};

// ─── Admin endpoints ───────────────────────────────────────────────────────────

export const admin = {
  getSettings(): Promise<ConferenceSettings> {
    return apiFetch<ConferenceSettings>("/admin/conference-settings");
  },

  updateSettings(payload: Partial<ConferenceSettings>): Promise<ConferenceSettings> {
    return apiFetch<ConferenceSettings>("/admin/conference-settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  getUsers(): Promise<User[]> {
    return apiFetch<User[]>("/admin/users");
  },

  // Reviewer accounts for assignment — accessible to program chairs (getUsers is admin-only).
  getReviewers(): Promise<User[]> {
    return apiFetch<User[]>("/admin/reviewers");
  },

  updateUser(id: string, payload: { role?: UserRole; is_active?: boolean }): Promise<User> {
    return apiFetch<User>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteUser(id: string): Promise<void> {
    return apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" });
  },

  overrideStatus(
    id: string,
    payload: { status: SubmissionStatus; reason?: string },
  ): Promise<Submission> {
    return apiFetch<Submission>(`/admin/submissions/${id}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getAuditLog(): Promise<AuditLog[]> {
    return apiFetch<AuditLog[]>("/admin/audit-log");
  },

  bulkNotify(dry_run: boolean): Promise<{ queued: number; dry_run: boolean }> {
    return apiFetch("/admin/notifications/bulk-notify", {
      method: "POST",
      body: JSON.stringify({ dry_run }),
    });
  },

  // One digest email per reviewer listing their assignments + status.
  notifyReviewers(dry_run: boolean): Promise<{ queued: number; dry_run: boolean }> {
    return apiFetch("/notifications/notify-reviewers", {
      method: "POST",
      body: JSON.stringify({ dry_run }),
    });
  },

  getPresentersCSVUrl(): string {
    return `${API_BASE}/admin/presenters.csv`;
  },

  emailJobs(): Promise<{
    id: string;
    recipient_email: string;
    template_alias: string;
    status: string;
    error_message: string | null;
    retry_count: number;
    created_at: string;
    sent_at: string | null;
  }[]> {
    return apiFetch("/notifications/email-jobs");
  },

  sendTestEmail(template: string): Promise<{ queued: boolean }> {
    return apiFetch<{ queued: boolean }>("/notifications/test-email", {
      method: "POST",
      body: JSON.stringify({ template }),
    });
  },

  requestResetOtp(): Promise<{ otp_token: string }> {
    return apiFetch<{ otp_token: string }>("/admin/reset/request-otp", { method: "POST" });
  },

  reset(otp_token: string, otp_code: string): Promise<void> {
    return apiFetch<void>("/admin/reset", {
      method: "POST",
      body: JSON.stringify({ otp_token, otp_code }),
    });
  },

  getEmailTemplates(): Promise<EmailTemplate[]> {
    return apiFetch<EmailTemplate[]>("/admin/email-templates");
  },

  updateEmailTemplate(
    alias: string,
    payload: { subject: string; html: string; text: string },
  ): Promise<EmailTemplate> {
    return apiFetch<EmailTemplate>(`/admin/email-templates/${alias}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};

// ─── Sessions endpoints ────────────────────────────────────────────────────────

export const sessionApi = {
  list(): Promise<Session[]> {
    return apiFetch<Session[]>("/sessions/");
  },

  get(id: string): Promise<Session> {
    return apiFetch<Session>(`/sessions/${id}`);
  },

  create(payload: SessionCreate): Promise<Session> {
    return apiFetch<Session>("/sessions/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(id: string, payload: Partial<SessionCreate & { is_published: boolean }>): Promise<Session> {
    return apiFetch<Session>(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  addSlot(
    id: string,
    payload: {
      submission_id?: string | null;
      slot_type?: SlotType;
      slot_order: number;
      duration_minutes?: number;
      board_number?: string;
      poster_number?: number;
    },
  ): Promise<SessionSlot> {
    return apiFetch<SessionSlot>(`/sessions/${id}/slots`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  removeSlot(sessionId: string, slotId: string): Promise<Session> {
    return apiFetch<Session>(`/sessions/${sessionId}/slots/${slotId}`, { method: "DELETE" });
  },

  updateSlot(sessionId: string, slotId: string, payload: { slot_order?: number; duration_minutes?: number; board_number?: string; poster_number?: number }): Promise<Session> {
    return apiFetch<Session>(`/sessions/${sessionId}/slots/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  program(): Promise<ProgramSession[]> {
    return apiFetch<ProgramSession[]>("/sessions/program");
  },

  conferenceInfo(): Promise<{ conference_name: string; location?: string; tracks: string[] }> {
    return apiFetch("/sessions/conference-info");
  },
};

// ─── Files endpoints ───────────────────────────────────────────────────────────

export const filesApi = {
  async requestUploadUrl(payload: {
    submission_id: string;
    file_type: string;
    original_filename: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<{ upload_url: string; storage_key: string; expires_in: number }> {
    return apiFetch("/files/upload-url", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async confirmUpload(payload: {
    storage_key: string;
    submission_id: string;
    file_type: string;
    original_filename: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<Attachment> {
    return apiFetch("/files/confirm-upload", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async downloadUrl(attachmentId: string): Promise<{ download_url: string; expires_in: number }> {
    return apiFetch(`/files/${attachmentId}/download-url`);
  },

  listAll(): Promise<AdminFile[]> {
    return apiFetch<AdminFile[]>("/files/all");
  },

  bySession(): Promise<SessionFiles[]> {
    return apiFetch<SessionFiles[]>("/files/by-session");
  },

  // Streamed zip of all presentation/poster files — fetch with the auth header (see Files page).
  presentationsZipUrl(): string {
    return `${API_BASE}/files/presentations.zip`;
  },

  deleteAttachment(attachmentId: string): Promise<void> {
    return apiFetch<void>(`/files/${attachmentId}`, { method: "DELETE" });
  },
};

// ─── Broadcast (email a filtered set of users) ──────────────────────────────────

export const broadcast = {
  preview(filters: AudienceFilter): Promise<BroadcastPreview> {
    return apiFetch<BroadcastPreview>("/broadcast/preview", {
      method: "POST",
      body: JSON.stringify(filters),
    });
  },

  send(filters: AudienceFilter, subject: string, body: string): Promise<{ queued: number }> {
    return apiFetch<{ queued: number }>("/broadcast/send", {
      method: "POST",
      body: JSON.stringify({ filters, subject, body }),
    });
  },
};

// ─── Decisions ──────────────────────────────────────────────────────────────────

export type DecisionOutcome = "oral" | "poster" | "rejected";

export const decisions = {
  // Record the committee decision; advances an under-review submission to "decided".
  record(submissionId: string, outcome: DecisionOutcome): Promise<unknown> {
    return apiFetch("/decisions/", {
      method: "POST",
      body: JSON.stringify({ submission_id: submissionId, outcome }),
    });
  },
};

// ─── Reviews endpoints ─────────────────────────────────────────────────────────

export const reviews = {
  mine(): Promise<ReviewWithSubmission[]> {
    return apiFetch<ReviewWithSubmission[]>("/reviews/mine");
  },

  assign(payload: { submission_id: string; reviewer_id: string }): Promise<Review> {
    return apiFetch<Review>("/reviews/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  forSubmission(submissionId: string): Promise<Review[]> {
    return apiFetch<Review[]>(`/reviews/submission/${submissionId}`);
  },

  submit(
    reviewId: string,
    payload: {
      score: number;
      recommendation: string;
      comments?: string;
      comments_for_author?: string;
    },
  ): Promise<Review> {
    return apiFetch<Review>(`/reviews/${reviewId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
