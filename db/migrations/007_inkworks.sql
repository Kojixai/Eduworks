-- 007 Inkworks companion: practice banks, access rules, practice progress.
-- Merges the Inkworks Companion rules (see docs/INKWORKS_MERGE_BRIEF.txt) into the platform tables.

-- ---------------------------------------------------------------- practice content (rebuilt from content/inkworks by scripts/import-inkworks.ts)
CREATE TABLE IF NOT EXISTS practice_books (
  id TEXT PRIMARY KEY,                 -- same id as books.id (y3maths, macbeth ...)
  title TEXT NOT NULL,
  key_stage TEXT NOT NULL,             -- KS1..KS4
  year_label TEXT,
  subject_label TEXT,
  pages INTEGER,
  age_range TEXT,
  sections_json TEXT NOT NULL,         -- [{id,name,colour}]
  sort INTEGER NOT NULL DEFAULT 0,
  unit_count INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT
);

CREATE TABLE IF NOT EXISTS practice_texts (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES practice_books(id),
  title TEXT NOT NULL,
  author TEXT,
  source TEXT,
  kind TEXT,
  lines_json TEXT NOT NULL,
  glossary_json TEXT
);

CREATE TABLE IF NOT EXISTS practice_units (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES practice_books(id),
  section_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  book_pages_json TEXT,
  curriculum_json TEXT,
  text_id TEXT REFERENCES practice_texts(id),
  sort INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  questions_json TEXT NOT NULL         -- validated question objects, exactly as in the bank
);
CREATE INDEX IF NOT EXISTS ix_practice_units_book ON practice_units(book_id, sort);

-- ---------------------------------------------------------------- accounts
ALTER TABLE parents ADD COLUMN account_type TEXT NOT NULL DEFAULT 'parent';   -- parent | student (13+, KS3/KS4 books only)
ALTER TABLE parents ADD COLUMN pin_hash TEXT;                                  -- 4-digit parent-area PIN (HMAC)
ALTER TABLE parents ADD COLUMN age_confirmed_at TEXT;
ALTER TABLE students ADD COLUMN avatar TEXT NOT NULL DEFAULT 'sky';

-- ---------------------------------------------------------------- access codes: hashed, per-title or per-copy
CREATE TABLE book_codes_new (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  code TEXT UNIQUE,                    -- plain text ONLY for demo codes; real codes are stored as code_hash
  code_hash TEXT UNIQUE,               -- HMAC-SHA256(CODE_PEPPER, normalised code)
  kind TEXT NOT NULL DEFAULT 'title',  -- title: shared by every copy | copy: unique per copy, one account
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  redeemed_by TEXT,
  redeemed_at TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO book_codes_new (id, book_id, code, kind, active, is_demo, created_at)
  SELECT id, book_id, code, 'title', active, is_demo, created_at FROM book_codes;
DROP TABLE book_codes;
ALTER TABLE book_codes_new RENAME TO book_codes;

-- ---------------------------------------------------------------- redemptions: order number optional + hashed, access expires
CREATE TABLE redemptions_new (
  id TEXT PRIMARY KEY,
  book_code_id TEXT NOT NULL REFERENCES book_codes(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  parent_id TEXT NOT NULL REFERENCES parents(id),
  parent_name TEXT NOT NULL,
  email TEXT NOT NULL,
  order_hash TEXT,                     -- HMAC of the Amazon order number, NULL if not given; cleared when access ends
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TEXT NOT NULL,
  consent_timestamp TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO redemptions_new (id, book_code_id, book_id, parent_id, parent_name, email, order_hash, marketing_opt_in, terms_accepted_at, consent_timestamp, expires_at, created_at)
  SELECT id, book_code_id, book_id, parent_id, parent_name, email, NULL, marketing_opt_in, terms_accepted_at, consent_timestamp,
         strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+6 months'), created_at FROM redemptions;
DROP TABLE redemptions;
ALTER TABLE redemptions_new RENAME TO redemptions;
CREATE INDEX IF NOT EXISTS ix_redemptions_parent ON redemptions(parent_id);
CREATE INDEX IF NOT EXISTS ix_redemptions_order ON redemptions(book_id, order_hash);

CREATE TABLE IF NOT EXISTS redeem_attempts (
  id TEXT PRIMARY KEY,
  email_hash TEXT,
  ip_hash TEXT,
  ok INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_redeem_attempts_ip ON redeem_attempts(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS ix_redeem_attempts_email ON redeem_attempts(email_hash, created_at);

-- Mailing list: separate, optional, adults only. History kept with the exact wording shown.
CREATE TABLE IF NOT EXISTS mailing_consent (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  consented INTEGER NOT NULL,
  wording_version TEXT NOT NULL,
  wording TEXT NOT NULL,
  source TEXT NOT NULL,                -- redeem | account
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mailing_parent ON mailing_consent(parent_id, created_at);

-- ---------------------------------------------------------------- practice progress (one session = one 10-question unit)
CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  book_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  correct_count INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  day TEXT NOT NULL,                   -- learner's local date YYYY-MM-DD
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_practice_sessions ON practice_sessions(student_id, unit_id, completed_at);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id),
  student_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  is_retry INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL,
  marks_awarded REAL NOT NULL,
  marks_available REAL NOT NULL,
  response_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_practice_attempts_student ON practice_attempts(student_id, unit_id);
