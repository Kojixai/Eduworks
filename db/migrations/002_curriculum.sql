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
