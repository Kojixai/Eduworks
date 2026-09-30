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
