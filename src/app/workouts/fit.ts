import {
  Encoder,
  Decoder,
  Profile,
  Stream,
  type FileIdMesg,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from '@garmin/fitsdk';
import { createHash } from 'node:crypto';
import type { PlannedWorkout } from '../../schemas/workouts.js';

/** Accepts a validated, normalized workout. Absolute targets use FIT's HR/power offsets; dynamic fields require raw scales. */
export function encodeWorkoutFit(workout: PlannedWorkout): Uint8Array {
  const hash = createHash('sha256').update(JSON.stringify(workout)).digest();
  const encoder = new Encoder();
  const fileId: FileIdMesg = {
    type: 'workout',
    manufacturer: 'development',
    product: 1,
    serialNumber: hash.readUInt32LE(0) || 1,
    timeCreated: new Date(),
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID!, fileId);
  const workoutMessage: WorkoutMesg = {
    sport: workout.sport === 'Run' ? 'running' : 'cycling',
    numValidSteps: workout.steps.length,
    wktName: workout.name,
  };
  encoder.onMesg(Profile.MesgNum.WORKOUT!, workoutMessage);
  workout.steps.forEach((step, messageIndex) => {
    const target = step.target;
    const targetType = target.type === 'heartRate' ? 'heartRate' : target.type;
    const offset = target.type === 'heartRate' ? 100 : target.type === 'power' ? 1000 : 0;
    const scale = target.type === 'speed' ? 1000 : 1;
    const stepMessage: WorkoutStepMesg = {
      messageIndex,
      wktStepName: step.name,
      intensity: step.intensity,
      durationType: step.duration.type,
      durationValue:
        step.duration.type === 'time' ? step.duration.seconds * 1000 : step.duration.meters * 100,
      targetType,
      targetValue: 0,
      ...(target.type === 'open'
        ? {}
        : {
            customTargetValueLow: Math.round(target.low * scale) + offset,
            customTargetValueHigh: Math.round(target.high * scale) + offset,
          }),
    };
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP!, stepMessage);
  });
  const bytes = encoder.close();
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.checkIntegrity())
    throw new Error('Generated workout failed FIT integrity validation.');
  const decoded = decoder.read();
  if (decoded.errors.length || decoded.messages.workoutStepMesgs?.length !== workout.steps.length) {
    throw new Error('Generated workout failed FIT message validation.');
  }
  return bytes;
}
