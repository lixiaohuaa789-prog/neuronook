type SubjectTheme = {
  accent: string;
  soft: string;
};

const PALETTE: SubjectTheme[] = [
  { accent: "#78946e", soft: "rgba(120, 148, 110, 0.12)" },
  { accent: "#97a375", soft: "rgba(151, 163, 117, 0.12)" },
  { accent: "#b19c7d", soft: "rgba(177, 156, 125, 0.12)" },
  { accent: "#9b6b5c", soft: "rgba(155, 107, 92, 0.12)" },
  { accent: "#8b7d54", soft: "rgba(139, 125, 84, 0.12)" },
];

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getSubjectTheme(subject: string): SubjectTheme {
  const safe = (subject ?? "").trim() || "未分类";
  const idx = hashString(safe) % PALETTE.length;
  return PALETTE[idx];
}

