# 0005: UI components

- Status: accepted
- Date: 2026-11-22

## Context

The app UI outside the script page (home page, character sheet, conflict banner, dialogs) needs buttons, inputs, dialogs, menus and tooltips with correct keyboard and focus handling. Tailwind CSS v4 is already set up.

Options considered: shadcn/ui, plain Tailwind with native HTML elements, Headless UI.

## Decision

Use [shadcn/ui](https://ui.shadcn.com) with Tailwind CSS v4.

- shadcn/ui copies component source into the repo (`components/ui/`). We own and edit that code; there is no component package to upgrade.
- Its components are built on Radix primitives, which handle focus trapping, keyboard navigation and ARIA for dialogs, menus and popovers.
- Add components one at a time, only when a screen needs them.
- Why not plain Tailwind: native `<dialog>` and `<details>` cover simple cases, but menus, popovers and tooltips would need our own focus and keyboard code.
- Why not Headless UI: a smaller set of components, installed as a package we do not own.

## Rules

- Styling goes through Tailwind classes. No CSS `calc()` in our code (decision 0001-6 and the project rule); generated shadcn code that uses `calc()` is rewritten with final values when added.
- The script page itself (CodeMirror editor) does not use shadcn/ui. Its geometry stays in `app/editor/screenplay.ts` (decision 0001-6).
- Look: neutral grays, one blue accent, Inter for UI text, Courier Prime for project and script names. Design: https://claude.ai/artifact/NWhUuVWA9f9X6mEaaBwFrA
