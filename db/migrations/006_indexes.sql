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
