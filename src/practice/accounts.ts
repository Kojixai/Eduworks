// Account rules shared by redemption, the learner screens and the avatar picker.
export const AVATARS: { id: string; label: string; bg: string; fg: string }[] = [
  { id: "sky", label: "Sky blue", bg: "#D6E6F7", fg: "#173F73" },
  { id: "leaf", label: "Leaf green", bg: "#D7EDD9", fg: "#1D5B2A" },
  { id: "sun", label: "Sunshine", bg: "#FBEBC2", fg: "#6B4A00" },
  { id: "berry", label: "Berry", bg: "#F2D9E8", fg: "#7A1F55" },
  { id: "plum", label: "Plum", bg: "#E5DDF4", fg: "#4B2E83" },
  { id: "coral", label: "Coral", bg: "#F9DDD5", fg: "#8A2E14" },
];
export const avatarFor = (id?: string | null) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

/** Books a student (13+) may unlock on their own. KS1 and KS2 books need a parent or guardian account. */
export function studentMayUnlock(keyStage: string | undefined | null): boolean {
  const k = (keyStage ?? "").toUpperCase();
  return k === "KS3" || k === "KS4";
}
