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
