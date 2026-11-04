import { Animated, AppState, Easing } from 'react-native';
import { HOLOGRAPHIC_DURATION } from '../theme/holographic';

// One shared, gentle repeating phase, including surfaces mounted on a later
// screen. Pause in background/when unused; remounting continues the same phase.
export const holographicMotion = new Animated.Value(0);
let leases = 0;
let phase = 0;
let startedAt = null;
let animation = null;
let listener = null;
let generation = 0;
let isActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
const now = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

function pause() {
  generation += 1;
  animation?.stop();
  animation = null;
  if (startedAt !== null) phase = Math.min(1, phase + Math.max(0, now() - startedAt) / HOLOGRAPHIC_DURATION);
  startedAt = null;
  holographicMotion.setValue(phase);
}

function resume() {
  if (!leases || !isActive || animation) return;
  // The highlight is outside the clipped surface at both endpoints and the
  // colour drift has matching endpoints, so this reset has no visible seam.
  if (phase >= 1) { phase = 0; holographicMotion.setValue(0); }
  const run = ++generation;
  startedAt = now();
  animation = Animated.timing(holographicMotion, {
    toValue: 1, duration: Math.max(1, HOLOGRAPHIC_DURATION * (1 - phase)),
    easing: Easing.linear, useNativeDriver: true, isInteraction: false,
  });
  animation.start(({ finished }) => {
    if (run !== generation) return;
    animation = null;
    startedAt = null;
    if (finished) {
      phase = 1;
      holographicMotion.setValue(1);
      resume();
    }
  });
}

export function acquireHolographicMotion() {
  leases += 1;
  if (!listener) {
    isActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    listener = AppState.addEventListener('change', state => {
      isActive = state === 'active';
      if (isActive) resume(); else pause();
    });
  }
  resume();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases -= 1;
    if (leases === 0) { pause(); listener?.remove(); listener = null; }
  };
}
