# Implementation Log Guide

## Purpose

This directory stores slice-level delivery records.

It should answer:

- what changed
- why it changed
- how it was verified
- what should happen next

## When to add an entry

Add an entry when work is more than a tiny typo or trivial rename.

Examples that should create an entry:

- a new rules slice
- a protocol contract expansion
- a server lifecycle milestone
- a bug fix with reusable lessons
- a boundary-preserving refactor

Examples that usually do not need a standalone entry:

- spelling fixes
- comment-only cleanup
- tiny local refactors with no behavior change

## File naming

Use:

- `YYYY-MM-DD-short-slice-name.md`

Examples:

- `2026-04-18-match-bootstrap-baseline.md`
- `2026-04-21-priority-resolution.md`

## Required template

```md
# YYYY-MM-DD Slice Name

## Summary

One paragraph explaining the slice outcome.

## Scope

- packages/domain
- packages/application
- packages/protocol

## Changed areas

- concrete change 1
- concrete change 2

## Preserved invariants

- invariant 1
- invariant 2

## Tests and verification

- added or updated tests
- ran `pnpm test`
- ran `pnpm typecheck`

## Documentation updated

- docs/path-a.md
- docs/path-b.md

## Open questions

- unresolved ambiguity 1

## Next recommended slice

- the next slice name
```

## Quality bar

Good entries are:

- specific
- date-scoped
- test-aware
- useful to someone who was not in the chat

Bad entries are:

- vague
- purely emotional progress notes
- missing test evidence
- missing next-step guidance
