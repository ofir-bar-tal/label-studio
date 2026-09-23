import { VideoModel } from "../Video.js";

/**
 * Minimal fake of the VideoCanvas `VideoRef` API, enough to exercise
 * Video.js's sync/drift logic without rendering React or a real <video>.
 */
function createMockRef({ currentFrame = 1, playing = false, framerate = 24, duration = 100 } = {}) {
  const state = {
    currentFrame,
    playing,
    currentTime: (currentFrame - 1) / framerate,
    duration,
    playbackRate: 1,
  };

  return {
    get currentFrame() {
      return state.currentFrame;
    },
    get playing() {
      return state.playing;
    },
    get currentTime() {
      return state.currentTime;
    },
    set currentTime(time) {
      state.currentTime = time;
      state.currentFrame = Math.round(time * framerate) + 1;
    },
    get duration() {
      return state.duration;
    },
    get playbackRate() {
      return state.playbackRate;
    },
    set playbackRate(rate) {
      state.playbackRate = rate;
    },
    play() {
      state.playing = true;
    },
    pause() {
      state.playing = false;
    },
    frameSteppedTime(time) {
      return time ?? state.currentTime;
    },
    goToFrame(frame) {
      const frameZeroBased = frame - 1;
      state.currentTime = frameZeroBased / framerate;
      state.currentFrame = frame;
    },
  };
}

function createSyncedPair({ framerateA = 24, framerateB = 24 } = {}) {
  const a = VideoModel.create({ name: "video_a", value: "$video_a", sync: "video_b", framerate: String(framerateA) });
  const b = VideoModel.create({ name: "video_b", value: "$video_b", sync: "video_a", framerate: String(framerateB) });

  return { a, b };
}

describe("Video frame-accurate sync", () => {
  test("triggerSync broadcasts an explicit frame index, not just raw time", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 10, framerate: 24 });
    b.ref.current = createMockRef({ currentFrame: 1, framerate: 24 });

    a.handleSeek();

    // b should have been moved to the exact frame a was on, not an approximated time.
    expect(b.ref.current.currentFrame).toBe(10);
  });

  test("receiving side converts frame to time using its own fps, not the origin's raw time", () => {
    // Paired videos are guaranteed identical fps/frame-count in production, but the sync
    // math should still be fps-agnostic on the receiving end.
    const { a, b } = createSyncedPair({ framerateA: 24, framerateB: 30 });

    a.ref.current = createMockRef({ currentFrame: 48, framerate: 24 });
    b.ref.current = createMockRef({ currentFrame: 1, framerate: 30 });

    a.handleSeek();

    expect(b.ref.current.currentFrame).toBe(48);
    // (48 - 1) / 30, using b's own framerate, not a's.
    expect(b.ref.current.currentTime).toBeCloseTo(47 / 30, 5);
  });

  test("handleSync is a no-op when the target is already on the synced frame", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 5, framerate: 24 });
    b.ref.current = createMockRef({ currentFrame: 5, framerate: 24 });

    const timeBefore = b.ref.current.currentTime;

    a.handleSeek();

    expect(b.ref.current.currentTime).toBe(timeBefore);
  });
});

describe("Video drift correction", () => {
  test("gently nudges playbackRate (not a hard seek) for small drift, in the direction that closes the gap", () => {
    const { a, b } = createSyncedPair();

    // a is ahead of b by 3 frames - within the hard-resync threshold, so it should be corrected
    // by slowing a down slightly rather than jumping its currentTime (which would stutter).
    a.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 17, framerate: 24, playing: true });

    const frameBefore = a.ref.current.currentFrame;

    a.checkDriftCorrection();

    expect(a.ref.current.currentFrame).toBe(frameBefore);
    expect(a.ref.current.playbackRate).toBeLessThan(1);
  });

  test("speeds up a lagging video slightly to catch up to its peer", () => {
    const { a, b } = createSyncedPair();

    // a is behind b by 3 frames.
    a.ref.current = createMockRef({ currentFrame: 17, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });

    a.checkDriftCorrection();

    expect(a.ref.current.playbackRate).toBeGreaterThan(1);
  });

  test("falls back to a hard seek when drift is too large for a rate nudge to catch up reasonably", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 100, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 10, framerate: 24, playing: true });

    a.checkDriftCorrection();

    expect(a.ref.current.currentFrame).toBe(10);
    expect(a.ref.current.playbackRate).toBe(1);
  });

  test("restores normal playback speed once back within tolerance", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 17, framerate: 24, playing: true });

    a.checkDriftCorrection();
    expect(a.ref.current.playbackRate).not.toBe(1);

    // Peer catches up; drift is now within tolerance.
    b.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });
    a.checkDriftCorrection();

    expect(a.ref.current.playbackRate).toBe(1);
  });

  test("does not correct when drift is within the 1-frame tolerance", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 11, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 10, framerate: 24, playing: true });

    const timeBefore = a.ref.current.currentTime;

    a.checkDriftCorrection();

    expect(a.ref.current.currentTime).toBe(timeBefore);
    expect(a.ref.current.playbackRate).toBe(1);
  });

  test("does nothing while this video is paused", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: false });
    b.ref.current = createMockRef({ currentFrame: 5, framerate: 24, playing: true });

    const timeBefore = a.ref.current.currentTime;

    a.checkDriftCorrection();

    expect(a.ref.current.currentTime).toBe(timeBefore);
  });

  test("does nothing when the peer isn't playing (e.g. still buffering)", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 5, framerate: 24, playing: false });

    const timeBefore = a.ref.current.currentTime;

    a.checkDriftCorrection();

    expect(a.ref.current.currentTime).toBe(timeBefore);
  });

  test("stopDriftNudge restores normal speed", () => {
    const { a, b } = createSyncedPair();

    a.ref.current = createMockRef({ currentFrame: 20, framerate: 24, playing: true });
    b.ref.current = createMockRef({ currentFrame: 17, framerate: 24, playing: true });

    a.checkDriftCorrection();
    expect(a.ref.current.playbackRate).not.toBe(1);

    a.stopDriftNudge();

    expect(a.ref.current.playbackRate).toBe(1);
  });
});
