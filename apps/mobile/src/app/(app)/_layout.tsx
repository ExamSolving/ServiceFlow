import { Stack } from 'expo-router';

import { JobsProvider } from '@/providers/jobs-provider';

/** Screens for a signed-in technician: My jobs, a job, and jobs done recently. */
export default function TechnicianLayout() {
  return (
    <JobsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </JobsProvider>
  );
}
