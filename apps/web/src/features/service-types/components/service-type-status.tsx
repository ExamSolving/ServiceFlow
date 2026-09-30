import { Badge } from "@/components/ui/badge";

export function ServiceTypeStatus({ active }: { active: boolean }) {
  return <Badge variant={active ? "positive" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

export function formatServiceDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
