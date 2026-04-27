# Mechanics Markdown Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared mechanics markdown renderer that turns `dice\`2d6\`` into an inline dice icon plus formula text.

**Architecture:** Add a small parser utility with tests, then wrap `react-markdown` in a shared `MechanicsMarkdown` component used by both card render paths. Keep the grammar extensible by representing recognized tokens as typed inline metadata.

**Tech Stack:** Next.js, React, TypeScript, react-markdown, remark-gfm, node:test.

---

### Task 1: Mechanics Token Parser

**Files:**
- Create: `features/card-renderer/lib/mechanics-markdown-grammar.ts`
- Test: `features/card-renderer/lib/mechanics-markdown-grammar.test.ts`

- [ ] **Step 1: Write failing parser tests**

Cover plain text plus dice tokens, multiple tokens, punctuation, unknown keywords, and empty token values.

- [ ] **Step 2: Run the parser test and verify it fails**

Run: `node --import tsx --test features/card-renderer/lib/mechanics-markdown-grammar.test.ts`

Expected: fails because `parseMechanicsText` does not exist yet.

- [ ] **Step 3: Implement the parser**

Export `parseMechanicsText(value: string): MechanicsTextPart[]` and token types for recognized grammar parts. Recognize only `dice\`value\`` and preserve all other content as text.

- [ ] **Step 4: Run the parser test and verify it passes**

Run: `node --import tsx --test features/card-renderer/lib/mechanics-markdown-grammar.test.ts`

Expected: pass.

### Task 2: Shared Mechanics Markdown Renderer

**Files:**
- Create: `features/card-renderer/components/mechanics-markdown.tsx`
- Modify: `features/card-renderer/components/minimal-magic-item-card.tsx`
- Modify: `features/card-renderer/components/magic-item-print-card-slots.tsx`

- [ ] **Step 1: Create the shared renderer**

Add `MechanicsMarkdown`, `DiceNotation`, and a custom paragraph/text renderer path that applies `parseMechanicsText` to inline text children.

- [ ] **Step 2: Replace duplicated markdown setup**

Use `MechanicsMarkdown` in both current card renderers. Preserve existing print heading and table overrides.

- [ ] **Step 3: Verify type safety**

Run: `pnpm typecheck`

Expected: pass.

### Task 3: Full Verification

**Files:**
- Modify as needed only if verification finds issues.

- [ ] **Step 1: Run lint**

Run: `pnpm lint`

Expected: pass.

- [ ] **Step 2: Run focused tests**

Run: `node --import tsx --test features/card-renderer/lib/mechanics-markdown-grammar.test.ts`

Expected: pass.
