/**
 * Videos synced together are drifting apart if their frames are more than this many frames out of step.
 * 1 frame of tolerance avoids constant micro-corrections from normal playback jitter.
 */
export const DRIFT_CORRECTION_THRESHOLD_FRAMES = 1;

/**
 * Above this many frames of drift, nudging playbackRate would take too long to catch up, so we
 * snap directly with a hard seek instead (e.g. after a slow network seek desynced the pair).
 */
export const DRIFT_HARD_RESYNC_THRESHOLD_FRAMES = 15;

/**
 * How much faster/slower (as a fraction of normal speed) a lagging/leading video is nudged to
 * play while catching up. Small enough to be imperceptible, applied only while out of tolerance.
 */
export const DRIFT_NUDGE_RATE_OFFSET = 0.1;

/**
 * Decide how to correct drift between a video and the peer it's synced to.
 *
 * Small drift is corrected by briefly nudging playbackRate up/down (imperceptible, no stutter);
 * only drift large enough that a rate nudge would take too long falls back to a hard currentTime
 * seek, which is visibly jarring on a playing <video> so it's a last resort.
 *
 * @param {object} params
 * @param {number} params.selfFrame current frame of the video being corrected
 * @param {number} params.peerFrame current frame of the video it's synced to
 * @param {number} params.framerate frames per second of the video being corrected
 * @param {number} params.currentTime current playback time (seconds) of the video being corrected
 * @param {number} params.duration duration (seconds) of the video being corrected
 * @param {number} params.speed normal (non-nudged) playback speed to return to when in sync
 * @returns {{ action: "none" } | { action: "nudge", playbackRate: number } | { action: "seek", currentTime: number }}
 */
export function computeDriftCorrection({ selfFrame, peerFrame, framerate, currentTime, duration, speed }) {
  const frameDiff = selfFrame - peerFrame; // positive: this video is ahead of its peer
  const absDiff = Math.abs(frameDiff);

  if (absDiff <= DRIFT_CORRECTION_THRESHOLD_FRAMES) {
    return { action: "none" };
  }

  if (absDiff > DRIFT_HARD_RESYNC_THRESHOLD_FRAMES) {
    const correctedTime = currentTime - frameDiff / framerate;

    return { action: "seek", currentTime: Math.max(0, Math.min(correctedTime, duration || correctedTime)) };
  }

  // Ahead of peer -> play slightly slower; behind -> play slightly faster.
  const rateOffset = frameDiff > 0 ? -DRIFT_NUDGE_RATE_OFFSET : DRIFT_NUDGE_RATE_OFFSET;

  return { action: "nudge", playbackRate: speed + rateOffset };
}
