/**
 * Source and licence registry. Every ingested record points at one of these sources.
 * access_status is updated by the network check at the start of each run.
 */
export const OAK_ATTRIBUTION = (subject: string) =>
  `A ${subject} lesson by Oak National Academy licensed under Open Government Licence (OGL)`;
export const OGL_ATTRIBUTION = "Contains public sector information licensed under the Open Government Licence v3.0.";

export const LICENCES = [
  {
    id: "OGL-3.0",
    name: "Open Government Licence v3.0",
    url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution_template: OGL_ATTRIBUTION,
    allows_commercial: 1,
    allows_derivatives: 1,
    notes: "Does not cover third-party rights, logos or personal data. Attribution required.",
  },
  {
    id: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution_template: "Licensed under CC BY 4.0",
    allows_commercial: 1,
    allows_derivatives: 1,
    notes: null,
  },
  {
    id: "CC0-1.0",
    name: "Creative Commons Zero 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution_template: null,
    allows_commercial: 1,
    allows_derivatives: 1,
    notes: "Public domain dedication; attribution appreciated but not required.",
  },
  {
    id: "MIT",
    name: "MIT Licence (code only)",
    url: "https://opensource.org/license/mit",
    attribution_template: null,
    allows_commercial: 1,
    allows_derivatives: 1,
    notes: "Applies to source code, not curriculum content.",
  },
  {
    id: "ORIGINAL",
    name: "Original Eduworks content",
    url: null,
    attribution_template: "Original practice content created for this platform.",
    allows_commercial: 1,
    allows_derivatives: 1,
    notes: "Generated or written for the platform; no third-party rights.",
  },
  {
    id: "CROWN-THIRD-PARTY",
    name: "Third-party material inside Crown publications (not covered by OGL)",
    url: null,
    attribution_template: null,
    allows_commercial: 0,
    allows_derivatives: 0,
    notes: "Listed in STA copyright reports. Must not be shown to students or printed without permission.",
  },
];

export interface SourceDef {
  id: string;
  name: string;
  publisher: string;
  home_url: string;
  licence_id: string;
  licence_evidence: string;
  licence_evidence_url: string;
  kind: string;
  attribution_text: string;
  probe_url: string;
}

export const SOURCES: SourceDef[] = [
  {
    id: "oak_ontology",
    name: "Oak Curriculum Ontology (National Curriculum 2014 + Oak programmes, units, lessons)",
    publisher: "Oak National Academy",
    home_url: "https://github.com/oaknational/oak-curriculum-ontology",
    licence_id: "OGL-3.0",
    licence_evidence:
      "DATA-LICENSE.md: \"This work is made available under the Open Government Licence v3.0.\" README: \"This repository contains public sector information licensed under the Open Government Licence v3.0.\"",
    licence_evidence_url: "https://github.com/oaknational/oak-curriculum-ontology/blob/main/DATA-LICENSE.md",
    kind: "taxonomy+lessons",
    attribution_text: `${OGL_ATTRIBUTION} National Curriculum in England (2014), Department for Education, as structured in the Oak Curriculum Ontology by Oak National Academy.`,
    probe_url: "https://raw.githubusercontent.com/oaknational/oak-curriculum-ontology/main/DATA-LICENSE.md",
  },
  {
    id: "oak_graphs",
    name: "Oak curriculum graphs (unit-to-National-Curriculum mapping, lesson/misconception/keyword graph)",
    publisher: "Oak National Academy",
    home_url: "https://github.com/oaknational/oak-mcp-ecosystem",
    licence_id: "OGL-3.0",
    licence_evidence:
      "LICENCE-DATA.md: \"curriculum lesson content provided via the API is made available under the Open Government Licence v3.0 (except where otherwise stated)\". Graphs are generated from the Oak bulk download (sourceVersion recorded per file).",
    licence_evidence_url: "https://github.com/oaknational/oak-mcp-ecosystem/blob/main/LICENCE-DATA.md",
    kind: "mapping",
    attribution_text: "Curriculum mapping by Oak National Academy licensed under Open Government Licence (OGL).",
    probe_url: "https://raw.githubusercontent.com/oaknational/oak-mcp-ecosystem/main/LICENCE-DATA.md",
  },
  {
    id: "oak_api",
    name: "Oak National Academy Open Curriculum API (quizzes, transcripts, assets)",
    publisher: "Oak National Academy",
    home_url: "https://open-api.thenational.academy/",
    licence_id: "OGL-3.0",
    licence_evidence:
      "Oak API terms: lesson content made available under OGL v3.0 except where otherwise stated; some lessons are flagged as containing third-party copyright (check-restricted endpoints).",
    licence_evidence_url: "https://open-api.thenational.academy/docs/about-oaks-api/terms",
    kind: "lessons+questions",
    attribution_text: "A {subject} lesson by Oak National Academy licensed under Open Government Licence (OGL)",
    probe_url: "https://open-api.thenational.academy/api/v0/key-stages",
  },
  {
    id: "nc_govuk",
    name: "National curriculum in England: programmes of study (KS1-4)",
    publisher: "Department for Education",
    home_url: "https://www.gov.uk/government/collections/national-curriculum",
    licence_id: "OGL-3.0",
    licence_evidence:
      "gov.uk publication pages: \"This publication is licensed under the terms of the Open Government Licence v3.0 except where otherwise stated.\"",
    licence_evidence_url: "https://www.gov.uk/government/collections/national-curriculum",
    kind: "taxonomy",
    attribution_text: `${OGL_ATTRIBUTION} National curriculum in England, Department for Education.`,
    probe_url: "https://www.gov.uk/api/content/government/collections/national-curriculum",
  },
  {
    id: "dfe_subject_content",
    name: "DfE GCSE and A level subject content",
    publisher: "Department for Education",
    home_url: "https://www.gov.uk/government/collections/gcse-subject-content",
    licence_id: "OGL-3.0",
    licence_evidence: "gov.uk publication pages carry the standard OGL v3.0 statement.",
    licence_evidence_url: "https://www.gov.uk/government/collections/gcse-subject-content",
    kind: "taxonomy",
    attribution_text: `${OGL_ATTRIBUTION} GCSE / A level subject content, Department for Education.`,
    probe_url: "https://www.gov.uk/api/content/government/collections/gcse-subject-content",
  },
  {
    id: "sta_ks2",
    name: "STA key stage 2 past test materials (2016 onwards)",
    publisher: "Standards and Testing Agency",
    home_url: "https://www.gov.uk/government/collections/national-curriculum-assessments-past-test-materials",
    licence_id: "OGL-3.0",
    licence_evidence:
      "STA test materials are Crown copyright and reusable under OGL v3.0 except third-party content listed in each year's copyright report.",
    licence_evidence_url: "https://www.gov.uk/government/collections/national-curriculum-assessments-past-test-materials",
    kind: "papers",
    attribution_text: `${OGL_ATTRIBUTION} Key stage 2 test materials, Standards and Testing Agency.`,
    probe_url: "https://www.gov.uk/api/content/government/collections/national-curriculum-assessments-past-test-materials",
  },
  {
    id: "sta_ks1",
    name: "STA key stage 1 past test materials",
    publisher: "Standards and Testing Agency",
    home_url: "https://www.gov.uk/government/collections/national-curriculum-assessments-past-test-materials",
    licence_id: "OGL-3.0",
    licence_evidence: "As STA KS2: OGL v3.0 except third-party content in copyright reports.",
    licence_evidence_url: "https://www.gov.uk/government/collections/national-curriculum-assessments-past-test-materials",
    kind: "papers",
    attribution_text: `${OGL_ATTRIBUTION} Key stage 1 test materials, Standards and Testing Agency.`,
    probe_url: "https://assets.publishing.service.gov.uk/",
  },
  {
    id: "sta_phonics",
    name: "Year 1 phonics screening check materials (2012 onwards)",
    publisher: "Standards and Testing Agency",
    home_url: "https://www.gov.uk/government/collections/phonics",
    licence_id: "OGL-3.0",
    licence_evidence: "Crown copyright, OGL v3.0 (standard gov.uk statement).",
    licence_evidence_url: "https://www.gov.uk/government/collections/phonics",
    kind: "assessment",
    attribution_text: `${OGL_ATTRIBUTION} Phonics screening check, Standards and Testing Agency.`,
    probe_url: "https://www.gov.uk/api/content/government/collections/phonics",
  },
  {
    id: "sta_mtc",
    name: "Multiplication tables check administration guidance",
    publisher: "Standards and Testing Agency",
    home_url: "https://www.gov.uk/government/collections/multiplication-tables-check",
    licence_id: "OGL-3.0",
    licence_evidence: "Crown copyright, OGL v3.0 (standard gov.uk statement).",
    licence_evidence_url: "https://www.gov.uk/government/collections/multiplication-tables-check",
    kind: "assessment",
    attribution_text: `${OGL_ATTRIBUTION} Multiplication tables check guidance, Standards and Testing Agency.`,
    probe_url: "https://www.gov.uk/api/content/government/collections/multiplication-tables-check",
  },
  {
    id: "national_archives",
    name: "The National Archives (OGL text, archived DfE publications)",
    publisher: "The National Archives",
    home_url: "https://www.nationalarchives.gov.uk/",
    licence_id: "OGL-3.0",
    licence_evidence: "Publisher of the Open Government Licence.",
    licence_evidence_url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    kind: "reference",
    attribution_text: OGL_ATTRIBUTION,
    probe_url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  },
  {
    id: "eduworks_original",
    name: "Eduworks original practice content (generated from rules and open data)",
    publisher: "Eduworks",
    home_url: "https://github.com/Kojixai/Eduworks",
    licence_id: "ORIGINAL",
    licence_evidence: "Created by this project's generators; answers computed, never transcribed.",
    licence_evidence_url: "https://github.com/Kojixai/Eduworks",
    kind: "questions",
    attribution_text: "Original practice content.",
    probe_url: "",
  },
];

export const KEY_STAGES = [
  { id: "ks1", name: "Key Stage 1", phase: "primary", age_range: "5-7", sort: 1, content_policy: null },
  { id: "ks2", name: "Key Stage 2", phase: "primary", age_range: "7-11", sort: 2, content_policy: null },
  { id: "ks3", name: "Key Stage 3", phase: "secondary", age_range: "11-14", sort: 3, content_policy: null },
  { id: "ks4", name: "Key Stage 4", phase: "secondary", age_range: "14-16", sort: 4, content_policy: null },
  {
    id: "ks5",
    name: "Key Stage 5",
    phase: "post16",
    age_range: "16-18",
    sort: 5,
    content_policy:
      "STRUCTURE ONLY. KS5 holds the DfE A level subject content taxonomy. No questions are harvested; every KS5 question, explanation and example must be original.",
  },
];

export const YEAR_GROUPS = [
  ["y1", "ks1", "Year 1"],
  ["y2", "ks1", "Year 2"],
  ["y3", "ks2", "Year 3"],
  ["y4", "ks2", "Year 4"],
  ["y5", "ks2", "Year 5"],
  ["y6", "ks2", "Year 6"],
  ["y7", "ks3", "Year 7"],
  ["y8", "ks3", "Year 8"],
  ["y9", "ks3", "Year 9"],
  ["y10", "ks4", "Year 10"],
  ["y11", "ks4", "Year 11"],
  ["y12", "ks5", "Year 12"],
  ["y13", "ks5", "Year 13"],
].map(([id, ks, name], i) => ({ id, key_stage_id: ks, name, sort: i + 1 }));

export const SUBJECTS = [
  ["mathematics", "Maths", "all", 1, null],
  ["english", "English", "all", 2, null],
  ["science", "Science", "all", 3, null],
  ["biology", "Biology", "secondary", 4, "science"],
  ["chemistry", "Chemistry", "secondary", 5, "science"],
  ["physics", "Physics", "secondary", 6, "science"],
  ["computing", "Computing", "all", 7, null],
  ["geography", "Geography", "all", 8, null],
  ["history", "History", "all", 9, null],
  ["languages", "Languages", "all", 10, null],
  ["french", "French", "all", 11, "languages"],
  ["german", "German", "all", 12, "languages"],
  ["spanish", "Spanish", "all", 13, "languages"],
  ["art-and-design", "Art and design", "all", 14, null],
  ["design-and-technology", "Design and technology", "all", 15, null],
  ["cooking-and-nutrition", "Cooking and nutrition", "all", 16, "design-and-technology"],
  ["music", "Music", "all", 17, null],
  ["physical-education", "Physical education", "all", 18, null],
  ["citizenship", "Citizenship", "secondary", 19, null],
  ["religious-education", "Religious education", "all", 20, null],
  ["rshe-pshe", "RSHE and PSHE", "all", 21, null],
].map(([id, name, phase, sort, parent]) => ({ id, name, phase, sort, parent_id: parent }));

export const DIFFICULTY = [
  { id: "d1", label: "Warm-up", sort: 1 },
  { id: "d2", label: "Core", sort: 2 },
  { id: "d3", label: "Stretch", sort: 3 },
  { id: "d4", label: "Challenge", sort: 4 },
];

/** Oak API / graph subject slugs -> platform subject ids. */
export const OAK_SUBJECT_MAP: Record<string, string> = {
  maths: "mathematics",
  english: "english",
  science: "science",
  "combined-science": "science",
  biology: "biology",
  chemistry: "chemistry",
  physics: "physics",
  art: "art-and-design",
  computing: "computing",
  "computing-non-gcse": "computing",
  "cooking-nutrition": "cooking-and-nutrition",
  "design-technology": "design-and-technology",
  french: "french",
  german: "german",
  spanish: "spanish",
  geography: "geography",
  history: "history",
  music: "music",
  "physical-education": "physical-education",
  "rshe-pshe": "rshe-pshe",
  citizenship: "citizenship",
  "religious-education": "religious-education",
};

export function subjectName(id: string): string {
  return (SUBJECTS.find((s) => s.id === id)?.name as string) ?? id;
}
