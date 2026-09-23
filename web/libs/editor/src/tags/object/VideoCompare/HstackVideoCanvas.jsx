import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Renders a single pre-combined (hstack: left=video A, right=video B) video file, either as a
 * plain side-by-side view (the raw combined frame, contained to fit) or as a wipe/slider overlay
 * (both halves stretched to the full pane, composited with a canvas clip at the divider).
 *
 * Because both "videos" are really just the left/right half of ONE decoded frame from ONE
 * <video> element, there is exactly one playback clock - the two halves can never drift apart,
 * so none of the cross-video sync machinery the two-file approach needed exists here at all.
 */
export const HstackVideoCanvas = forwardRef(
  (
    {
      src,
      width = 0,
      height = 0,
      mode,
      dividerPosition = 0.5,
      framerate = 24,
      speed = 1,
      muted = false,
      onLoad,
      onFrameChange,
      onEnded,
      onError,
    },
    ref,
  ) => {
    const videoRef = useRef();
    const canvasRef = useRef();
    const contextRef = useRef(null);
    const naturalSizeRef = useRef(null); // { halfWidth, height } - one half's native pixel size
    const currentFrameRef = useRef(1);
    const lengthRef = useRef(1);
    // Mirrors the `dividerPosition` prop, but can also be updated directly via the imperative
    // handle's `setDividerPosition` - lets a drag redraw every frame without going through
    // React/MST, so drag latency isn't tied to render cost.
    const dividerPositionRef = useRef(dividerPosition);

    const [loading, setLoading] = useState(true);

    const draw = useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      const natural = naturalSizeRef.current;

      if (!video || !canvas || !ctx || !natural || width === 0 || height === 0) return;

      // Size the canvas's backing store to the pane's real physical pixels (CSS size x device
      // pixel ratio), not just its CSS size - otherwise a large pane on a Retina/4K display gets
      // silently downsampled to its CSS pixel count regardless of how much detail the source
      // video actually has. Reassigning canvas.width/height clears the bitmap, so only do it
      // when the target size actually changed.
      const dpr = window.devicePixelRatio || 1;
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);

      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      const { halfWidth, height: srcHeight } = natural;

      ctx.clearRect(0, 0, backingWidth, backingHeight);

      if (mode === "wipe") {
        // Contain-fit a single half's aspect ratio into the pane, then composite both halves
        // stretched over that same region, clipping video B to the right of the divider.
        const scale = Math.min(backingWidth / halfWidth, backingHeight / srcHeight);
        const drawW = halfWidth * scale;
        const drawH = srcHeight * scale;
        const offsetX = (backingWidth - drawW) / 2;
        const offsetY = (backingHeight - drawH) / 2;

        ctx.drawImage(video, 0, 0, halfWidth, srcHeight, offsetX, offsetY, drawW, drawH);

        const dividerX = offsetX + drawW * dividerPositionRef.current;

        ctx.save();
        ctx.beginPath();
        ctx.rect(dividerX, offsetY, offsetX + drawW - dividerX, drawH);
        ctx.clip();
        ctx.drawImage(video, halfWidth, 0, halfWidth, srcHeight, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      } else {
        // Side-by-side: the combined frame already shows both videos next to each other.
        const fullWidth = halfWidth * 2;
        const scale = Math.min(backingWidth / fullWidth, backingHeight / srcHeight);
        const drawW = fullWidth * scale;
        const drawH = srcHeight * scale;
        const offsetX = (backingWidth - drawW) / 2;
        const offsetY = (backingHeight - drawH) / 2;

        ctx.drawImage(video, 0, 0, fullWidth, srcHeight, offsetX, offsetY, drawW, drawH);
      }
    }, [mode, width, height]);

    useEffect(() => {
      dividerPositionRef.current = dividerPosition;
      draw();
    }, [dividerPosition, draw]);

    const updateFrame = useCallback(
      (force = false) => {
        const video = videoRef.current;

        if (!video || !naturalSizeRef.current) return;

        const frame = Math.max(1, Math.min(Math.round(video.currentTime * framerate) + 1, lengthRef.current || 1));

        if (force || frame !== currentFrameRef.current) {
          currentFrameRef.current = frame;
          onFrameChange?.(frame, lengthRef.current);
        }
        draw();
      },
      [draw, framerate, onFrameChange],
    );

    // Always call the latest updateFrame (bound to the latest draw/mode/dividerPosition/size),
    // not whatever it happened to be when the play/pause listeners below were first attached -
    // otherwise a mode or divider change made while already playing would never be reflected.
    const updateFrameRef = useRef(updateFrame);

    updateFrameRef.current = updateFrame;

    // Playback loop: redraw + recompute the current frame on every actually-presented frame,
    // via requestVideoFrameCallback where supported (falls back to requestAnimationFrame). Set
    // up once per mount: play/pause can happen many times over the component's lifetime, so the
    // loop must be able to restart every time "play" fires, not just the first.
    useEffect(() => {
      const video = videoRef.current;

      if (!video) return;

      let handle;
      let running = false;

      const tick = () => {
        if (!running) return;
        updateFrameRef.current();
        handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
      };

      const onPlay = () => {
        running = true;
        handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
      };
      const onPause = () => {
        running = false;
        if (video.requestVideoFrameCallback) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
        updateFrameRef.current(true);
      };
      const onSeeked = () => updateFrameRef.current(true);
      // "loadedmetadata" (which triggers the first draw, in handleLoadedMetadata) only guarantees
      // duration/dimensions are known - the browser may not have decoded an actual frame yet, so
      // that first draw can paint nothing and leave the canvas black. "loadeddata" guarantees a
      // real decoded frame is available, so redraw again once it fires to show frame one before
      // playback starts.
      const onLoadedData = () => updateFrameRef.current(true);

      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onPause);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("loadeddata", onLoadedData);

      return () => {
        running = false;
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onPause);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadeddata", onLoadedData);
        if (video.requestVideoFrameCallback) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      };
    }, []);

    // Redraw whenever the pane size or view mode/divider changes (no new frame decoded, just a
    // different crop of the one we already have).
    useEffect(() => {
      draw();
    }, [draw]);

    useEffect(() => {
      if (videoRef.current) videoRef.current.playbackRate = speed;
    }, [speed]);

    useEffect(() => {
      if (videoRef.current) videoRef.current.muted = muted;
    }, [muted]);

    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;

      if (!video) return;

      const halfWidth = video.videoWidth / 2;
      const height = video.videoHeight;
      const length = Math.round(video.duration * framerate);

      naturalSizeRef.current = { halfWidth, height };
      lengthRef.current = length;
      setLoading(false);
      updateFrame(true);

      onLoad?.({ length, videoDimensions: { width: halfWidth, height } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [framerate]);

    const handleError = useCallback(
      (e) => {
        onError?.(e.target?.error ?? e);
      },
      [onError],
    );

    useImperativeHandle(
      ref,
      () => ({
        get playing() {
          return videoRef.current ? !videoRef.current.paused : false;
        },
        get currentFrame() {
          return currentFrameRef.current;
        },
        get duration() {
          return videoRef.current?.duration ?? 0;
        },
        get volume() {
          return videoRef.current?.volume ?? 1;
        },
        set volume(value) {
          if (videoRef.current) videoRef.current.volume = value;
        },
        play() {
          videoRef.current?.play();
        },
        pause() {
          videoRef.current?.pause();
        },
        goToFrame(frame) {
          const video = videoRef.current;

          if (!video) return;
          const clamped = Math.max(1, Math.min(frame, lengthRef.current || 1));

          video.currentTime = (clamped - 1) / framerate;
        },
        // Redraws immediately at the given divider position without going through React/MST -
        // used while actively dragging the wipe divider, so drag latency is independent of
        // render cost. The `dividerPosition` prop still drives the ref on every normal render.
        setDividerPosition(position) {
          dividerPositionRef.current = position;
          draw();
        },
      }),
      [framerate, draw],
    );

    useEffect(() => {
      const canvas = canvasRef.current;

      if (canvas) contextRef.current = canvas.getContext("2d");
    }, []);

    return (
      <div style={{ position: "relative", width, height }}>
        {/*
          No width/height attrs here: draw() sets canvas.width/height imperatively to the pane's
          physical pixel size (CSS size x devicePixelRatio), so leaving React in control of these
          attributes would reset the backing store to the CSS size (and clear it) on every render.
        */}
        <canvas ref={canvasRef} style={{ width, height, display: "block" }} />
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-neutral-content-subtler, #999)",
            }}
          >
            Loading…
          </div>
        )}
        {/*
          No crossOrigin attr: we only ever drawImage() this video onto the canvas for display,
          never read pixels back out (no getImageData/toDataURL/toBlob), so a "tainted" canvas
          from a cross-origin, non-CORS video is harmless here. Adding crossOrigin="anonymous"
          would force the browser to require CORS headers from wherever `src` is hosted (e.g. a
          plain S3 bucket with no CORS policy), breaking playback for no benefit. Revisit if a
          future feature needs to read canvas pixels (e.g. frame export/thumbnail capture).
        */}
        <video
          ref={videoRef}
          src={src}
          preload="auto"
          muted={muted}
          playsInline
          style={{ display: "none" }}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          onEnded={onEnded}
        />
      </div>
    );
  },
);

HstackVideoCanvas.displayName = "HstackVideoCanvas";
