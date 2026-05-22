/**
 * Subtle audio + haptic feedback for high-confidence success/dismiss moments.
 *
 * Goal: a tiny "tick" on archive, a soft chime on action completion —
 * present but never loud. The point is the product feels alive on
 * success, not silent.
 *
 * - Sound uses the Web Audio API (no asset files; we synthesize a short
 *   sine + envelope) so there's no network cost and no permission prompt.
 * - Haptics use navigator.vibrate on mobile devices that support it.
 *
 * Disabled until enableFeedbackFx() is called once (first user interaction
 * unlocks AudioContext on iOS/Safari). The dashboard calls enable on the
 * first keydown / click.
 */

let audioCtx: AudioContext | null = null;
let enabled = false;

/**
 * Call this once on the first user interaction (keydown / pointerdown) so
 * Safari/iOS allow AudioContext to play. Cheap to call multiple times.
 */
export function enableFeedbackFx(): void {
  if (enabled) return;
  enabled = true;
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) audioCtx = new AC();
  } catch {
    // No audio — haptics-only fallback is fine.
  }
}

function playTone(opts: {
  frequency: number;
  durationMs: number;
  gain?: number;
  type?: OscillatorType;
}): void {
  if (!enabled || !audioCtx) return;
  const { frequency, durationMs, gain = 0.06, type = "sine" } = opts;
  try {
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(env);
    env.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const dur = durationMs / 1000;
    // Quick attack + smooth decay — keeps it from sounding harsh
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // No-op
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // No-op
  }
}

/**
 * Soft "tick" — for dismiss / archive. ~30ms, low pitch.
 */
export function fxDismiss(): void {
  playTone({ frequency: 220, durationMs: 80, gain: 0.05, type: "sine" });
  vibrate(10);
}

/**
 * "Pop" — for positive feedback (thumb up, label correct).
 */
export function fxPositive(): void {
  playTone({ frequency: 740, durationMs: 70, gain: 0.05, type: "triangle" });
  vibrate(8);
}

/**
 * Two-note chime — for send / completion of a multi-step action.
 */
export function fxComplete(): void {
  playTone({ frequency: 660, durationMs: 90, gain: 0.05, type: "sine" });
  setTimeout(() => {
    playTone({ frequency: 990, durationMs: 140, gain: 0.045, type: "sine" });
  }, 70);
  vibrate([10, 30, 14]);
}

/**
 * Subtle "thunk" — for snooze (something getting moved out of view).
 */
export function fxSnooze(): void {
  playTone({ frequency: 320, durationMs: 110, gain: 0.05, type: "sine" });
  vibrate(12);
}

/**
 * Brief "blip" — for navigation focus changes (j/k). Very quiet so it
 * doesn't feel noisy on rapid scrolling.
 */
export function fxNav(): void {
  playTone({ frequency: 880, durationMs: 18, gain: 0.018, type: "sine" });
}
