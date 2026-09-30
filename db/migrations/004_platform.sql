-- 004 Platform: books, codes, accounts, children, attempts, progress, admin audit.

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  key_stage_id TEXT REFERENCES key_stages(id),
  subject_id TEXT REFERENCES subjects(id),
  year_group_id TEXT REFERENCES year_groups(id),
  isbn TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- One redeemable code per book title, printed inside the book.
CREATE TABLE IF NOT EXISTS book_codes (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,           -- random token (hashed)
  parent_id TEXT NOT NULL REFERENCES parents(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  book_code_id TEXT NOT NULL REFERENCES book_codes(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  parent_id TEXT NOT NULL REFERENCES parents(id),
  parent_name TEXT NOT NULL,
  email TEXT NOT NULL,
  amazon_order_number TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TEXT NOT NULL,
  consent_timestamp TEXT,        -- set only when marketing_opt_in = 1
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_redemptions_parent ON redemptions(parent_id);

-- Children: first name only. No child email is ever stored.
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  first_name TEXT NOT NULL,
  year_group_id TEXT REFERENCES year_groups(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL,            -- quiz | paper | phonics | mtc
  ref_id TEXT,                   -- lesson id, paper id, phonics set, 'mtc'
  title TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  score REAL,
  max_score REAL,
  duration_seconds INTEGER,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_attempts_student ON attempts(student_id, started_at);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  question_id TEXT,
  item_label TEXT,               -- phonics word / mtc fact when there is no question row
  response_json TEXT,
  marks_awarded REAL NOT NULL,
  max_marks REAL NOT NULL,
  correct INTEGER NOT NULL,
  self_marked INTEGER NOT NULL DEFAULT 0,
  statement_ids_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_results_attempt ON results(attempt_id);

CREATE TABLE IF NOT EXISTS topic_progress (
  student_id TEXT NOT NULL REFERENCES students(id),
  topic_key TEXT NOT NULL,       -- statement id, or 'unit:<id>', 'paper:<id>'
  topic_kind TEXT NOT NULL,      -- statement | unit | paper | lesson
  attempts INTEGER NOT NULL DEFAULT 0,
  marks REAL NOT NULL DEFAULT 0,
  max_marks REAL NOT NULL DEFAULT 0,
  last_at TEXT,
  PRIMARY KEY (student_id, topic_key)
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
