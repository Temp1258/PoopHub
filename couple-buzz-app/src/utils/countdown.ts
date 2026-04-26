import { useEffect, useState } from 'react';

const BJT_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400000;

export interface Countdown {
  hh: string;
  mm: string;
  ss: string;
  totalSec: number;
  done: boolean;
}

function compute(targetMs: number, nowMs: number): Countdown {
  const left = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(left / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return {
    hh: String(hh).padStart(2, '0'),
    mm: String(mm).padStart(2, '0'),
    ss: String(ss).padStart(2, '0'),
    totalSec,
    done: totalSec === 0,
  };
}

// Counts down to a UTC timestamp, ticking once per second.
// Pass null when the target isn't ready; returned countdown is zeroed.
export function useCountdown(target: Date | string | null): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return compute(0, now);
  const targetMs = typeof target === 'string' ? Date.parse(target) : target.getTime();
  return compute(targetMs, now);
}

// Counts down to the next Beijing-time (UTC+8) midnight, auto-rolling each day.
export function useBeijingMidnightCountdown(): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const bjtNow = now + BJT_OFFSET_MS;
  let bjtMidnight = Math.ceil(bjtNow / DAY_MS) * DAY_MS;
  if (bjtMidnight === bjtNow) bjtMidnight += DAY_MS;
  return compute(bjtMidnight - BJT_OFFSET_MS, now);
}
