---
name: deterministic-simulation
description: Preserve SEKTOR 9 fixed-tick deterministic simulation, physical transport, money/material invariants, historical economy and save/restore behavior
---

# Deterministic Simulation Contract

Use for all game-domain, logistics, economy, power, mission and persistence changes.

- Pure headless simulation; no React, PixiJS, DOM, timers, Date.now(), random or implicit real-time effects. State transitions must be reproducible from the same initial state, commands and tick count.
- Use integer cents for monetary ledger, nonnegative integer item quantities, explicit deterministic phase ordering and stable collision/arbiter resolution. Test tick ordering and ties.
- Respect physical delivery and backpressure. No teleportation, duplicated material, implicit sale or unaccounted purchase/refund/operating cost. Separate capital balance changes from operating profit.
- Assert **both** conservation and business outcomes against approved reference fixtures. Do not tune away historical v0.1–v0.3 values, resource coordinates or mission rules when adding a new version.
- Serialize all arbitration, machine, power, mission-window and recorder state required for deterministic continuation. A load after N ticks plus M ticks must match an uninterrupted N+M run.
- Explicitly test corrupt data, old schemas, rule-version progression, occupied deposits, partial windows, reset safety and genuine historical saves when provided.
- Prove mission requirements with actual paid physical production and transport when they demand it; stockpile injection or synthetic balance changes are not qualifying gameplay evidence.

Report invariant tests, concrete trace/ticks, money/material audit, restore equality, historical regression outcome and limitations.
