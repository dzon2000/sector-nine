# Proposed ADR — Chapter IV priority routing

**Status** — Proposed for Product Owner review. Prototype and paid layouts appear in [WP2 experiments](../validation/v0.6-wp2-probes.md).

## Decision proposed

Keep splitters alternating by default. Add an optional forward or clockwise priority relative to the splitter's facing. A mode change updates selection at the command boundary and leaves cargo movement to the next engine tick. Preserve the alternating rotor while priority is active so returning to alternating resumes its previous selection. Rotate both local outlets with the splitter. Persist mode and selection in the current-version save under ADR-0006.

Keep existing transfer snapshot eligibility and arbitration. Try the other outlet if the preferred one is missing, occupied at the planning snapshot, or rejects the cargo. Hold the item when both outlets reject it. If another source wins arbitration after the preferred request was accepted, hold the cargo until the next tick. Retrying after arbitration would change contested-target ordering and requires a separate arbitration prototype. Test current-version save/restore, pending cargo on mode change, all rotations, fallback, and existing alternation at the production gate.

Keep the same candidate mission measurements across both recipient routes. Measure complete 30-tick windows after each activation. M14 uses six fresh circuit completions, six circuit sales and a maximum run of five ticks without circuit sales inside the window. M15 repeats those conditions and adds five gear completions and five gear sales. A continuity indicator should show the circuit-sales gap in simulation ticks. The same circuits or gears made before activation can exist in transit, so evaluate production and sales independently within each window. The candidate leaves the final numbers and wording for owner approval.

## Challenge options

| Option | Player consequence | Evidence |
| --- | --- | --- |
| Accept prepared layouts and keep both missions | Prepared players see the initial signal and demonstrate concurrent service across two fresh windows. Under-capacity factories can improve on an existing local branch. | Both paid reference endpoints pass at the first full window for each stage. The shared copper trade-off has a one-splitter recovery on both routes. |
| Add a separate optional recovery scenario | Players who want a focused routing puzzle can opt into an intentional load or routing challenge. Define and validate an independently scoped scenario before implementation. | WP2 demonstrates sensitivity to diverted copper and a stalled gear branch, plus a buffer transient that a one-window target can miss. |
| Require a distinct M15 factory intervention | Extend the feasibility phase with diverse live layouts and a player-accepted change in output, demand or sustained coverage. | Existing paid layouts already supply the candidate. Raising the gear quota alone risks a capacity rebuild and no paid proof supports a distinct mandatory intervention. |

Prefer accepting prepared layouts for Chapter IV as drafted. If a guaranteed M15 puzzle is required, bring an optional scenario back for design review. The test fault is evidence for recovery behavior and does not prescribe campaign damage.
