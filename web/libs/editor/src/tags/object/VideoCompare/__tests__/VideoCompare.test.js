import { test, expect, describe } from "bun:test";
import { VideoCompareModel } from "../VideoCompare.js";

/** Minimal fake of HstackVideoCanvas's ref API. */
function createMockRef({ currentFrame = 1, playing = false, duration = 100 } = {}) {
  const state = {
    currentFrame,
    playing,
    duration,
    volume: 1,
  };

  return {
    get playing() {
      return state.playing;
    },
    get currentFrame() {
      return state.currentFrame;
    },
    get duration() {
      return state.duration;
    },
    get volume() {
      return state.volume;
    },
    set volume(v) {
      state.volume = v;
    },
    play: () => {
      state.playing = true;
    },
    pause: () => {
      state.playing = false;
    },
    goToFrame(frame) {
      state.currentFrame = frame;
    },
  };
}

function createItem(overrides = {}) {
  const item = VideoCompareModel.create({
    name: "cmp",
    value: "$video_combined",
    framerate: "24",
    ...overrides,
  });

  item.setLength(100);
  return item;
}

describe("VideoCompare model", () => {
  test("play/pause drive the single combined video", () => {
    const item = createItem();

    item.ref.current = createMockRef();

    item.play();
    expect(item.playing).toBe(true);
    expect(item.ref.current.playing).toBe(true);

    item.pause();
    expect(item.playing).toBe(false);
    expect(item.ref.current.playing).toBe(false);
  });

  test("setFrame moves the video to the exact frame", () => {
    const item = createItem();

    item.ref.current = createMockRef();

    item.setFrame(42);

    expect(item.frame).toBe(42);
    expect(item.ref.current.currentFrame).toBe(42);
  });

  test("stepFrame moves exactly one frame relative to the current frame", () => {
    const item = createItem();

    item.ref.current = createMockRef({ currentFrame: 10 });
    item.setFrame(10);

    item.stepFrame(1);
    expect(item.frame).toBe(11);

    item.stepFrame(-1);
    expect(item.frame).toBe(10);
  });

  test("setFrame clamps to [1, length]", () => {
    const item = createItem();

    item.ref.current = createMockRef();

    item.setFrame(0);
    expect(item.frame).toBe(1);

    item.setFrame(1000);
    expect(item.frame).toBe(100);
  });

  test("setMode toggles between side-by-side and wipe", () => {
    const item = createItem();

    expect(item.mode).toBe("side-by-side");
    item.setMode("wipe");
    expect(item.mode).toBe("wipe");
  });

  test("setDividerPosition clamps to [0, 1]", () => {
    const item = createItem();

    item.setDividerPosition(-0.5);
    expect(item.dividerPosition).toBe(0);

    item.setDividerPosition(1.5);
    expect(item.dividerPosition).toBe(1);

    item.setDividerPosition(0.3);
    expect(item.dividerPosition).toBe(0.3);
  });

  test("setVolume unmutes when raised above zero, toggleMute flips muted", () => {
    const item = createItem();

    item.toggleMute();
    expect(item.muted).toBe(true);

    item.setVolume(0.5);
    expect(item.muted).toBe(false);
    expect(item.volume).toBe(0.5);
  });

  test("toggleTimeUnit flips between seconds and frames, setTimeUnit sets it directly", () => {
    const item = createItem();

    expect(item.timeUnit).toBe("seconds");
    item.toggleTimeUnit();
    expect(item.timeUnit).toBe("frames");
    item.toggleTimeUnit();
    expect(item.timeUnit).toBe("seconds");

    item.setTimeUnit("frames");
    expect(item.timeUnit).toBe("frames");
  });

  test("videoUrl resolves a plain URL value as-is", () => {
    const item = createItem({ value: "https://example.com/combined.mp4" });

    expect(item.videoUrl).toBe("https://example.com/combined.mp4");
  });
});
