# ADR-0008 — Chapter IV priority routing and mission rules

**Status** — Accepted by Product Owner on 2026-11-18 after review of the paid feasibility results. Prototype and paid layouts appear in [WP2 experiments](../validation/v0.6-wp2-probes.md).

## Decision

Keep splitters alternating by default. Add an optional forward or clockwise priority relative to the splitter's facing. A mode change updates selection at the command boundary and leaves cargo movement to the next engine tick. Preserve the alternating rotor while priority is active so returning to alternating resumes its previous selection. Rotate both local outlets with the splitter. Persist mode and selection in the current-version save under ADR-0006.

Keep existing transfer snapshot eligibility and arbitration. Try the other outlet if the preferred one is missing, occupied at the planning snapshot, or rejects the cargo. Hold the item when both outlets reject it. If another source wins arbitration after the preferred request was accepted, hold the cargo until the next tick. Retrying after arbitration would change contested-target ordering and requires a separate arbitration prototype. Test current-version save/restore, pending cargo on mode change, all rotations, fallback, and existing alternation at the production gate.

Keep the same mission measurements across both recipient routes. Measure complete 30-tick windows after each activation. M14 uses six fresh circuit completions, six circuit sales and a maximum run of five ticks without circuit sales inside the window. M15 repeats those conditions and adds five gear completions and five gear sales. A continuity indicator should show the circuit-sales gap in simulation ticks. The same circuits or gears made before activation can exist in transit, so evaluate production and sales independently within each window. Prepared factories can complete each mission on its first qualifying full window. Chapter IV does not inject a fault or require an edit.

