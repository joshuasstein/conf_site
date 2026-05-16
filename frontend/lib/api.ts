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
  email: string;
  full_name: string;
  role: UserRole;
  institution?: string;
  is_active: boolean;
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

export interface ConferenceSettings {
  conference_name: string;
  location?: string;
  conference_start_date?: string;
  conference_end_date?: string;
  submission_deadline?: string;
  confirmation_deadline?: string;
  file_submission_deadline?: string;
  tracks: string[];
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  session_type: string;
  session_date: string;
  start_time: string;
  end_time: string;
  room?: string;
  chair_name?: string;
  max_slots: number;
  is_published: boolean;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  slots?: SessionSlot[];
}

export interface SessionSlot {
  id: string;
  session_id: string;
  submission_id: string;
  slot_order: number;
  duration_minutes: number;
  created_at: string;
}

export interface ProgramSlot {
  slot_order: number;
  duration_minutes: number;
  abstract_title: string;
  presenter_name: string;
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
  session_type?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  room?: string;
  chair_name?: string;
  max_slots?: number;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
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
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
        email: payload.email ?? "",
        full_name: payload.full_name ?? payload.name ?? payload.email ?? "Unknown",
        role: (payload.role ?? "submitter") as UserRole,
        institution: payload.institution,
        is_active: true,
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

  bulkNotify(dry_run: boolean): Promise<{ notified: number; dry_run: boolean }> {
    return apiFetch("/admin/notifications/bulk-notify", {
      method: "POST",
      body: JSON.stringify({ dry_run }),
    });
  },

  getPresentersCSVUrl(): string {
    return `${API_BASE}/admin/presenters.csv`;
  },

  reset(): Promise<void> {
    return apiFetch<void>("/admin/reset", { method: "POST" });
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
    payload: { submission_id: string; slot_order: number; duration_minutes?: number },
  ): Promise<SessionSlot> {
    return apiFetch<SessionSlot>(`/sessions/${id}/slots`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  program(): Promise<ProgramSession[]> {
    return apiFetch<ProgramSession[]>("/sessions/program");
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

  deleteAttachment(attachmentId: string): Promise<void> {
    return apiFetch<void>(`/files/${attachmentId}`, { method: "DELETE" });
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
