# Conference Abstract Management System

Manages the full lifecycle of a single technical conference, from call for abstracts through to final file submission by accepted presenters. One installation = one conference. A new conference means a fresh deployment.

## Language

**Abstract**:
A proposed contribution to the conference, consisting of a title, plain-text summary, and an Abstract Document file. Called "Submission" in the code.
_Avoid_: Submission, paper, proposal

**Abstract Document**:
A PDF or DOCX file (max 10MB) uploaded by the Presenter as part of their Abstract. May contain figures and tables. Reviewers read the plain-text summary directly in the system; the Abstract Document is the authoritative version.
_Avoid_: Attachment, file, upload

**Presenter**:
The person responsible for an Abstract and who will deliver the talk or poster if accepted. Called "presenting_author" in the code.
_Avoid_: Author, submitter, speaker

**Co-Author**:
A named contributor to an Abstract who has no system account and cannot manage the Abstract. Stored as metadata (name, email, institution) on the Abstract for attribution only.
_Avoid_: Author, collaborator

**Decision**:
The program chair's final determination of how an accepted Abstract will be presented. One of: oral, poster, or rejected. May override the Presenter's stated preference.
_Avoid_: Outcome, verdict, result

**Program**:
The public-facing schedule of published Sessions and their assigned Abstracts. Visible to anyone without authentication once a Session is marked published. Shows session time, room, chair, and for each slot: the abstract title, the Presenter (labeled and visually distinguished), and Co-Authors with their institutions. Does not expose review scores, reviewer names, or rejected abstracts.
_Avoid_: Schedule, agenda, timetable

**Presenter List**:
An admin-exportable list of all confirmed Presenters (name, email, institution) used to cross-check against a separate registration system. The Presenter is always labeled distinctly from Co-Authors on the public Program.
_Avoid_: Speaker list, author list

**Conference Settings**:
Admin-managed configuration stored in the database, not environment variables. Includes conference name, dates, location, and the three deadlines (submission, confirmation, file submission). Changeable at runtime without a redeploy.
_Avoid_: Config, environment, settings

## Relationships

- An **Abstract** belongs to exactly one **Presenter**
- Submitting an **Abstract** locks it from further editing regardless of the submission deadline; the deadline only controls when new submissions are accepted
- An **Abstract** has one **Abstract Document** file and a plain-text summary; both are kept
- An **Abstract** lists zero or more **Co-Authors** as attribution metadata only
- A **Program Chair** can request a file replacement, returning a **files_submitted** Abstract to **confirmed** so the Presenter can re-upload
- When a **Presenter** withdraws, their **Session** slot is automatically freed; the Program Chair decides whether to backfill it
