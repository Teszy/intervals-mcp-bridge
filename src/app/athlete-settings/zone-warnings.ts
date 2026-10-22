import type { AthleteSettings, AthleteSettingsResponse } from '../../schemas/athlete-settings.js';

/** Preserve upstream values and report non-increasing zone limits without repairing them. */
export function addZoneWarnings(athlete: AthleteSettingsResponse): AthleteSettings {
  const zoneWarnings: NonNullable<AthleteSettings['zoneWarnings']> = [];
  for (const profile of athlete.sportSettings) {
    for (const field of ['hr_zones', 'power_zones', 'pace_zones'] as const) {
      const limits = profile[field];
      if (limits?.some((value, index) => index > 0 && value <= limits[index - 1]!)) {
        zoneWarnings.push({
          sportSettingsId: profile.id,
          types: profile.types,
          field,
          code: 'INVALID_ZONE_LIMITS',
        });
      }
    }
  }
  return zoneWarnings.length > 0 ? { ...athlete, zoneWarnings } : athlete;
}
