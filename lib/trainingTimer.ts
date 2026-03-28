export const STUDY_TIMER_EVENT = "study-timer-tick";
export const STUDY_TIMER_FINISHED_EVENT = "study-timer-finished";

const STORAGE_KEY = "study_app_training_timer";
const DEFAULT_TOTAL_SEC = 25 * 60;

export type TrainingTimerState = {
  totalSec: number;
  remainingSec: number;
  running: boolean;
  endsAt: number | null;
};

function fallbackState(): TrainingTimerState {
  return {
    totalSec: DEFAULT_TOTAL_SEC,
    remainingSec: DEFAULT_TOTAL_SEC,
    running: false,
    endsAt: null,
  };
}

function safeRead(): TrainingTimerState {
  if (typeof window === "undefined") return fallbackState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackState();
    const parsed = JSON.parse(raw) as Partial<TrainingTimerState>;
    const totalSec = Math.max(1, Number(parsed.totalSec ?? DEFAULT_TOTAL_SEC));
    const remainingSec = Math.max(0, Number(parsed.remainingSec ?? totalSec));
    const running = Boolean(parsed.running);
    const endsAt = typeof parsed.endsAt === "number" ? parsed.endsAt : null;
    return { totalSec, remainingSec, running, endsAt };
  } catch {
    return fallbackState();
  }
}

function safeWrite(state: TrainingTimerState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function emitTrainingTimerTick(state: TrainingTimerState): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STUDY_TIMER_EVENT, {
      detail: {
        time: state.remainingSec,
        running: state.running,
        totalSec: state.totalSec,
      },
    })
  );
}

export function getTrainingTimerState(): TrainingTimerState {
  const state = safeRead();
  if (!state.running || !state.endsAt) return state;

  const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  if (remaining > 0) return { ...state, remainingSec: remaining };

  const ended: TrainingTimerState = {
    ...state,
    remainingSec: 0,
    running: false,
    endsAt: null,
  };
  safeWrite(ended);
  emitTrainingTimerTick(ended);
  return ended;
}

export function setTrainingTimerPreset(minutes: number): TrainingTimerState {
  const totalSec = Math.max(1, Math.round(minutes * 60));
  const next: TrainingTimerState = {
    totalSec,
    remainingSec: totalSec,
    running: false,
    endsAt: null,
  };
  safeWrite(next);
  emitTrainingTimerTick(next);
  return next;
}

export function startTrainingTimer(): TrainingTimerState {
  const state = getTrainingTimerState();
  const remainingSec = state.remainingSec > 0 ? state.remainingSec : state.totalSec;
  const next: TrainingTimerState = {
    ...state,
    remainingSec,
    running: true,
    endsAt: Date.now() + remainingSec * 1000,
  };
  safeWrite(next);
  emitTrainingTimerTick(next);
  return next;
}

export function pauseTrainingTimer(): TrainingTimerState {
  const state = getTrainingTimerState();
  const next: TrainingTimerState = {
    ...state,
    running: false,
    endsAt: null,
  };
  safeWrite(next);
  emitTrainingTimerTick(next);
  return next;
}

export function resetTrainingTimer(): TrainingTimerState {
  const state = getTrainingTimerState();
  const next: TrainingTimerState = {
    ...state,
    remainingSec: state.totalSec,
    running: false,
    endsAt: null,
  };
  safeWrite(next);
  emitTrainingTimerTick(next);
  return next;
}