import {
  computeDriftCorrection,
  DRIFT_CORRECTION_THRESHOLD_FRAMES,
  DRIFT_HARD_RESYNC_THRESHOLD_FRAMES,
} from "../videoDrift";

describe("computeDriftCorrection", () => {
  test("does nothing within tolerance", () => {
    const result = computeDriftCorrection({
      selfFrame: 11,
      peerFrame: 10,
      framerate: 24,
      currentTime: 10 / 24,
      duration: 100,
      speed: 1,
    });

    expect(result).toEqual({ action: "none" });
  });

  test("boundary: exactly at the tolerance threshold is still a no-op", () => {
    const result = computeDriftCorrection({
      selfFrame: 10 + DRIFT_CORRECTION_THRESHOLD_FRAMES,
      peerFrame: 10,
      framerate: 24,
      currentTime: 10 / 24,
      duration: 100,
      speed: 1,
    });

    expect(result).toEqual({ action: "none" });
  });

  test("nudges playbackRate down when ahead of peer", () => {
    const result = computeDriftCorrection({
      selfFrame: 20,
      peerFrame: 17,
      framerate: 24,
      currentTime: 19 / 24,
      duration: 100,
      speed: 1,
    });

    expect(result.action).toBe("nudge");
    expect(result.playbackRate).toBeLessThan(1);
  });

  test("nudges playbackRate up when behind peer", () => {
    const result = computeDriftCorrection({
      selfFrame: 17,
      peerFrame: 20,
      framerate: 24,
      currentTime: 16 / 24,
      duration: 100,
      speed: 1,
    });

    expect(result.action).toBe("nudge");
    expect(result.playbackRate).toBeGreaterThan(1);
  });

  test("nudge offset is centered on the given speed, not always 1", () => {
    const result = computeDriftCorrection({
      selfFrame: 17,
      peerFrame: 20,
      framerate: 24,
      currentTime: 16 / 24,
      duration: 100,
      speed: 1.5,
    });

    expect(result.action).toBe("nudge");
    expect(result.playbackRate).toBeGreaterThan(1.5);
  });

  test("falls back to a hard seek beyond the hard-resync threshold", () => {
    const framerate = 24;
    const selfFrame = 10 + DRIFT_HARD_RESYNC_THRESHOLD_FRAMES + 1;
    const peerFrame = 10;
    const result = computeDriftCorrection({
      selfFrame,
      peerFrame,
      framerate,
      currentTime: (selfFrame - 1) / framerate,
      duration: 100,
      speed: 1,
    });

    expect(result.action).toBe("seek");
    // Corrected time should land where the peer's frame is, using this video's own framerate.
    expect(result.currentTime).toBeCloseTo((peerFrame - 1) / framerate, 5);
  });

  test("clamps the hard-seek target to [0, duration]", () => {
    const framerate = 24;
    const result = computeDriftCorrection({
      selfFrame: 100,
      peerFrame: 10,
      framerate,
      currentTime: 1,
      duration: 0.5,
      speed: 1,
    });

    expect(result.action).toBe("seek");
    expect(result.currentTime).toBeLessThanOrEqual(0.5);
    expect(result.currentTime).toBeGreaterThanOrEqual(0);
  });
});
