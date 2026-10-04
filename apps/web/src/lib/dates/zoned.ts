/**
 * Timezone helpers that work in the browser and on the server without a
 * library. Wall times are "YYYY-MM-DDTHH:mm" strings in the given IANA zone.
 */
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parts(instant: Date, timeZone: string) {
  const list = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => list.find((part) => part.type === type)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") === "24" ? "00" : get("hour"), minute: get("minute") };
}

/** Format an ISO instant as a wall time in the zone, for datetime-local inputs. */
export function isoToZonedWallTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Convert a wall time in the zone to an ISO instant. The offset is found by
 * bisection so DST transitions never produce a wrong hour.
 */
export function zonedWallTimeToIso(wall: string, timeZone: string): string | null {
  const match = WALL.exec(wall);
  if (!match) return null;
  const target = wall;
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  if (!Number.isFinite(guess)) return null;
  let low = guess - 36 * 60 * 60 * 1000;
  let high = guess + 36 * 60 * 60 * 1000;
  for (let step = 0; step < 48 && low < high; step += 1) {
    const mid = Math.floor((low + high) / 2 / 60000) * 60000;
    if (isoToZonedWallTime(new Date(mid).toISOString(), timeZone) < target) low = mid + 60000;
    else high = mid;
  }
  const result = new Date(low);
  return isoToZonedWallTime(result.toISOString(), timeZone) === target ? result.toISOString() : null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}
