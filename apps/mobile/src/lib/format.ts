/** Hour of the day (0–23) in the workspace's time zone, falling back to the phone's. */
function hourIn(timeZone: string, date: Date): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date);
    const value = Number.parseInt(hour, 10);
    if (Number.isFinite(value)) return value % 24;
  } catch {
    // Unknown time zone on this device.
  }
  return date.getHours();
}

export type GreetingKey = 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening';

/** Which greeting fits the time of day in the workspace's time zone. */
export function greetingKey(timeZone: string, date = new Date()): GreetingKey {
  const hour = hourIn(timeZone, date);
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 17) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

/** For example "Sunday, 4 October" (or "रविवार, 4 अक्तूबर"), in the workspace's time zone. */
export function formatToday(timeZone: string, locale = 'en-GB', date = new Date()): string {
  // Format the two parts separately: punctuation for the combined pattern differs between ICU versions.
  const format = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
    } catch {
      return new Intl.DateTimeFormat(locale, options).format(date);
    }
  };
  return `${format({ weekday: 'long' })}, ${format({ day: 'numeric', month: 'long' })}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? '?'];
  return letters.join('').toUpperCase();
}

/** The calendar date in the workspace's time zone as "YYYY-MM-DD", so dates sort and compare as text. */
export function dayKey(timeZone: string, date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(date);
  } catch {
    // Unknown time zone on this device: use the phone's own date.
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}

/** The calendar day after a "YYYY-MM-DD" date. */
export function nextDayKey(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** A time of day such as "10:30" in the workspace's time zone. */
export function formatTime(timeZone: string, locale: string, date: Date): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
}

/** A calendar date ("YYYY-MM-DD") as a short heading, for example "Wed 7 Oct". */
export function formatDayLabel(locale: string, day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  // Format the parts separately: punctuation for the combined pattern differs between ICU versions.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  return `${weekday} ${dayMonth}`;
}

/** When details were last confirmed: "09:15" today, otherwise "4 Oct, 09:15" (in the chosen language). */
export function formatCheckedAt(timeZone: string, locale = 'en-GB', date: Date, now = new Date()): string {
  const format = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
    } catch {
      return new Intl.DateTimeFormat(locale, options).format(date);
    }
  };
  const time = format({ hour: 'numeric', minute: '2-digit' });
  return dayKey(timeZone, date) === dayKey(timeZone, now) ? time : `${format({ day: 'numeric', month: 'short' })}, ${time}`;
}
