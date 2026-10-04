import type { Metadata } from "next";

import { TeamView } from "@/src/features/members/components/team-view";
import { getTeamPage } from "@/src/features/members/services/member.service";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const data = await getTeamPage();
  return <TeamView data={data} />;
}
