// Live instructor session state machine.
//
// The state is a plain, immutable-ish object: every transition returns a new
// state object so it is trivial to render from. `tickSession` advances the
// countdown and rolls over to the next segment (carrying any leftover delta).

import { formatDuration } from './programs.mjs';

/** Re-export so callers can format the big timer without importing both modules. */
export const formatTime = formatDuration;

function segAt(program, index) {
  return program?.segments?.[index] ?? null;
}

function baseState(program, index, extra = {}) {
  const segments = program?.segments ?? [];
  const clampedIndex = Math.min(Math.max(index, 0), Math.max(segments.length - 1, 0));
  const current = segAt(program, clampedIndex);
  return {
    program,
    currentIndex: clampedIndex,
    currentSegment: current,
    nextSegment: segAt(program, clampedIndex + 1),
    remainingSeconds: current ? current.durationSeconds : 0,
    isPaused: false,
    isFinished: false,
    elapsedSeconds: 0,
    ...extra,
  };
}

/** Total program seconds, used for the global progress bar. */
export function totalDuration(program) {
  return (program?.segments ?? []).reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
}

/** Seconds elapsed from the start of the program through the current position. */
export function elapsedDuration(state) {
  const segments = state.program?.segments ?? [];
  let elapsed = 0;
  for (let i = 0; i < state.currentIndex; i += 1) {
    elapsed += segments[i]?.durationSeconds || 0;
  }
  const current = segments[state.currentIndex];
  if (current) elapsed += current.durationSeconds - state.remainingSeconds;
  return elapsed;
}

/** Fraction (0..1) of the whole program completed. */
export function progressFraction(state) {
  const total = totalDuration(state.program);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedDuration(state) / total));
}

/** Create a fresh session positioned at the first segment. */
export function createSessionState(program) {
  return baseState(program, 0);
}

/**
 * Advance the countdown by `deltaSeconds`, rolling into later segments as
 * needed. When time runs out on the final segment the session is marked
 * finished with `remainingSeconds === 0`.
 */
export function tickSession(state, deltaSeconds = 1) {
  if (state.isPaused || state.isFinished) return state;
  const segments = state.program?.segments ?? [];
  let index = state.currentIndex;
  let remaining = state.remainingSeconds;
  let delta = Math.max(0, deltaSeconds);

  while (delta > 0) {
    if (delta < remaining) {
      remaining -= delta;
      delta = 0;
    } else {
      // Consume the rest of this segment and move to the next one.
      delta -= remaining;
      if (index + 1 < segments.length) {
        index += 1;
        remaining = segments[index].durationSeconds;
      } else {
        // Finished the final segment.
        return baseState(state.program, index, {
          remainingSeconds: 0,
          isFinished: true,
          isPaused: state.isPaused,
        });
      }
    }
  }

  return baseState(state.program, index, {
    remainingSeconds: remaining,
    isPaused: state.isPaused,
  });
}

/**
 * Jump to the next segment. Advancing the pointer surfaces the segment you
 * land on via `nextSegment` (the on-deck movement the instructor is cueing to).
 */
export function skipToNextSegment(state) {
  const segments = state.program?.segments ?? [];
  if (state.currentIndex + 1 >= segments.length) {
    return baseState(state.program, state.currentIndex, {
      remainingSeconds: 0,
      isFinished: true,
      isPaused: state.isPaused,
    });
  }
  const newIndex = state.currentIndex + 1;
  return baseState(state.program, newIndex, { isPaused: state.isPaused });
}

/** Jump back to the previous segment (restarts the current one if already first). */
export function skipToPreviousSegment(state) {
  const newIndex = Math.max(0, state.currentIndex - 1);
  return baseState(state.program, newIndex, { isPaused: state.isPaused });
}

/** Restart the current segment's countdown. */
export function restartSegment(state) {
  return baseState(state.program, state.currentIndex, { isPaused: state.isPaused });
}

/** Restart the whole program from the first segment. */
export function restartSession(state) {
  return createSessionState(state.program);
}

/** Toggle pause/resume. */
export function togglePause(state) {
  return { ...state, isPaused: !state.isPaused };
}

export function setPaused(state, paused) {
  return { ...state, isPaused: Boolean(paused) };
}
