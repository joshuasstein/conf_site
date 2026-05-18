# PVPMC Workshop — Abstract Management System

A full-stack conference abstract management platform handling the complete lifecycle of abstract submission, peer review, scheduling, and presenter notifications.

**Backend**: FastAPI · PostgreSQL · SQLAlchemy · Alembic · AWS SES · Cloudflare R2  
**Frontend**: Next.js 16 · TypeScript · Tailwind CSS

---

## Features

### For Submitters

- **Register and sign in** with a username (multiple accounts per email address supported, e.g. a separate submitter and reviewer account)
- **Create and manage draft abstracts** — edit freely before the submission deadline
- **Submit, confirm, or withdraw** a presentation at each stage of the process
- **Track submission status** in real time across the full workflow
- **Upload final files** once a presentation is accepted and confirmed
- **Email verification** on account creation with resend support

### For Reviewers

- View all abstracts assigned for review
- Submit a **score (1–5)**, written comments, a recommendation (oral / poster / reject), and feedback for the author
- Download abstract files for assigned submissions
- Cannot review their own submissions

### For Program Chairs

- **Create conference sessions** with named time slots
- **Assign accepted abstracts to slots** to build the conference schedule
- View all reviews and scores per submission
- **Publish the public program** — sessions, time slots, and presenter information

### For Admins

- **User management** — view all accounts, change roles, delete users
- **Deadline configuration** — set submission, review, confirmation, and file upload deadlines
- **Force any status transition** on any submission with a required reason (fully audit-logged)
- **Bulk notify** all decided submitters in one action
- **Email template editor** — customize all transactional emails (subject, HTML body, plain text) with live preview and variable substitution
- **Email job monitor** — view queue status, delivery results, and error details for every outbound email
- **Presenter export** — download a CSV of confirmed presenters for event logistics
- **Conference settings** — name, location, dates, sending address, and email preview variables
- **Full data reset** with OTP confirmation (clears all submissions, reviews, sessions, users, and R2 files)
- **Audit log** — complete history of all admin actions and status overrides

### Public

- **Conference program page** — browse sessions, schedule, and presenter information without an account

---

## Submission Workflow

```
draft → submitted → under_review → decided → assigned_to_session → notified → confirmed → files_submitted
                                                                              notified → withdrawn
```

Admins can force any transition at any time; all overrides are recorded in the audit log.

---

## Roles

| Role | Access |
|------|--------|
| `submitter` | Own abstracts only — create, edit, confirm, withdraw, upload files |
| `reviewer` | Assigned abstracts — view, download, submit reviews |
| `program_chair` | All reviews, session and slot management |
| `admin` | Everything — users, deadlines, bulk notify, status overrides, settings |

---

## Account Recovery

- **Forgot username** — enter email to receive a list of all associated usernames
- **Forgot password** — enter username to receive a one-hour password reset link

---

## Email Notifications

All emails are sent via **AWS SES** and are fully customizable in the admin panel:

| Template | Trigger |
|----------|---------|
| Email verification | On registration |
| Submission confirmation | On submit |
| Review assignment | When a reviewer is assigned |
| Decision — accepted | On bulk notify |
| Decision — rejected | On bulk notify |
| Confirmation reminder | On bulk notify |
| File submission reminder | On bulk notify |
| Username reminder | On forgot username request |
| Password reset | On forgot password request |
| Admin reset OTP | On database reset request |

---

## Setup

```bash
cp .env.example .env   # fill in secrets
make install
make migrate
make dev
```

See `.env.example` for all required environment variables.
