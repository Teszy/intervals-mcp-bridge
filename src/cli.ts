import { IntervalsClient } from './intervals/client.js';

const usage =
  'Usage: pnpm activities [days]\nFetch recent activities (default: 7 days, range: 1–365).';
const args = process.argv.slice(2);

try {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
  } else {
    const days = args.length === 0 ? 7 : Number(args[0]);
    if (args.length > 1 || !Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error(usage);
    }
    const activities = await new IntervalsClient().getRecentActivities(days);
    console.log(`Found ${activities.length} activities in the last ${days} days.`);
    if (activities.length > 0) console.table(activities);
  }
} catch (error: unknown) {
  // The client exposes sanitized errors; never print credentials or raw HTTP objects.
  console.error(error instanceof Error ? error.message : 'Unable to fetch activities.');
  process.exitCode = 1;
}
