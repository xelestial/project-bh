# Project. BH Documentation Rules

## Purpose

Documentation in Project. BH is not decoration. It is the project's memory system.

Good documentation must help future work do three things:

1. understand what is true now
2. understand why it became true
3. avoid relearning the same lesson after a bug, refactor, or engine migration

## Documentation principles

- Write facts, not vibes.
- Separate planned work from implemented work.
- Separate stable reference docs from temporary progress notes.
- Link rules to tests whenever possible.
- Record assumptions explicitly.
- Prefer small updates to the right document over giant retrospective dumps.

## Required document categories

### 1. Reference docs

These describe the current canonical truth and should read as stable project knowledge.

- `docs/architecture/overview.md`
- `docs/rules/game-rules.md`
- `docs/networking/protocol.md`
- `docs/testing/test-strategy.md`
- `docs/migration/unity-parity.md`

Use these when:

- architecture changes
- implemented rule behavior changes
- protocol contracts change
- test policy changes
- Unity portability constraints change

### 2. Planning docs

These describe intended execution order and delivery structure.

- `docs/planning/implementation-roadmap.md`

Use these when:

- a new slice is about to start
- delivery order changes
- dependencies between slices become clearer

### 3. Implementation result logs

These record what was actually delivered in a specific slice or change.

- `docs/implementation-log/`

Use these when:

- a meaningful slice completes
- a bug fix changes rule behavior
- a refactor changes important boundaries

### 4. Decision records

Use ADRs later when a decision has significant long-term architectural impact.

Examples:

- why replay format is event-sourced instead of snapshot-only
- why tile interactions are resolved in a specific order
- why a protocol version changed

## Mandatory update rules

When a change lands, update documents in the same change according to this table.

- Domain rule changed:
  - update `docs/rules/game-rules.md`
  - add or update tests
  - add implementation log entry if the change is non-trivial
- Application orchestration changed:
  - update `docs/architecture/overview.md` if boundaries changed
  - add implementation log entry if flow changed materially
- Protocol shape changed:
  - update `docs/networking/protocol.md`
  - update schema tests
- Test strategy changed:
  - update `docs/testing/test-strategy.md`
- Unity portability changed:
  - update `docs/migration/unity-parity.md`
- Build order or scope changed:
  - update `docs/planning/implementation-roadmap.md`

## Writing rules by document type

### Reference docs must

- describe implemented behavior, not speculative future behavior
- call out deliberate gaps with `Not implemented yet`
- prefer exact rules over broad statements
- avoid changelog-style prose

### Planning docs must

- describe intended future work
- include ordering and dependencies
- include proof requirements such as tests and exit criteria
- avoid pretending unfinished work already exists

### Implementation logs must

- describe what changed in this slice
- describe what stayed invariant
- record tests that prove the change
- record open questions and follow-up slices
- link affected code paths when helpful

## Implementation result writing format

Each meaningful slice should create one log entry under `docs/implementation-log/`.

Recommended file name:

- `YYYY-MM-DD-slice-name.md`

Required sections:

1. Summary
2. Scope
3. Changed areas
4. Preserved invariants
5. Tests and verification
6. Documentation updated
7. Open questions
8. Next recommended slice

## Example implementation result structure

```md
# 2026-04-18 Priority Resolution Slice

## Summary

Implemented round bootstrap and priority-card turn ordering.

## Scope

- packages/domain
- packages/application
- packages/protocol
- packages/testkit

## Changed areas

- added priority card state model
- added round bootstrap command handling
- added tie-break ordering resolver

## Preserved invariants

- server remains authoritative
- React still owns no rules logic
- turn order is deterministic from state plus submissions

## Tests and verification

- added domain tests for tie ordering
- added protocol validation tests
- ran `pnpm test`
- ran `pnpm typecheck`

## Documentation updated

- docs/rules/game-rules.md
- docs/networking/protocol.md
- docs/planning/implementation-roadmap.md

## Open questions

- exact exhaustion/reset behavior for priority cards across rounds needs confirmation

## Next recommended slice

- movement budget and carry restrictions
```

## What not to do

Avoid these structures because they make long-term learning worse.

- A single giant `TODO.md` for the whole project.
- A catch-all `misc` or `notes` document with mixed rules, ideas, and bug history.
- One endless implementation diary with no dates or slice boundaries.
- Putting critical rationale only in chat or commit messages.
- Duplicating the same rule in multiple docs without naming the canonical source.
- Writing future plans inside stable reference docs as if they are already implemented.
- Recording a bug fix without a regression test or implementation log note.
- Logging vague items such as `fix movement later` without impact or context.
- Hiding architectural assumptions in code comments only.
- Using proposal documents as the running source of truth after implementation diverges.

## Learning loop rules

To keep the project continuously teachable, every meaningful change should leave behind:

- code
- tests
- updated reference docs
- a slice result entry when the change is non-trivial

If a bug is found:

1. add a regression test first or with the fix
2. fix the code
3. update the relevant reference doc if behavior changed
4. add an implementation log entry if the lesson is reusable

If a rule is ambiguous:

1. isolate the assumption in code
2. note the ambiguity in docs
3. avoid silently hard-coding the assumption across multiple layers

## Canonical source rules

Use one canonical place for each kind of truth.

- implemented gameplay truth:
  - `docs/rules/game-rules.md`
- architecture truth:
  - `docs/architecture/overview.md`
- protocol truth:
  - `docs/networking/protocol.md`
- execution order truth:
  - `docs/planning/implementation-roadmap.md`
- per-slice historical learning:
  - `docs/implementation-log/`

If two docs disagree, fix the drift immediately instead of adding a third explanation.
