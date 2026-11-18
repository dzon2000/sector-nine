export type SimulationSpeed = 1 | 2;

/** Owns one pending wall-clock deadline. The engine receives ordinary ticks. */
export function createSimulationClock(onTick: () => void) {
  let running = false;
  let speed: SimulationSpeed = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (!running || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      onTick();
      schedule();
    }, 1000 / speed);
  }

  function update(shouldRun: boolean, nextSpeed: SimulationSpeed) {
    if (running === shouldRun && speed === nextSpeed) return;
    clearTimeout(timer);
    timer = undefined;
    running = shouldRun;
    speed = nextSpeed;
    schedule();
  }

  return {update, dispose: () => update(false, speed)};
}
