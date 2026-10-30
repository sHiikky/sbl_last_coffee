import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Stay still until the system preference is known, including on web.
export default function useMotionPreference() {
  const [preference, setPreference] = useState(null);
  useEffect(() => {
    let active = true;
    let changed = false;
    const apply = value => { changed = true; if (active) setPreference(!!value); };
    let subscription;
    try { subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', apply); } catch (_) {}
    try {
      Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.() ?? false)
        .then(value => { if (active && !changed) setPreference(!!value); })
        .catch(() => { if (active && !changed) setPreference(true); });
    } catch (_) { setPreference(true); }
    return () => { active = false; subscription?.remove?.(); };
  }, []);
  return { reduceMotion: preference !== false, ready: preference !== null };
}
