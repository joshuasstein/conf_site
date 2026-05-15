"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE user_role AS ENUM ('submitter', 'reviewer', 'program_chair', 'admin');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE submission_status AS ENUM (
                'draft', 'submitted', 'under_review', 'decided',
                'assigned_to_session', 'notified', 'confirmed',
                'files_submitted', 'withdrawn'
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE submission_type_preference AS ENUM ('oral', 'poster', 'either');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE file_type AS ENUM ('abstract_document', 'final_presentation', 'final_poster');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE review_recommendation AS ENUM ('oral', 'poster', 'reject');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE decision_outcome AS ENUM ('oral', 'poster', 'rejected');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE session_type AS ENUM ('oral', 'poster', 'keynote', 'workshop');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
            CREATE TYPE email_job_status AS ENUM ('pending', 'sent', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS users (
            id          UUID PRIMARY KEY,
            email       VARCHAR(320) NOT NULL,
            full_name   VARCHAR(255) NOT NULL,
            institution VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            role        user_role NOT NULL DEFAULT 'submitter',
            email_verified BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

        CREATE TABLE IF NOT EXISTS submissions (
            id                        UUID PRIMARY KEY,
            title                     VARCHAR(500) NOT NULL,
            abstract_text             TEXT NOT NULL,
            presenting_author_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            co_authors                JSON NOT NULL DEFAULT '[]',
            keywords                  JSON NOT NULL DEFAULT '[]',
            track                     VARCHAR(100),
            status                    submission_status NOT NULL DEFAULT 'draft',
            submission_type_preference submission_type_preference NOT NULL DEFAULT 'either',
            submitted_at              TIMESTAMPTZ,
            updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_submissions_presenting_author_id ON submissions (presenting_author_id);

        CREATE TABLE IF NOT EXISTS attachments (
            id                UUID PRIMARY KEY,
            submission_id     UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            file_type         file_type NOT NULL,
            storage_key       VARCHAR(1024) NOT NULL,
            original_filename VARCHAR(500) NOT NULL,
            mime_type         VARCHAR(100) NOT NULL,
            size_bytes        BIGINT NOT NULL,
            uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            uploaded_by_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS ix_attachments_submission_id ON attachments (submission_id);

        CREATE TABLE IF NOT EXISTS reviews (
            id               UUID PRIMARY KEY,
            submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            reviewer_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            score            INTEGER CHECK (score >= 1 AND score <= 5),
            recommendation   review_recommendation,
            comments         TEXT,
            comments_for_author TEXT,
            submitted_at     TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_review_submission_reviewer UNIQUE (submission_id, reviewer_id)
        );
        CREATE INDEX IF NOT EXISTS ix_reviews_submission_id ON reviews (submission_id);
        CREATE INDEX IF NOT EXISTS ix_reviews_reviewer_id ON reviews (reviewer_id);

        CREATE TABLE IF NOT EXISTS decisions (
            id                    UUID PRIMARY KEY,
            submission_id         UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            outcome               decision_outcome NOT NULL,
            decided_by_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            decided_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            notification_sent_at  TIMESTAMPTZ,
            CONSTRAINT uq_decision_submission UNIQUE (submission_id)
        );
        CREATE INDEX IF NOT EXISTS ix_decisions_submission_id ON decisions (submission_id);

        CREATE TABLE IF NOT EXISTS sessions (
            id            UUID PRIMARY KEY,
            title         VARCHAR(500) NOT NULL,
            description   TEXT,
            session_type  session_type NOT NULL,
            session_date  DATE NOT NULL,
            start_time    TIME NOT NULL,
            end_time      TIME NOT NULL,
            room          VARCHAR(100),
            chair_name    VARCHAR(255),
            max_slots     INTEGER NOT NULL,
            is_published  BOOLEAN NOT NULL DEFAULT FALSE,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS session_slots (
            id               UUID PRIMARY KEY,
            session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            slot_order       INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_slot_submission UNIQUE (submission_id)
        );
        CREATE INDEX IF NOT EXISTS ix_session_slots_session_id ON session_slots (session_id);
        CREATE INDEX IF NOT EXISTS ix_session_slots_submission_id ON session_slots (submission_id);

        CREATE TABLE IF NOT EXISTS audit_logs (
            id          UUID PRIMARY KEY,
            actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            action      VARCHAR(100) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_id   UUID NOT NULL,
            detail      JSON NOT NULL DEFAULT '{}',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_audit_logs_actor_id ON audit_logs (actor_id);
        CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action);
        CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at);

        CREATE TABLE IF NOT EXISTS email_jobs (
            id               UUID PRIMARY KEY,
            recipient_email  VARCHAR(320) NOT NULL,
            recipient_name   VARCHAR(255) NOT NULL,
            template_alias   VARCHAR(100) NOT NULL,
            template_model   JSON NOT NULL DEFAULT '{}',
            status           email_job_status NOT NULL DEFAULT 'pending',
            error_message    TEXT,
            retry_count      INTEGER NOT NULL DEFAULT 0,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_at          TIMESTAMPTZ,
            created_by_id    UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS ix_email_jobs_status ON email_jobs (status);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS email_jobs;
        DROP TABLE IF EXISTS audit_logs;
        DROP TABLE IF EXISTS session_slots;
        DROP TABLE IF EXISTS sessions;
        DROP TABLE IF EXISTS decisions;
        DROP TABLE IF EXISTS reviews;
        DROP TABLE IF EXISTS attachments;
        DROP TABLE IF EXISTS submissions;
        DROP TABLE IF EXISTS users;
        DROP TYPE IF EXISTS email_job_status;
        DROP TYPE IF EXISTS session_type;
        DROP TYPE IF EXISTS decision_outcome;
        DROP TYPE IF EXISTS review_recommendation;
        DROP TYPE IF EXISTS file_type;
        DROP TYPE IF EXISTS submission_type_preference;
        DROP TYPE IF EXISTS submission_status;
        DROP TYPE IF EXISTS user_role;
    """)
