"use client";

// Character sheet form and read-only view (docs/0004-character-sheet.md decisions 1, 2, 3 and 7).
// Design: docs/design/project/character-edit.html and character-view.html.
import { useEffect, useRef, useState } from "react";
import { type Control, type UseFormRegister, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ChevronDown, CircleAlert, Eye, GripVertical, Pencil, Plus, X } from "lucide-react";
import { answered, fromForm, HEADER, hasContent, type FormSection, type SheetValues, toForm } from "./sheet";

export type Mode = "view" | "edit";

export const initialMode = (text: string): Mode => (hasContent(toForm(text)) ? "view" : "edit");

const SCRIPT_FONT = "font-[family-name:var(--font-script)]";
const CARD = "rounded-xl border border-[#E4E4E2] bg-white shadow-[0_1px_2px_rgba(16,16,20,0.04)]";
const INPUT = "w-full rounded-lg border border-[#E4E4E2] bg-white px-3 py-2 text-sm leading-[22px] text-zinc-900";
const TEXTAREA = `${INPUT} field-sizing-content min-h-[62px] resize-y`;

export function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const item = (m: Mode, label: string, Icon: typeof Eye) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => onMode(m)}
      className={`flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium ${mode === m ? "bg-white text-zinc-900 shadow-[0_0_0_1px_#E4E4E2,0_1px_2px_rgba(16,16,20,0.06)]" : "text-zinc-600"}`}
    >
      <Icon aria-hidden className="size-[13px]" />{label}
    </button>
  );
  return (
    <div role="group" aria-label="Mode" className="flex rounded-lg bg-[#F0F0EE] p-0.5">
      {item("view", "View", Eye)}
      {item("edit", "Edit", Pencil)}
    </div>
  );
}

/** Returns an error to show under the field, or null when the rename ran (or failed with an error shown elsewhere). */
export type Rename = (name: string) => Promise<string | null>;

export function CharacterSheet({ initial, mode, onMode, onChange, onRename }: { initial: string; mode: Mode; onMode: (m: Mode) => void; onChange: (text: string) => void; onRename: Rename }) {
  // The screen mounts a new sheet for each file it loads, so defaults are read once.
  const [defaults] = useState(() => toForm(initial));
  const { control, register, getValues, subscribe } = useForm<SheetValues>({ defaultValues: defaults });
  const emit = useRef(onChange);
  useEffect(() => {
    emit.current = onChange;
  });

  useEffect(() => {
    // Report only real changes, so opening a file never rewrites it.
    let last = fromForm(defaults);
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const text = fromForm(values);
        if (text === last) return;
        last = text;
        emit.current(text);
      },
    });
  }, [subscribe, defaults]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 pb-20 pt-10">
      {mode === "edit" ? (
        <Edit control={control} register={register} sections={defaults.sections} name={defaults.front.name ?? ""} onRename={onRename} />
      ) : (
        <View values={getValues()} onEdit={() => onMode("edit")} />
      )}
    </div>
  );
}

// Not a registered form field: the name changes only through a rename (decision 0004-6),
// so autosave never writes a half-typed name. Design: docs/design/project/character-rename.html.
function NameField({ name, onRename }: { name: string; onRename: Rename }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const next = value.trim().toUpperCase();
  const changed = next !== name.trim().toUpperCase();

  const commit = async () => {
    if (busy.current) return;
    if (!changed) {
      setValue(name);
      setError(null);
      return;
    }
    busy.current = true;
    const err = await onRename(next);
    busy.current = false;
    setError(err);
    // On success the screen mounts a new sheet; otherwise show the name the file still has.
    if (!err) setValue(name);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="sheet-name" className="text-xs font-medium text-zinc-600">Name</label>
      <input
        id="sheet-name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setValue(name);
            setError(null);
          }
        }}
        aria-invalid={!!error}
        aria-describedby="sheet-name-hint"
        className={`${SCRIPT_FONT} w-full rounded-lg border bg-white px-3 py-1.5 text-[28px] font-bold leading-9 text-zinc-900 ${error ? "border-red-600 ring-3 ring-red-600/12" : "border-[#E4E4E2] focus:border-zinc-900 focus:ring-3 focus:ring-zinc-900/12"} outline-none`}
      />
      {error ? (
        <span id="sheet-name-hint" role="alert" className="flex items-center gap-1.5 text-xs text-red-700">
          <CircleAlert aria-hidden className="size-3.5 flex-none" />{error}
        </span>
      ) : (
        <span id="sheet-name-hint" className={`text-xs ${changed ? "text-zinc-600" : "text-zinc-500"}`}>
          {changed && next ? `Press Enter to rename ${name} to ${next} in every script. Esc keeps ${name}.` : "Renaming updates every script in this project."}
        </span>
      )}
    </div>
  );
}

function Edit({ control, register, sections, name, onRename }: { control: Control<SheetValues>; register: UseFormRegister<SheetValues>; sections: FormSection[]; name: string; onRename: Rename }) {
  return (
    <>
      <section aria-label="Header" className={`${CARD} mb-2 flex flex-col gap-[22px] p-6`}>
        <NameField name={name} onRename={onRename} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sheet-desc" className="text-[13px] font-medium text-zinc-800">Short description</label>
          <textarea id="sheet-desc" {...register("description")} className={TEXTAREA} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {HEADER.map(({ key, label }, i) => (
            <div key={key} className={`flex flex-col gap-1.5 ${i === HEADER.length - 1 ? "sm:col-span-3" : ""}`}>
              <label htmlFor={`sheet-${key}`} className="text-xs font-medium text-zinc-600">{label}</label>
              <input id={`sheet-${key}`} {...register(`front.${key}`)} className={INPUT} />
            </div>
          ))}
        </div>
      </section>
      {sections.map((s, i) => <EditSection key={s.heading} index={i} control={control} register={register} startOpen={answered(s) > 0} />)}
    </>
  );
}

function EditSection({ index, control, register, startOpen }: { index: number; control: Control<SheetValues>; register: UseFormRegister<SheetValues>; startOpen: boolean }) {
  const section = useWatch({ control, name: `sections.${index}` });
  const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${index}.custom` });
  const [open] = useState(startOpen);
  const dragFrom = useRef<number | null>(null);
  const total = section.questions.length + section.custom.length;
  const id = (k: string) => `sheet-${index}-${k}`;

  return (
    <details open={open} className={`${CARD} group`}>
      <Summary heading={section.heading} meta={`${answered(section)} of ${total} answered`} />
      <div className="flex flex-col gap-[18px] px-6 pb-6 pt-1">
        {section.questions.map((q, j) => (
          <div key={q.heading} className="flex flex-col gap-1.5">
            <label htmlFor={id(`q${j}`)} className="text-[13px] font-medium text-zinc-800">{q.heading}</label>
            <textarea id={id(`q${j}`)} {...register(`sections.${index}.questions.${j}.text`)} className={TEXTAREA} />
          </div>
        ))}
        {fields.map((f, k) => {
          const name = section.custom[k]?.heading || "custom field";
          return (
            <div
              key={f.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) move(dragFrom.current, k);
                dragFrom.current = null;
              }}
              className="-mx-3 flex flex-col gap-1.5 rounded-[10px] border border-[#EEEEEC] bg-[#FAFAF9] p-3"
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  draggable
                  onDragStart={() => (dragFrom.current = k)}
                  onKeyDown={(e) => {
                    const to = e.key === "ArrowUp" ? k - 1 : e.key === "ArrowDown" ? k + 1 : -1;
                    if (to < 0 || to >= fields.length) return;
                    e.preventDefault();
                    move(k, to);
                  }}
                  aria-label={`Reorder ${name}. Drag, or use the arrow keys.`}
                  className="flex size-7 flex-none cursor-grab items-center justify-center rounded-md text-zinc-500 hover:bg-white"
                >
                  <GripVertical aria-hidden className="size-3.5" />
                </button>
                <label htmlFor={id(`c${k}h`)} className="sr-only">Field name</label>
                <input id={id(`c${k}h`)} {...register(`sections.${index}.custom.${k}.heading`)} className="h-[30px] min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] font-medium text-zinc-800 hover:border-[#E4E4E2] focus:border-[#E4E4E2] focus:bg-white" />
                <span className="rounded-full bg-[#F0F0EE] px-2 py-0.5 text-[11px] font-medium text-zinc-600">Custom</span>
                <button type="button" onClick={() => remove(k)} aria-label={`Remove ${name}`} className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-white">
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              <div className="pl-[34px]">
                <label htmlFor={id(`c${k}`)} className="sr-only">{name}</label>
                <textarea id={id(`c${k}`)} {...register(`sections.${index}.custom.${k}.text`)} className={TEXTAREA} />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => append({ heading: "New field", text: "" }, { focusName: `sections.${index}.custom.${fields.length}.heading` })}
          className="flex h-8 cursor-pointer items-center gap-1.5 self-start rounded-[7px] border border-dashed border-[#D4D4D1] px-2.5 text-[13px] font-medium text-zinc-600 hover:bg-[#FAFAF9]"
        >
          <Plus aria-hidden className="size-3.5" />Add field
        </button>
      </div>
    </details>
  );
}

function Summary({ heading, meta }: { heading: string; meta: string }) {
  return (
    <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl pl-6 pr-5 [&::-webkit-details-marker]:hidden">
      <h2 className="text-[15px] font-semibold text-zinc-900">{heading}</h2>
      <span className="flex items-center gap-2.5 text-xs text-zinc-600">
        {meta}
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
      </span>
    </summary>
  );
}

function View({ values, onEdit }: { values: SheetValues; onEdit: () => void }) {
  const facts = HEADER.filter(({ key }) => values.front[key]?.trim());
  const filled = values.sections.filter((s) => answered(s) > 0);
  const hidden = values.sections.length - filled.length;
  return (
    <>
      <section aria-label="Header" className={`${CARD} mb-2 flex flex-col gap-5 p-7`}>
        <div className="flex flex-col gap-2">
          <h1 className={`${SCRIPT_FONT} text-[32px] font-bold leading-10 text-zinc-900`}>{values.front.name}</h1>
          {values.description.trim() && <p className="whitespace-pre-wrap text-base leading-[26px] text-zinc-700">{values.description}</p>}
        </div>
        {facts.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-[#EEEEEC] pt-5 sm:grid-cols-3">
            {facts.map(({ key, label }) => (
              <div key={key}>
                <dt className="mb-0.5 text-xs font-medium text-zinc-600">{label}</dt>
                <dd className="text-sm text-zinc-900">{values.front[key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {filled.map((s) => {
        const n = answered(s);
        return (
          <details key={s.heading} open className={`${CARD} group`}>
            <Summary heading={s.heading} meta={`${n} ${n === 1 ? "answer" : "answers"}`} />
            <dl className="flex flex-col gap-[18px] px-6 pb-6 pt-1">
              {[...s.questions, ...s.custom].filter((f) => f.text.trim()).map((f, i) => (
                <div key={i}>
                  <dt className="mb-1 text-xs font-medium text-zinc-600">{f.heading}</dt>
                  <dd className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-900">{f.text}</dd>
                </div>
              ))}
            </dl>
          </details>
        );
      })}
      {hidden > 0 && (
        <p className="mt-2 text-center text-[13px] text-zinc-600">
          {hidden === 1 ? "1 empty section is hidden." : `${hidden} empty sections are hidden.`}{" "}
          <button type="button" onClick={onEdit} className="cursor-pointer text-zinc-900 underline">Switch to Edit</button> to fill them in.
        </p>
      )}
    </>
  );
}
