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
