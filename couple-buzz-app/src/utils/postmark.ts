// Friendly timezone labels for the timezones the user can pick in Settings.
// Anything not in this map falls back to the IANA shortOffset (e.g. "GMT+9").
export const TZ_FRIENDLY: Record<string, string> = {
  'Asia/Shanghai': '北京时间',
  'Asia/Hong_Kong': '香港时间',
  'Asia/Taipei': '台北时间',
  'Asia/Tokyo': '东京时间',
  'Asia/Seoul': '首尔时间',
  'Asia/Singapore': '新加坡时间',
  'America/New_York': '纽约时间',
  'America/Los_Angeles': '洛杉矶时间',
  'America/Chicago': '芝加哥时间',
  'Europe/London': '伦敦时间',
  'Europe/Paris': '巴黎时间',
  'Europe/Berlin': '柏林时间',
  'Australia/Sydney': '悉尼时间',
};

// Human-readable name for a timezone — falls back to the GMT+N offset for
// any zone not pinned in TZ_FRIENDLY (e.g. an auto-detected device tz that
// doesn't match a Settings preset).
export function friendlyTzName(tz: string, refDate: Date = new Date()): string {
  if (TZ_FRIENDLY[tz]) return TZ_FRIENDLY[tz];
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(refDate);
    return parts.find(p => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}

// "北京时间 04-27 20:34" — formats an ISO timestamp in the given timezone
// for postmark / signature display. Intentionally locale-fixed (en-CA for
// "MM-DD", en-GB for "HH:mm") so the output stays identical regardless of
// the device's locale.
export function formatPostmark(iso: string, tz: string): string {
  try {
    const date = new Date(iso);
    const md = date.toLocaleDateString('en-CA', { timeZone: tz, month: '2-digit', day: '2-digit' });
    const hm = date.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    return `${friendlyTzName(tz, date)} ${md} ${hm}`;
  } catch {
    return iso.slice(0, 10);
  }
}

// Returns the offset (in minutes) such that
//   (UTC ms) + offset*60_000 = (local ms in `tz`)
// Computed by formatting the date in the target tz, parsing the resulting
// y/m/d/h/m/s back as UTC, and diffing with the original UTC ms. Avoids
// `timeZoneName: 'shortOffset'`, which Hermes/older RN runtimes don't
// always honor — when the regex fell through, the picked time silently
// got treated as UTC, which was the source of the "18:00 NY shows as
// 14:00 NY" preview bug.
function tzOffsetMinutes(date: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const obj: Record<string, string> = {};
    for (const p of parts) obj[p.type] = p.value;
    // Some runtimes report midnight as "24" instead of "00" — normalize.
    const hour = obj.hour === '24' ? 0 : Number(obj.hour);
    const asUtc = Date.UTC(
      Number(obj.year),
      Number(obj.month) - 1,
      Number(obj.day),
      hour,
      Number(obj.minute),
      Number(obj.second || 0),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

// Convert "year/month/day/hour/minute interpreted in `tz`" to an absolute
// UTC ISO instant. Used by the 择日达 picker — the sender chooses a
// hour:minute in their own local clock, and we send the equivalent UTC
// instant so the recipient (in any tz) sees the same moment.
//
// Two-pass: first guess the offset at the naive UTC point, then refine
// once after applying it so the result stays correct across DST
// boundaries (the offset at the candidate UTC instant may differ from
// the offset at the naive instant).
export function toUtcIsoFromLocalParts(
  year: number,
  month: number,    // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string
): string {
  const naiveMs = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = tzOffsetMinutes(new Date(naiveMs), tz);
  let utcMs = naiveMs - offset1 * 60_000;
  const offset2 = tzOffsetMinutes(new Date(utcMs), tz);
  if (offset2 !== offset1) {
    utcMs = naiveMs - offset2 * 60_000;
  }
  return new Date(utcMs).toISOString();
}

// Days in (year, month). month is 1-12. Day-of-month picker uses this to
// clamp 31→30/29/28 when the user changes year/month.
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Today's local date in `tz` as {year, month, day} — used to seed the
// picker with "tomorrow at 9am" and to validate "must be in the future".
export function localDateParts(tz: string, ref: Date = new Date()): { year: number; month: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(ref);
    const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'month')!.value, 10);
    const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
    return { year: y, month: m, day: d };
  } catch {
    return { year: ref.getUTCFullYear(), month: ref.getUTCMonth() + 1, day: ref.getUTCDate() };
  }
}
