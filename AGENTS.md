# Development Guidelines for AI Agents

## Purpose
This repository is the canonical source for SEKTOR 9. The dedicated design conversation owns product decisions; each version is implemented in its own conversation.

## Non-negotiable rules
- Write documentation, code comments, identifiers, commit messages, and PR descriptions in **English**.
- Read `docs/GDD.md`, the active `docs/specifications/` document, and `docs/decisions/` before coding.
- Keep the simulation engine independent of React, PixiJS, DOM, wall-clock time, and persistence.
- Simulation is fixed-step and deterministic; use integer cents for all monetary values.
- Do not introduce new mechanics, change economic constants, or redefine acceptance criteria without recording a design decision.
- Implement no features from future releases unless essential to support the approved version.
- Separate production, transport, accounting, and rendering into testable modules.
- Never silently discard a saved game when a schema migration fails.
- Add automated tests for every simulation/economy change and for each relevant acceptance criterion.
- When a question is unresolved, document the assumption rather than hiding it in implementation.

## Preferred delivery workflow
1. Confirm the requested version and specification.
2. Create a short implementation plan with acceptance-criterion mapping.
3. Build and test the **headless simulation first**, including a reference-economy regression.
4. Add the UI, tutorial, and local persistence only after core invariants hold.
5. Run unit, integration, and end-to-end tests; report exact commands and results.
6. Push a feature branch and open a PR against `develop`. Do not force-push shared history.

## Structure
- `docs/`: product, architecture, economics, narrative, validations, ADRs, version specifications
- `src/domain/`: declarative types, recipes, definitions
- `src/simulation/`: deterministic tick, transport, production, accounting
- `src/game/`: commands, progression, missions, tutorial state
- `src/rendering/`: PixiJS visualization
- `src/ui/`: React interface
- `src/persistence/`: IndexedDB snapshots and schema migrations
- `tests/`: unit, integration, end-to-end tests

These directories are placeholders until implementation begins.
