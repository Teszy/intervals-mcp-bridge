import { z } from 'zod';
import { athleteSettingsSchema } from '../../../app/athlete-settings/schemas.js';

export const getAthleteSettingsInputSchema = z.strictObject({});

export const getAthleteSettingsOutputSchema = z.object({ settings: athleteSettingsSchema });
