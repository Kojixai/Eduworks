-- Eduworks schema for Supabase/PostgreSQL. Paste into the Supabase SQL editor and run once.
-- Generated from db/migrations by scripts/supabase-push.ts. Safe to re-run.

-- ===== 001_registry.sql =====
-- 001 Registry: licences, sources, raw files, ingest runs and logs.
-- Portable SQL: runs unchanged on SQLite 3.35+ and PostgreSQL 13+.
-- Conventions: TEXT ids, INTEGER 0/1 booleans, ISO-8601 TEXT timestamps, JSON stored as TEXT.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  attribution_template TEXT,
  allows_commercial INTEGER NOT NULL DEFAULT 1,
  allows_derivatives INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  publisher TEXT,
  home_url TEXT,
  licence_id TEXT REFERENCES licences(id),
  licence_evidence TEXT,
  licence_evidence_url TEXT,
  access_status TEXT NOT NULL DEFAULT 'unknown',
  access_notes TEXT,
  kind TEXT,
  attribution_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_files (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  local_path TEXT,
  checksum_sha256 TEXT,
  bytes INTEGER,
  content_type TEXT,
  retrieved_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_raw_files_source ON raw_files(source_id);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  stats_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS ix_ingest_runs_source ON ingest_runs(source_id);

CREATE TABLE IF NOT EXISTS ingest_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES ingest_runs(id),
  source_id TEXT,
  level TEXT NOT NULL,
  code TEXT,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ingest_logs_run ON ingest_logs(run_id);
CREATE INDEX IF NOT EXISTS ix_ingest_logs_level ON ingest_logs(level);

CREATE TABLE IF NOT EXISTS ingest_checkpoints (
  source_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, key)
);

-- ===== 002_curriculum.sql =====
-- 002 Curriculum taxonomy and teaching content.
-- Every content table carries the provenance block:
--   source_id, source_url, licence_id, attribution_text, retrieved_at, third_party_flag, checksum

CREATE TABLE IF NOT EXISTS key_stages (
  id TEXT PRIMARY KEY,           -- ks1..ks5, eyfs
  name TEXT NOT NULL,
  phase TEXT NOT NULL,           -- primary | secondary | post16
  age_range TEXT,
  sort INTEGER NOT NULL,
  content_policy TEXT            -- e.g. KS5: structure only, all questions must be original
);

CREATE TABLE IF NOT EXISTS year_groups (
  id TEXT PRIMARY KEY,           -- y1..y13
  key_stage_id TEXT NOT NULL REFERENCES key_stages(id),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,           -- slug, e.g. mathematics
  name TEXT NOT NULL,
  phase TEXT,                    -- primary | secondary | all
  sort INTEGER NOT NULL DEFAULT 100,
  parent_id TEXT                 -- e.g. biology -> science
);

CREATE TABLE IF NOT EXISTS curriculum_statements (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  key_stage_id TEXT REFERENCES key_stages(id),
  year_group_id TEXT REFERENCES year_groups(id),   -- set when the statement belongs to exactly one year
  year_groups_json TEXT,                           -- all year groups the statement is taught in
  level TEXT NOT NULL,           -- discipline | strand | substrand | statement | sub_statement | aim | content_area
  strand TEXT,
  sub_strand TEXT,
  parent_id TEXT,
  ref TEXT,                      -- the statement's own reference (e.g. NC URI slug or DfE paragraph ref)
  text TEXT NOT NULL,
  statutory INTEGER NOT NULL DEFAULT 1,
  framework TEXT NOT NULL,       -- nc2014 | gcse_content | alevel_content | sta_ks2_framework | ...
  sort INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_cs_subject_ks ON curriculum_statements(subject_id, key_stage_id);
CREATE INDEX IF NOT EXISTS ix_cs_parent ON curriculum_statements(parent_id);
CREATE INDEX IF NOT EXISTS ix_cs_level ON curriculum_statements(level);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  key_stage_id TEXT REFERENCES key_stages(id),
  year_group_id TEXT REFERENCES year_groups(id),
  slug TEXT,
  title TEXT NOT NULL,
  description TEXT,
  why_this_why_now TEXT,
  prior_knowledge_json TEXT,
  threads_json TEXT,
  exam_board TEXT,
  tier TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  external_url TEXT,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_units_subject ON units(subject_id, key_stage_id, year_group_id);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  unit_id TEXT REFERENCES units(id),
  slug TEXT,
  title TEXT NOT NULL,
  pupil_outcome TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  external_url TEXT,
  has_quiz INTEGER NOT NULL DEFAULT 0,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_lessons_unit ON lessons(unit_id);

-- A lesson can appear in more than one unit (Oak unit variants, exam-board options).
CREATE TABLE IF NOT EXISTS unit_lessons (
  unit_id TEXT NOT NULL REFERENCES units(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (unit_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id),
  unit_id TEXT REFERENCES units(id),
  kind TEXT NOT NULL,            -- explainer | key_learning_point | keyword | misconception | worked_example | teacher_tip | transcript | prior_knowledge
  title TEXT,
  body TEXT NOT NULL,
  extra_json TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_cb_lesson ON content_blocks(lesson_id, kind);
CREATE INDEX IF NOT EXISTS ix_cb_unit ON content_blocks(unit_id, kind);

CREATE TABLE IF NOT EXISTS unit_statement_links (
  unit_id TEXT NOT NULL REFERENCES units(id),
  statement_id TEXT NOT NULL REFERENCES curriculum_statements(id),
  method TEXT NOT NULL,          -- oak_mapping | reasoned
  confidence REAL NOT NULL,
  review_status TEXT NOT NULL,   -- auto_ok | needs_review | rejected
  PRIMARY KEY (unit_id, statement_id)
);

CREATE TABLE IF NOT EXISTS lesson_statement_links (
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  statement_id TEXT NOT NULL REFERENCES curriculum_statements(id),
  method TEXT NOT NULL,
  confidence REAL NOT NULL,
  review_status TEXT NOT NULL,
  PRIMARY KEY (lesson_id, statement_id)
);

-- ===== 003_questions.sql =====
-- 003 Papers, questions, answers, mark schemes, assessment-specific tables.

CREATE TABLE IF NOT EXISTS difficulty (
  id TEXT PRIMARY KEY,           -- d1..d5
  label TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT                      -- topic | skill | origin | paper_section
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  key_stage_id TEXT REFERENCES key_stages(id),
  subject_id TEXT REFERENCES subjects(id),
  year INTEGER,
  name TEXT NOT NULL,
  paper_code TEXT,               -- e.g. maths-p1-arithmetic
  kind TEXT NOT NULL,            -- official | original_practice
  total_marks INTEGER,
  time_allowed_minutes INTEGER,
  question_count INTEGER,
  paper_url TEXT,
  mark_scheme_url TEXT,
  copyright_report_url TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',   -- pending | passed | failed
  validation_json TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review',
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id),
  lesson_id TEXT REFERENCES lessons(id),
  quiz_kind TEXT NOT NULL,       -- paper | starter | exit | oak_question_bank | derived | generated
  qtype TEXT NOT NULL,           -- mcq | multi_select | numeric | text_exact | ordering | matching | table_fill | self_mark
  number TEXT,                   -- source question number, e.g. "12" or "12b"
  sort INTEGER NOT NULL DEFAULT 0,
  marks INTEGER NOT NULL DEFAULT 1,
  time_hint_seconds INTEGER,
  prompt_text TEXT NOT NULL,
  prompt_images_json TEXT,       -- [{path, alt, crop:{page,x,y,w,h}}]
  prompt_extra_json TEXT,        -- table_fill grid, matching pairs layout, units, etc.
  explanation TEXT,
  subject_id TEXT REFERENCES subjects(id),
  key_stage_id TEXT REFERENCES key_stages(id),
  year_group_id TEXT REFERENCES year_groups(id),
  difficulty_id TEXT REFERENCES difficulty(id),
  content_domain_ref TEXT,       -- STA content domain reference, e.g. 6F10
  extraction_confidence REAL NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'needs_review',  -- auto_ok | needs_review | rejected
  review_notes TEXT,
  reviewed_at TEXT,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_q_paper ON questions(paper_id);
CREATE INDEX IF NOT EXISTS ix_q_lesson ON questions(lesson_id);
CREATE INDEX IF NOT EXISTS ix_q_filters ON questions(key_stage_id, subject_id, qtype, review_status);

CREATE TABLE IF NOT EXISTS question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  label TEXT,                    -- A, B, C...
  text TEXT NOT NULL,
  image_path TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  match_key TEXT,                -- matching: options with the same match_key belong together (side L/R via side)
  side TEXT,                     -- matching: L | R
  correct_position INTEGER,      -- ordering: 1-based correct position
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_qo_q ON question_options(question_id);

CREATE TABLE IF NOT EXISTS accepted_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  part TEXT NOT NULL DEFAULT 'main',  -- table_fill cell id or answer part
  answer TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'exact', -- exact | numeric | fraction | regex
  tolerance REAL,
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  marks INTEGER                       -- marks for this part (table_fill / multi-part)
);
CREATE INDEX IF NOT EXISTS ix_aa_q ON accepted_answers(question_id);

CREATE TABLE IF NOT EXISTS mark_scheme_entries (
  id TEXT PRIMARY KEY,
  question_id TEXT REFERENCES questions(id),
  paper_id TEXT REFERENCES papers(id),
  number TEXT,
  marks INTEGER,
  answer_text TEXT NOT NULL,
  guidance TEXT,
  content_domain_ref TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_ms_q ON mark_scheme_entries(question_id);

CREATE TABLE IF NOT EXISTS question_statement_links (
  question_id TEXT NOT NULL REFERENCES questions(id),
  statement_id TEXT NOT NULL REFERENCES curriculum_statements(id),
  method TEXT NOT NULL,          -- sta_content_domain | oak_mapping | reasoned | generator
  confidence REAL NOT NULL,
  review_status TEXT NOT NULL,
  PRIMARY KEY (question_id, statement_id)
);

CREATE TABLE IF NOT EXISTS question_tags (
  question_id TEXT NOT NULL REFERENCES questions(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (question_id, tag_id)
);

-- Year 1 phonics screening check words (official lists once harvested).
CREATE TABLE IF NOT EXISTS phonics_words (
  id TEXT PRIMARY KEY,
  check_year INTEGER,            -- NULL for original practice sets
  set_name TEXT NOT NULL,        -- e.g. "2019 check", "practice set A (original)"
  section INTEGER NOT NULL,      -- 1 or 2
  position INTEGER NOT NULL,     -- 1..40
  word TEXT NOT NULL,
  is_pseudo INTEGER NOT NULL,
  gpc_focus TEXT,
  kind TEXT NOT NULL,            -- official | official_practice | original_practice
  review_status TEXT NOT NULL DEFAULT 'needs_review',
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);

-- Rules for statutory checks (phonics threshold per year, MTC administration rules...).
CREATE TABLE IF NOT EXISTS assessment_rules (
  id TEXT PRIMARY KEY,
  assessment TEXT NOT NULL,      -- phonics_check | mtc | ks2_sats | ks1_sats
  rule_key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',  -- verified | unverified
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id),
  question_id TEXT REFERENCES questions(id),
  paper_id TEXT REFERENCES papers(id),
  kind TEXT NOT NULL,            -- image | worksheet | worksheet_answers | slides | video | pdf | page_crop
  title TEXT,
  url TEXT,
  local_path TEXT,
  mime TEXT,
  source_id TEXT REFERENCES sources(id),
  source_url TEXT,
  licence_id TEXT,
  attribution_text TEXT,
  retrieved_at TEXT,
  third_party_flag INTEGER NOT NULL DEFAULT 0,
  checksum TEXT
);
CREATE INDEX IF NOT EXISTS ix_assets_lesson ON assets(lesson_id);

-- ===== 004_platform.sql =====
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

-- ===== 005_derived.sql =====
-- 005 Derived/materialised tables rebuilt by the linking + coverage step.

CREATE TABLE IF NOT EXISTS coverage_matrix (
  id TEXT PRIMARY KEY,           -- ks|subject|strand
  key_stage_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  strand TEXT NOT NULL,
  statement_count INTEGER NOT NULL,
  statements_with_lessons INTEGER NOT NULL,
  statements_with_questions INTEGER NOT NULL,
  lesson_count INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  public_question_count INTEGER NOT NULL,
  gap_count INTEGER NOT NULL,    -- statements with neither a lesson nor a question
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_stats (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

-- ===== 006_indexes.sql =====
-- 006 Lookup indexes used by the web app (reverse lookups on link tables).
CREATE INDEX IF NOT EXISTS ix_lsl_statement ON lesson_statement_links(statement_id);
CREATE INDEX IF NOT EXISTS ix_usl_statement ON unit_statement_links(statement_id);
CREATE INDEX IF NOT EXISTS ix_qsl_statement ON question_statement_links(statement_id);
CREATE INDEX IF NOT EXISTS ix_ul_lesson ON unit_lessons(lesson_id);
CREATE INDEX IF NOT EXISTS ix_q_kind ON questions(quiz_kind, review_status);
CREATE INDEX IF NOT EXISTS ix_q_source ON questions(source_id);
CREATE INDEX IF NOT EXISTS ix_students_parent ON students(parent_id);
CREATE INDEX IF NOT EXISTS ix_results_question ON results(question_id);
CREATE INDEX IF NOT EXISTS ix_papers_ks ON papers(key_stage_id, subject_id);
CREATE INDEX IF NOT EXISTS ix_phonics_set ON phonics_words(set_name);


-- Record applied migrations
INSERT INTO schema_migrations (id, applied_at) VALUES ('001_registry.sql', now()::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id, applied_at) VALUES ('002_curriculum.sql', now()::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id, applied_at) VALUES ('003_questions.sql', now()::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id, applied_at) VALUES ('004_platform.sql', now()::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id, applied_at) VALUES ('005_derived.sql', now()::text) ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id, applied_at) VALUES ('006_indexes.sql', now()::text) ON CONFLICT (id) DO NOTHING;

-- Row level security on: only the server (service key) can read or write. The browser never talks to Supabase directly.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_statement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_statement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE accepted_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mark_scheme_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_statement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE phonics_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
