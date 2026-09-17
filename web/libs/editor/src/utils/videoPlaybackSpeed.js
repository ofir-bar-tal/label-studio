import { parseValue } from "./data";

// Must match backend/SDK limits.
const MIN_PLAYBACK_SPEED = 0.05;
const MIN_DEFAULT_PLAYBACK_SPEED = 0.25;
const DEFAULT_PLAYBACK_SPEED = 1;
const MAX_PLAYBACK_SPEED = 10;

/**
 * Normalizes a video tag's `defaultplaybackspeed`/`minplaybackspeed` attrs (which may be raw
 * strings, task-data references like `$speed`, or out-of-range numbers) into valid numbers,
 * clamped to the range the backend/SDK also enforce.
 */
export function normalizePlaybackSpeed({ defaultplaybackspeed, minplaybackspeed, data }) {
  const defaultPlaybackSpeed = Number(parseValue(String(defaultplaybackspeed), data));
  const minPlaybackSpeed = Number(parseValue(String(minplaybackspeed), data));

  const normalizedMin =
    !minPlaybackSpeed || Number.isNaN(minPlaybackSpeed) || minPlaybackSpeed < MIN_PLAYBACK_SPEED
      ? MIN_DEFAULT_PLAYBACK_SPEED
      : Math.min(minPlaybackSpeed, MAX_PLAYBACK_SPEED);

  const normalizedDefault =
    !defaultPlaybackSpeed || Number.isNaN(defaultPlaybackSpeed) || defaultPlaybackSpeed < MIN_PLAYBACK_SPEED
      ? DEFAULT_PLAYBACK_SPEED
      : Math.min(Math.max(defaultPlaybackSpeed, normalizedMin), MAX_PLAYBACK_SPEED);

  return { minplaybackspeed: normalizedMin, defaultplaybackspeed: normalizedDefault };
}
