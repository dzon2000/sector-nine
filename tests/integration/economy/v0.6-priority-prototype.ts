import type {GameState} from "../../../src/domain/model";
import {tick} from "../../../src/simulation/engine";

/** 0 is forward. 1 is clockwise relative to the machine. Unlisted splitters alternate. */
export type PriorityOutlets = ReadonlyMap<number, 0|1>;

/**
 * Experimental selector around the develop baseline engine. The engine still owns
 * snapshot eligibility, fallback, arbitration, movement and all accounting.
 * A preferred request that loses arbitration waits for the following tick.
 */
export function tickWithPriority(state:GameState, priorities:PriorityOutlets):GameState {
  if(state.paused||priorities.size===0)return tick(state);
  const alternatingMemory=new Map<number,0|1|undefined>();
  const entities=state.entities.map(entity=>{
    const outlet=priorities.get(entity.id);
    if(entity.kind!=="splitter"||outlet===undefined)return entity;
    alternatingMemory.set(entity.id,entity.splitterNext);
    return {...entity,splitterNext:outlet};
  });
  const next=tick({...state,entities});
  for(const entity of next.entities){
    if(alternatingMemory.has(entity.id))entity.splitterNext=alternatingMemory.get(entity.id);
  }
  return next;
}
