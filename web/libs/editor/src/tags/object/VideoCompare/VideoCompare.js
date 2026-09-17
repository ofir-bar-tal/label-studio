import { getRoot, types } from "mobx-state-tree";
import React from "react";

import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import IsReadyMixin from "../../../mixins/IsReadyMixin";
import { parseValue } from "../../../utils/data";
import ObjectBase from "../Base";

/**
 * VideoCompare tag displays two videos side-by-side (or as a wipe/slider overlay) for
 * classification tasks that compare two videos frame-by-frame. Unlike the Video tag, it does not
 * support drawing per-frame regions — pair it with a classification control (e.g. Choices)
 * via `toName`.
 *
 * The two videos must be pre-combined into a single horizontally-stacked (hstack) video file,
 * e.g. via `ffmpeg -i a.mp4 -i b.mp4 -filter_complex hstack out.mp4` (video A on the left half of
 * every frame, video B on the right half). This is what makes the two views frame-perfect: there
 * is exactly one decode clock, so there is nothing to synchronize at runtime.
 *
 * Use with the following data types: video
 *
 * @example
 * <!--Labeling configuration to compare two videos and classify the pair-->
 * <View>
 *   <VideoCompare name="cmp" value="$video_combined" />
 *   <Choices name="verdict" toName="cmp">
 *     <Choice value="Match" />
 *     <Choice value="Mismatch" />
 *   </Choices>
 * </View>
 * @name VideoCompare
 * @meta_title VideoCompare Tag for Comparing Two Videos
 * @meta_description Customize Label Studio with the VideoCompare tag to classify a pair of videos side-by-side or with a wipe/slider comparison.
 * @param {string} name Name of the element
 * @param {string} value URL of the pre-combined (hstack: left=A, right=B) video
 * @param {number} [framerate=24] video frame rate per second; default is 24; can use task data like `$fps`
 * @param {boolean} [muted=false] muted video
 * @param {number} [height=600] height of the video player
 */

const TagAttrs = types.model({
  value: types.maybeNull(types.string),
  framerate: types.optional(types.string, "24"),
  height: types.optional(types.string, "600"),
  muted: false,
  defaultplaybackspeed: types.optional(types.union(types.string, types.number), "1"),
  minplaybackspeed: types.optional(types.union(types.string, types.number), "0.25"),
});

const Model = types
  .model({
    type: "videocompare",
  })
  .volatile(() => ({
    ref: React.createRef(),
    mode: "side-by-side", // "side-by-side" | "wipe"
    dividerPosition: 0.5, // 0..1, only meaningful in "wipe" mode
    playing: false,
    speed: 1,
    frame: 1,
    length: 1,
    volume: 1,
    timeUnit: "seconds", // "seconds" | "frames" - how the progress bar displays position/duration
  }))
  .views((self) => ({
    get store() {
      return getRoot(self);
    },

    get videoUrl() {
      return parseValue(self.value, self.store.task?.dataObj);
    },
  }))
  .actions((self) => ({
    afterCreate() {
      // normalize framerate — should be string with number of frames per second
      const framerate = Number(parseValue(self.framerate, self.store.task?.dataObj));

      if (!framerate || Number.isNaN(framerate)) self.framerate = "24";
      else if (framerate < 1) self.framerate = String(1 / framerate);
      else self.framerate = String(framerate);

      // normalize playback speed parameters (must match backend/SDK limits)
      const MIN_PLAYBACK_SPEED = 0.05;
      const MIN_DEFAULT_PLAYBACK_SPEED = 0.25;
      const DEFAULT_PLAYBACK_SPEED = 1;
      const MAX_PLAYBACK_SPEED = 10;
      const data = self.store.task?.dataObj;
      const defaultPlaybackSpeed = Number(parseValue(String(self.defaultplaybackspeed), data));
      const minPlaybackSpeed = Number(parseValue(String(self.minplaybackspeed), data));

      self.minplaybackspeed =
        !minPlaybackSpeed || isNaN(minPlaybackSpeed) || minPlaybackSpeed < MIN_PLAYBACK_SPEED
          ? MIN_DEFAULT_PLAYBACK_SPEED
          : Math.min(minPlaybackSpeed, MAX_PLAYBACK_SPEED);

      self.defaultplaybackspeed =
        !defaultPlaybackSpeed || isNaN(defaultPlaybackSpeed) || defaultPlaybackSpeed < MIN_PLAYBACK_SPEED
          ? DEFAULT_PLAYBACK_SPEED
          : Math.min(Math.max(defaultPlaybackSpeed, self.minplaybackspeed), MAX_PLAYBACK_SPEED);

      self.speed = self.defaultplaybackspeed;
    },
  }))
  .actions((self) => ({
    setMode(mode) {
      self.mode = mode;
    },

    setDividerPosition(position) {
      self.dividerPosition = Math.max(0, Math.min(1, position));
    },

    setLength(length) {
      self.length = length;
    },

    setFrame(frame) {
      const clamped = Math.max(1, Math.min(frame, self.length || 1));

      if (self.frame === clamped) return;
      self.frame = clamped;
      self.ref.current?.goToFrame(clamped);
    },

    stepFrame(delta) {
      self.setFrame(self.frame + delta);
    },

    onFrameChange(frame, length) {
      self.frame = frame;
      self.setLength(length);
    },

    play() {
      self.ref.current?.play();
      self.playing = true;
    },

    pause() {
      self.ref.current?.pause();
      self.playing = false;
    },

    togglePlay() {
      if (self.playing) self.pause();
      else self.play();
    },

    handleSpeed(speed) {
      self.speed = Math.max(speed, self.minplaybackspeed);
    },

    setVolume(volume) {
      self.volume = Math.max(0, Math.min(1, volume));
      if (self.volume > 0) self.muted = false;
    },

    toggleMute() {
      self.muted = !self.muted;
    },

    setTimeUnit(unit) {
      self.timeUnit = unit;
    },

    toggleTimeUnit() {
      self.timeUnit = self.timeUnit === "seconds" ? "frames" : "seconds";
    },
  }));

export const VideoCompareModel = types.compose(
  "VideoCompareModel",
  TagAttrs,
  ObjectBase,
  AnnotationMixin,
  Model,
  IsReadyMixin,
);
