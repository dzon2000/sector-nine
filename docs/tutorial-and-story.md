# Tutorial and Story — Opening Experience

**Status:** narrative and UX proposal for v0.1. Exact copy can evolve without changing mechanics.

## Narrative premise

The player arrives at a decommissioned industrial installation. Corporate Operations has issued a final ultimatum: the facility must resume profitable operation, or its operating license will be revoked. Old infrastructure contains hints of a sealed research program known as **Prometheus**.

## Opening — first launch

Before player construction, show a compact, readable sequence (2–3 panels), not an extended cutscene:

> **CORPORATE OPERATIONS // SECTOR 9**  
> Your predecessor's industrial complex has been idle for 312 days.  
> We have authorized a limited restart budget: **300 Cr**.

> The colony needs material deliveries. Headquarters needs profit.  
> Restore the production line, fulfill the first order, and prove this facility is worth saving.

> An archived maintenance record mentions **PROJECT PROMETHEUS**.  
> Access denied. Restore production before requesting clearance.

Player actions: **Begin Operations**, **Skip Introduction**, and later **Replay Introduction** from Help. Skipping the narrative must not disable gameplay or tutorial objectives.

## Tutorial principles

- Teach one action at a time; immediately follow it with observable feedback.
- Tutorials are in-world orders from a fictional operations console.
- Mark valid tiles and show conveyor direction when relevant.
- Explain the financial consequence of each new machine or sale.
- Prefer non-blocking hints over modal interruptions.
- Allow the player to experiment; no arbitrary placement restrictions beyond core rules.
- Track actual sold units, not manufactured units, for delivery objectives.
- Persist tutorial progress alongside mission progress.

## Prologue sequence

| Step | Player action | Guidance | Success |
|---|---|---|---|
| Introduction | Read/skip narrative | Explain corporate ultimatum and 300 Cr budget | Player selects Begin Operations |
| M1 — Restore Extraction | Place iron mine on ore deposit; run simulation | Highlight deposits, machine facing, Start/Pause | Mine produces at least one ore |
| M2 — First Delivery | Route ore to terminal | Demonstrate belt rotation and sales | 10 iron ore sold |
| M3 — Added Value | Route ore through furnace; sell ingots | Explain 2 ore -> 1 ingot, cost and throughput | 20 iron ingots sold across the save |
| M4 — Prove Profitability | Sustain efficient production | Explain operating profit vs cash; highlight bottlenecks | Rolling 60-tick profit >= 50 Cr/min for 60 consecutive active ticks |

A full rolling window is required before the M4 stability timer begins. A drop below the profit target resets this timer.

### Milestone feedback

- M1: "Extraction online. Material without a route earns nothing."
- M2: "First delivery confirmed. Processing can increase value per unit."
- M3: "Your furnace is operational. Profit now depends on throughput and cost."
- M4: "Sector 9 is commercially viable again. Prometheus archive: one access request pending."

On M4 completion, show **Prologue Completed** and continue in sandbox. Do not unlock complicated research machinery in v0.1; use the archive hint as a future-story hook.

## Accessibility and failure recovery

- All tutorial actions accessible via normal mouse and keyboard controls.
- Hint text and valid placement states not communicated by color alone.
- Failure messages explain *why* an action is rejected.
- Incorrect layouts can be dismantled at a predictable refund.
- Provide Help/Replay Introduction and a clearly confirmed New Game action.

## Questions for playtest

- Can a first-time player infer belt direction and rotation?
- Is tutorial completion possible with 300 Cr despite demolition refunds?
- Are players taught the distinction between cash balance and profit/min?
- Does the narrative motivate progress without interrupting optimization?
- Should optional tutorials be skippable independently of story intro?
