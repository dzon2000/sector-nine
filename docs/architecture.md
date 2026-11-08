# Architecture — SEKTOR 9

**Status:** approved high-level technology choices; concrete module APIs pending v0.1 implementation.

## Technical stack

| Concern | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Web framework | React |
| Map rendering | PixiJS |
| Tooling | Vite |
| Simulation | Standalone deterministic TypeScript module |
| State persistence | IndexedDB |
| Unit/integration tests | Vitest |
| Browser E2E tests | Playwright (proposed) |
| Hosting | Static web hosting; no backend required for v0.1 |

## Boundary rule

**Never couple simulation advancement to rendered frames.** PixiJS and React consume state snapshots and emit commands. The simulation receives explicit commands and advances only by integer logical ticks.

```text
User action -> UI command adapter -> domain command validation
                                        |
                                        v
                                  Game state
                                        |
                             advanceTick(state)
                                        |
                             domain events + new state
                                        |
                     +------------------+----------------+
                     v                                   v
             React / PixiJS                        IndexedDB
```

### Module ownership

- `src/domain/`: immutable definitions, item/building types, machine recipes, grid rules.
- `src/simulation/`: tick scheduler, production, transport resolution, cost/revenue ledger, invariants.
- `src/game/`: commands, tutorial flow, mission progress, game session orchestration.
- `src/rendering/`: PixiJS scene, object sprites, belt indicators.
- `src/ui/`: panels, controls, UI feedback, accessibility.
- `src/persistence/`: save serialization, validation, IndexedDB adapter, migrations.
- `tests/`: unit, integration, and browser E2E tests.

## Domain rules

1. Simulation never calls `Date.now()`, random number generators, browser APIs, timers, or renderer methods.
2. Time is an explicit integer tick (1 logical second in v0.1).
3. Money is stored as integer hundredths of a credit.
4. Product quantities are nonnegative integers; item movement is atomic.
5. Entity IDs are stable and the order of conflict resolution is specified and tested.
6. Recipes, prices, and build costs are data, not deeply embedded UI conditionals.
7. A single authoritative game state drives both rendering and persistence.

## Persistence contract

Save version, tick, cash, map/deposits, entities/orientations, inventories, active cycles, transport arbiters, accounting window, and mission/tutorial progress. Restore without replaying elapsed real time in v0.1. On schema mismatch, show an actionable error; never silently overwrite data.

## Simulation implementation notes

Define tick phases and input/output buffer semantics before writing code. Favor a pure or state-in/state-out tick function, with explicit domain events usable by the UI and acceptance tests. Serialize all arbitration state needed to maintain determinism after save/load.

**Do not begin visual production work until the reference-line economy test passes.**

## Design documentation

- [GDD](GDD.md)
- [Economy](economy.md)
- [v0.1 Specification](specifications/v0.1.md)
- [Validation Plan](validation-plan.md)
