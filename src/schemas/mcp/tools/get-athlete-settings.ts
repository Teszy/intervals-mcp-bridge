import { z } from 'zod';
import { athleteSettingsSchema } from '../../athlete-settings.js';

export const getAthleteSettingsInputSchema = z.strictObject({});

export const getAthleteSettingsOutputSchema = z.object({ settings: athleteSettingsSchema });
