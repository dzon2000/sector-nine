# SEKTOR 9 — Game Design Document

**Document version:** 0.1 — draft  
**Date:** 2026-11-08  
**Status:** design baseline; balance numbers are unverified  
**Genre:** single-player, browser-based, 2D factory-building / idle / economic strategy  
**Inspirations:** Factorio (spatial logistics and production chains), Factory Idle (incremental efficiency and economy)

## 1. Vision

The player takes control of a declining industrial facility in a remote colony known as **Sector 9**. By placing machines on a grid, physically connecting production lines, selling products, and reinvesting profits, the player transforms an abandoned site into an advanced industrial enterprise.

The primary objective is **sustained operating profit**, not gross revenue alone. Advanced technologies require more diverse inputs, better logistics, and research milestones. A narrative campaign supplies purpose and progression; free-form optimization continues beyond the prologue and eventual campaign ending.

### Design pillars

1. **Design, not clicking.** Production runs automatically; the player makes strategic layout and investment choices.
2. **Physical logistics.** Machine positioning, orientation, throughput, and congestion matter.
3. **Transparent economics.** Revenue, processing cost, transportation cost, and capital expenditure are distinct.
4. **Technology through complexity.** New eras need tangible production achievements, not merely cash.
5. **Guided discovery.** Narrative and tutorial missions teach mechanics through actual factory activity.
6. **Deterministic foundations.** Identical layouts, commands, and simulation ticks produce identical outcomes.

Target active sessions are 5–20 minutes. Long-term play includes offline progress once the system has a validated method for accurate accounting.

## 2. Audience and platform

- Audience: players who enjoy optimization, manufacturing systems, idle progression, and constrained spatial puzzles.
- Initial platform: desktop browser, keyboard and mouse; single-player and fully local.
- Later possibilities: touch devices, portable/cloud saves, localization, more complex worlds.
- No forced advertisements, artificial energy timers, or monetization pressure as game mechanics.

## 3. Core loop

1. Place extraction equipment on resource deposits.
2. Route raw material into processors or directly to the sales terminal.
3. Transform material into higher-value goods.
4. Observe output, cost, revenue, and net profit per minute.
5. Reinvest into machinery, logistics, and eventually research.
6. Unlock technologies and story chapters.
7. Reconfigure the factory to remove bottlenecks and improve margins.

**Operating profit = sales revenue − operating production costs − transport costs.** Building purchases are capital expenditures that change cash balance but do not distort the operating-profit KPI.

## 4. World and visual style

- Top-down orthogonal grid with expandable maps in later versions.
- Each object exposes its facing direction and inputs/outputs.
- Individual transported items are visibly represented on conveyor cells.
- Work states must be recognizable through text/icons as well as color.
- Visual direction: readable industrial pixel-art / low-resolution 2D, growing in complexity with progression.

## 5. World entities

| Entity | Role | Later extensions |
|---|---|---|
| Resource deposit | Anchors extractors to specific tiles | Depletion, grades, exploration |
| Mine | Produces raw material | Extractor upgrades |
| Furnace | Turns ore into ingots | Multiresource smelting |
| Conveyor | Moves one physical item between adjacent tiles | Faster belts, splitters, filters |
| Sales terminal | Consumes and sells delivered products | Contracts and market prices |
| Storage | Buffers products | Routing priorities |
| Generator | Provides energy | Networks, fuels, outages |
| Laboratory | Performs research | Research packs and milestones |
| Assembler | Builds complex products | Multiple inputs, by-products |

Only the first four functional building classes (mine, furnace, conveyor, fixed sales terminal) are in v0.1. All v0.1 buildings occupy one tile.

## 6. System design

### Production and logistics
Machines have declarative recipes: required inputs, quantities, cycle duration, produced outputs, cost, and buffer capacity. Transport is directional; a blocked downstream node must eventually stop upstream production (**backpressure**). No item teleportation. Future recipes may require several distinct input materials and may emit by-products.

### Economic simulation
Money is represented in integer hundredths of a credit (`Cr`). Revenue occurs when the sales terminal receives an item. Operating costs occur only on successful production and conveyor transfer. Capital purchases and refunds are tracked separately from profit. Later systems may include contracts, power, maintenance, fluctuating demand, and land expansion.

### Technology progression

| Era | Main products | Intended new problem |
|---|---|---|
| I — Metallurgy | Iron, coal, steel, gears | Throughput and basic profitability |
| II — Electronics | Copper, silicon, wire, circuits | Synchronize multiple sources |
| III — Automation | Motors, sensors, robots | Assemble three or more components |
| IV — Advanced Computing | Processors, AI systems, data centers | Energy and cooling infrastructure |
| V — Future Industry | Fusion, nanotechnology, space technology | Multi-stage megaprojects |

Unlock conditions combine research points, delivered goods, money, and narrative milestones. Example future robotics gate: 500 research points, 50 motors, 40 circuits, and stable power. This is illustrative, not a committed balancing value.

### Idle progression
Active play uses a fixed-step deterministic engine. Later releases may compute bounded offline progress based on that same model. **v0.1 deliberately has no offline production**, and the UI must communicate this clearly.

## 7. Story premise and campaign

The player is appointed operator of a neglected factory after a corporate ultimatum: restore operating performance or lose the facility. Repairs expose traces of the erased **Prometheus Project**, and increasingly unusual orders suggest the colony's history was deliberately concealed.

- **Chapter I — Last Chance:** restore extraction, fulfill first deliveries, prove profitability.
- **Chapter II — Unknown Client:** manufacture electronics for an unidentified customer.
- **Chapter III — Project Prometheus:** investigate recovered industrial research systems.
- **Chapter IV — Independence:** choose between corporate contracts and an independent industry.

Narrative decisions may influence access to contracts, discounts, and research paths, but should not permanently soft-lock core factory progression.

The story opening must occur **before the first construction task**; onboarding and missions belong to the narrative, not to an unrelated help menu. See [Tutorial and Story](tutorial-and-story.md).

## 8. Missions and contracts

- Tutorial: place and rotate a mine or belt, inspect an object, deliver a product.
- Economic: sustain profit or optimize unit cost.
- Production: fulfill deliveries requiring one or more resources.
- Logistics: feed parallel machines and solve throughput constraints.
- Story: manufacture key artifacts and rebuild lost infrastructure.
- Repeatable contracts: time-limited economic choices, not included in v0.1.

v0.1 includes four sequential prologue milestones embedded in the tutorial, then a free-play sandbox.

## 9. Balancing principles

- Early play prioritizes understanding and recoverability over punishment.
- More expensive products must not automatically dominate all other strategies.
- Detours, congestion, idle capacity, and inefficient conversion should carry an opportunity or direct cost.
- Avoid repetitive manual clicking, random failures, and artificially delayed unlocks in the prologue.
- All economic constants are hypotheses until validated in automated simulations and human playtests.

## 10. User experience

Intended desktop layout:
- Top: cash balance, rolling revenue/min, operating cost/min, profit/min, run/pause.
- Left: building palette, costs, and selected tool.
- Center: grid, deposits, machines, items, orientation arrows, placement validation.
- Right: inspected object's status, buffers, recipe, direction, and actions.
- Bottom: current objective, guidance, and system feedback.

Accessible controls must have keyboard alternatives. Status must not depend exclusively on color. No real-time reaction skill should be necessary.

## 11. Release strategy

See [Roadmap](roadmap.md) and [v0.1 Specification](specifications/v0.1.md). We deliver a testable vertical slice per version, starting with a headless simulation validation before a visual game.

## 12. Risks and open questions

- Excessive conveyor micromanagement → intuitive rotation and future blueprint tools.
- Hidden bottlenecks → per-machine states and flow diagnostics.
- Economic exploits → test capital and operating ledgers separately.
- UI/simulation drift → single authoritative, fixed-step state.
- Corrupt saves → versioned snapshots and explicit error handling.
- Unbalanced economy → deterministic benchmarks plus playtests.

To revisit after the prototype: pacing, exact mission thresholds, conveyor cost, deposit depletion, offline limits, larger footprints, and possible prestige loops.

For v0.1 details, **the version specification takes precedence** over this high-level GDD.
