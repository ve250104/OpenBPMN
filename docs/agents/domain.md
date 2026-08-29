# Domain documentation

OpenBPMN uses a single-context domain-documentation layout.

## Before exploring

Read these resources when they exist:

- `CONTEXT.md` at the repository root.
- Relevant decisions under `docs/adr/`.

Proceed silently when either resource does not yet exist. The domain-modeling workflow creates them lazily when terminology or durable decisions are resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Vocabulary

Use the canonical terms defined in `CONTEXT.md` in issue titles, specifications, tests, APIs, and code. If a required concept is missing or ambiguous, resolve it through domain modeling before introducing competing terminology.

## Architectural decisions

Surface any conflict with an existing ADR explicitly. Do not silently override a recorded decision.
