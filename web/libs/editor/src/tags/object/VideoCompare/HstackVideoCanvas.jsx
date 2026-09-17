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

    const [loading, setLoading] = useState(true);

    const draw = useCallback(() => {
      const video = videoRef.current;
      const ctx = contextRef.current;
      const natural = naturalSizeRef.current;

      if (!video || !ctx || !natural || width === 0 || height === 0) return;

      const { halfWidth, height: srcHeight } = natural;

      ctx.clearRect(0, 0, width, height);

      if (mode === "wipe") {
        // Contain-fit a single half's aspect ratio into the pane, then composite both halves
        // stretched over that same region, clipping video B to the right of the divider.
        const scale = Math.min(width / halfWidth, height / srcHeight);
        const drawW = halfWidth * scale;
        const drawH = srcHeight * scale;
        const offsetX = (width - drawW) / 2;
        const offsetY = (height - drawH) / 2;

        ctx.drawImage(video, 0, 0, halfWidth, srcHeight, offsetX, offsetY, drawW, drawH);

        const dividerX = offsetX + drawW * dividerPosition;

        ctx.save();
        ctx.beginPath();
        ctx.rect(dividerX, offsetY, offsetX + drawW - dividerX, drawH);
        ctx.clip();
        ctx.drawImage(video, halfWidth, 0, halfWidth, srcHeight, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      } else {
        // Side-by-side: the combined frame already shows both videos next to each other.
        const fullWidth = halfWidth * 2;
        const scale = Math.min(width / fullWidth, height / srcHeight);
        const drawW = fullWidth * scale;
        const drawH = srcHeight * scale;
        const offsetX = (width - drawW) / 2;
        const offsetY = (height - drawH) / 2;

        ctx.drawImage(video, 0, 0, fullWidth, srcHeight, offsetX, offsetY, drawW, drawH);
      }
    }, [mode, dividerPosition, width, height]);

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

      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onPause);
      video.addEventListener("seeked", onSeeked);

      return () => {
        running = false;
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onPause);
        video.removeEventListener("seeked", onSeeked);
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
      }),
      [framerate],
    );

    useEffect(() => {
      const canvas = canvasRef.current;

      if (canvas) contextRef.current = canvas.getContext("2d");
    }, []);

    return (
      <div style={{ position: "relative", width, height }}>
        <canvas ref={canvasRef} width={width} height={height} style={{ display: "block" }} />
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
        <video
          ref={videoRef}
          src={src}
          crossOrigin="anonymous"
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
