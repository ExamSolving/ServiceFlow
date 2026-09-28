export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  return `${parts.find(p=>p.type==="year")!.value}-${parts.find(p=>p.type==="month")!.value}-${parts.find(p=>p.type==="day")!.value}`;
}

// Find a calendar boundary in the organization's timezone. Never assume a day is 24 hours.
function startOfLocalDate(date:string, timezone:string): Date {
  const center = Date.parse(`${date}T00:00:00Z`);
  let low=center-36*60*60*1000, high=center+36*60*60*1000;
  while(low<high){const mid=Math.floor((low+high)/2);if(localDate(new Date(mid),timezone)<date)low=mid+1;else high=mid;}
  return new Date(low);
}
export function dayRange(date:string,timezone:string):{start:Date;end:Date}{
  const next = new Date(`${date}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
  return {start:startOfLocalDate(date,timezone),end:startOfLocalDate(next.toISOString().slice(0,10),timezone)};
}
