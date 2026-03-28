"use client";

import { useEffect, useRef } from "react";
import {
  emitTrainingTimerTick,
  getTrainingTimerState,
  STUDY_TIMER_FINISHED_EVENT,
} from "../lib/trainingTimer";

export function GlobalTrainingTimerSync() {
  const prevRunningRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const state = getTrainingTimerState();
      if (prevRunningRef.current && !state.running && state.remainingSec === 0) {
        window.dispatchEvent(new CustomEvent(STUDY_TIMER_FINISHED_EVENT));
      }
      prevRunningRef.current = state.running;
      emitTrainingTimerTick(state);
    };

    sync();
    const timer = window.setInterval(sync, 1000);
    window.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return null;
}