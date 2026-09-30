/**
 * Phonics screening check practice.
 * Official word lists are ingested by ingest/sources/sta_phonics.ts once gov.uk is reachable.
 * Until then the platform ships original practice sets written to the check's format:
 * 40 words in two sections of 20, each section mixing real words and pseudo-words
 * (pseudo-words are shown with an alien so children know they are not real words).
 * Section 1 uses simple structures and Phase 2-3 grapheme-phoneme correspondences;
 * section 2 adds adjacent consonants and Phase 5 alternative spellings.
 */
export const PHONICS_WORDS_PER_CHECK = 40;
/** Threshold used since the check began in 2012; verified per year by the STA ingester. */
export const PHONICS_DEFAULT_THRESHOLD = 32;

export interface PracticeSet {
  name: string;
  section1: { pseudo: string[]; real: string[] };
  section2: { pseudo: string[]; real: string[] };
}

export const ORIGINAL_PRACTICE_SETS: PracticeSet[] = [
  {
    name: "Practice set A (original)",
    section1: {
      pseudo: ["tib", "vap", "fip", "nuv", "kem", "chab", "shev", "thop", "voin", "jick"],
      real: ["chip", "then", "rain", "boot", "farm", "fork", "moon", "coin", "hurt", "sheep"],
    },
    section2: {
      pseudo: ["blorn", "strom", "clape", "vunt", "sproy", "twerb", "glaim", "frosk", "drube", "snurk"],
      real: ["frost", "crisp", "stamp", "train", "spring", "cake", "slide", "phone", "cloud", "shirt"],
    },
  },
  {
    name: "Practice set B (original)",
    section1: {
      pseudo: ["dut", "mub", "ruv", "jarn", "heek", "quog", "thib", "yeg", "loib", "zerm"],
      real: ["ship", "thin", "wait", "food", "park", "corn", "turn", "boil", "hear", "fair"],
    },
    section2: {
      pseudo: ["plib", "skern", "grode", "stuv", "clorp", "snoy", "trisk", "prawm", "dwoop", "glibe"],
      real: ["storm", "plant", "crust", "float", "shrink", "stripe", "drove", "glue", "chew", "spray"],
    },
  },
  {
    name: "Practice set C (original)",
    section1: {
      pseudo: ["gep", "hux", "bim", "zoff", "cheg", "nurch", "vook", "poth", "laim", "feb"],
      real: ["much", "shed", "pain", "seem", "light", "coat", "cook", "sort", "burn", "now"],
    },
    section2: {
      pseudo: ["strib", "flemp", "snope", "grobe", "twaid", "blurch", "spoy", "frite", "drast", "glunt"],
      real: ["string", "blend", "scrap", "stroke", "cute", "these", "frown", "bright", "green", "sport"],
    },
  },
];

export interface PhonicsItem {
  section: 1 | 2;
  position: number;
  word: string;
  isPseudo: boolean;
}

/** Lays a set out in check order: in each section the pseudo-words come first, then real words. */
export function layoutSet(set: PracticeSet): PhonicsItem[] {
  const out: PhonicsItem[] = [];
  let pos = 1;
  for (const [section, s] of [
    [1, set.section1],
    [2, set.section2],
  ] as const) {
    for (const w of s.pseudo) out.push({ section, position: pos++, word: w, isPseudo: true });
    for (const w of s.real) out.push({ section, position: pos++, word: w, isPseudo: false });
  }
  return out;
}

export function phonicsOutcome(score: number, threshold = PHONICS_DEFAULT_THRESHOLD) {
  return {
    score,
    outOf: PHONICS_WORDS_PER_CHECK,
    threshold,
    metStandard: score >= threshold,
    wordsToThreshold: Math.max(0, threshold - score),
  };
}
