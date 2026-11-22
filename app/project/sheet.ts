// Character sheet fields and the mapping between a character file and the form (docs/0004-character-sheet.md).
import { type Character, type Field, parseCharacter, writeCharacter } from "./character.ts";

export const HEADER: { key: string; label: string }[] = [
  { key: "nickname", label: "Nickname" },
  { key: "gender", label: "Gender" },
  { key: "age", label: "Age" },
  { key: "height", label: "Height" },
  { key: "birthplace", label: "Place of birth" },
  { key: "nationality", label: "Nationality" },
  { key: "occupation", label: "Occupation" },
];

// Our own wording (decision 0004-1). Answers match by heading text, so rewording turns old answers into custom fields.
export const SECTIONS: { heading: string; questions: string[] }[] = [
  { heading: "Looks & build", questions: ["What do people notice first about them?", "How do they move and carry themselves?", "Any scars, tattoos or marks?"] },
  { heading: "Style & dress", questions: ["What do they wear on an ordinary day?", "What do their clothes say about them?", "What do they always carry?"] },
  { heading: "Speech & mannerisms", questions: ["How do they talk? Pace, volume, choice of words.", "Words or phrases they keep using", "What do they do when they are nervous?"] },
  { heading: "Early life & background", questions: ["Where and how did they grow up?", "What moment from childhood still shapes them?", "What did they learn, and from whom?"] },
  { heading: "Family & key relationships", questions: ["Who raised them, and how?", "Who do they trust most?", "Who have they lost or fallen out with?"] },
  { heading: "Personality", questions: ["Three words that describe them", "What makes them laugh?", "What makes them angry?", "How do others see them, and are they right?"] },
  { heading: "Psychology", questions: ["What do they believe about how the world works?", "What are they ashamed of?", "What do they tell themselves that is not true?"] },
  { heading: "Goals & fears", questions: ["What do they want most?", "What do they need, even if they do not know it?", "What are they most afraid of?", "What would they never do?"] },
  { heading: "Character arc", questions: ["How do they change from the first scene to the last?"] },
];

export type FormSection = { heading: string; text: string; questions: Field[]; custom: Field[] };
export type SheetValues = {
  /** All front matter, unknown keys included, in file order. */
  front: Record<string, string>;
  description: string;
  sections: FormSection[];
};

/** Known sections in our order, then sections the app does not know (kept, all fields custom). */
export function toForm(raw: string): SheetValues {
  const c = parseCharacter(raw);
  const front = { ...c.front };
  for (const { key } of HEADER) front[key] ??= "";
  const known = SECTIONS.map(({ heading, questions }): FormSection => {
    const found = c.sections.filter((s) => s.heading === heading);
    const fields = found.flatMap((s) => s.fields);
    return {
      heading,
      text: found.map((s) => s.text).filter(Boolean).join("\n\n"),
      questions: questions.map((q) => ({ heading: q, text: fields.find((f) => f.heading === q)?.text ?? "" })),
      custom: fields.filter((f) => !questions.includes(f.heading)),
    };
  });
  const names = SECTIONS.map((s) => s.heading);
  const other = c.sections.filter((s) => !names.includes(s.heading)).map((s) => ({ heading: s.heading, text: s.text, questions: [], custom: s.fields }));
  return { front, description: c.description, sections: [...known, ...other] };
}

export function fromForm(v: SheetValues): string {
  const c: Character = {
    front: v.front,
    description: v.description,
    sections: v.sections.map((s) => ({ heading: s.heading, text: s.text, fields: [...s.questions, ...s.custom] })),
  };
  return writeCharacter(c);
}

export const answered = (s: FormSection) => [...s.questions, ...s.custom].filter((f) => f.text.trim()).length;

/** Anything filled in besides the name. An empty sheet opens in Edit (decision 0004-7). */
export const hasContent = (v: SheetValues) =>
  !!v.description.trim() || Object.entries(v.front).some(([k, x]) => k !== "name" && x.trim()) || v.sections.some((s) => answered(s) > 0);
