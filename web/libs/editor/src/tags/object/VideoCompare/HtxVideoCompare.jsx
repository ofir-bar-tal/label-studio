import { useCallback, useEffect, useRef, useState } from "react";

import { ErrorMessage } from "../../../components/ErrorMessage/ErrorMessage";
import ObjectTag from "../../../components/Tags/Object";
import { useFullscreen } from "../../../hooks/useFullscreen";
import { useToggle } from "../../../hooks/useToggle";
import { cn } from "../../../utils/bem";
import ResizeObserver from "../../../utils/resize-observer";
import { clamp } from "../../../utils/utilities";
import { CompareControls } from "./CompareControls";
import { HstackVideoCanvas } from "./HstackVideoCanvas";
import "./VideoCompare.scss";

/**
 * The divider drags itself: during a drag it writes the new position straight onto the divider's
 * DOM node and directly into the canvas's imperative handle (no MST/React round trip per pixel,
 * so there's zero re-render latency behind the cursor) and only commits the final position to
 * the model on release. A rAF gate coalesces mousemove bursts to at most one write per frame.
 *
 * `contentRect` is the actual on-screen video area (contain-fit, so it can be narrower than the
 * pane with blank margins on the sides) - the same rectangle HstackVideoCanvas's own wipe-clip
 * math uses. Positioning/dragging against the full pane width instead would only line up with the
 * canvas's clip boundary at the exact center, drifting apart toward the edges whenever the pane's
 * aspect ratio doesn't match the video's.
 */
const DividerHandle = ({ position, onCommit, containerRef, dividerRef, canvasRef, contentRect }) => {
  const { offsetX, contentWidth } = contentRect;

  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault();

      let rafId = null;
      let latestPct = position;

      const applyPct = (pct) => {
        latestPct = pct;
        if (dividerRef.current) dividerRef.current.style.left = `${offsetX + contentWidth * pct}px`;
        canvasRef.current?.setDividerPosition(pct);
      };

      const onMouseMove = (moveEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();

        if (!rect || contentWidth === 0) return;
        const pct = clamp((moveEvent.clientX - rect.left - offsetX) / contentWidth, 0, 1);

        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          applyPct(pct);
        });
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
        onCommit(latestPct);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [position, onCommit, containerRef, dividerRef, canvasRef, offsetX, contentWidth],
  );

  return (
    <div
      ref={dividerRef}
      className={cn("video-compare").elem("divider").toClassName()}
      style={{ left: `${offsetX + contentWidth * position}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className={cn("video-compare").elem("divider-handle").toClassName()} />
    </div>
  );
};

const HtxVideoCompareView = ({ item }) => {
  if (!item.videoUrl) return null;

  const mainContentRef = useRef();
  const containerRef = useRef();
  const dividerRef = useRef();
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState([]);
  const [stageSize, setStageSize] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);

  const [isFullScreen, enterFullscreen, exitFullscreen, toggleFullscreen] = useToggle(false);
  const fullscreen = useFullscreen({
    onEnterFullscreen() {
      enterFullscreen();
    },
    onExitFullscreen() {
      exitFullscreen();
    },
  });

  useEffect(() => {
    const fullscreenElement = fullscreen.getElement();

    if (isFullScreen && !fullscreenElement) {
      fullscreen.enter(mainContentRef.current);
    } else if (!isFullScreen && fullscreenElement) {
      fullscreen.exit();
    }
  }, [isFullScreen]);

  useEffect(() => {
    const el = containerRef.current;

    if (!el) return;

    const observer = new ResizeObserver(() => {
      const width = Math.floor(el.clientWidth);
      const height = Math.floor(el.clientHeight);

      setStageSize((prev) => (prev && prev[0] === width && prev[1] === height ? prev : [width, height]));
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const handleLoad = useCallback(
    ({ length, videoDimensions }) => {
      setLoaded(true);
      setNaturalSize(videoDimensions);
      item.setLength(length);
    },
    [item],
  );

  useEffect(() => {
    if (item.ref.current) item.ref.current.volume = item.volume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.volume, loaded]);

  const handleFrameChange = useCallback(
    (frame) => {
      item.onFrameChange(frame);
    },
    [item],
  );

  const handleError = useCallback((error) => {
    setErrors((prev) => [...prev, `Failed to load video: ${error?.message ?? String(error)}`]);
  }, []);

  const handleEnded = useCallback(() => item.pause(), [item]);

  const handleDividerCommit = useCallback(
    (pct) => {
      item.setDividerPosition(pct);
    },
    [item],
  );

  // Space/arrow-key transport controls are scoped to this panel, not global: they only fire once
  // the panel (or something inside it - a button, the canvas, the divider) has focus. Focusing the
  // panel explicitly on mousedown (rather than relying on the browser's implicit "click focuses the
  // nearest focusable ancestor" behavior) is needed because Safari only auto-focuses native form
  // controls on click, not a plain div/canvas - explicit .focus() works the same in every browser.
  const handleMouseDown = useCallback(() => {
    mainContentRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        item.togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        item.stepFrame(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        item.stepFrame(-1);
      }
    },
    [item],
  );

  const isWipe = item.mode === "wipe";
  const stageWidth = stageSize ? stageSize[0] : 0;
  const stageHeight = stageSize ? stageSize[1] : 0;

  // Same contain-fit math as HstackVideoCanvas's wipe-mode draw() (single-half aspect ratio),
  // computed here in CSS pixels so the DOM divider lines up with the canvas's own clip boundary
  // instead of assuming the video fills the pane edge-to-edge.
  let contentRect = { offsetX: 0, contentWidth: stageWidth };

  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0 && stageWidth > 0 && stageHeight > 0) {
    const scale = Math.min(stageWidth / naturalSize.width, stageHeight / naturalSize.height);
    const contentWidth = naturalSize.width * scale;

    contentRect = { offsetX: (stageWidth - contentWidth) / 2, contentWidth };
  }

  return (
    <ObjectTag item={item}>
      <div
        className={cn("video-compare").mod({ fullscreen: isFullScreen }).toClassName()}
        ref={mainContentRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: role="application" widget with its own space/arrow transport shortcuts, not navigable content
        tabIndex={0}
        role="application"
        aria-label="Video comparison player"
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {errors.map((error, i) => (
          <ErrorMessage key={`err-${i}`} error={error} />
        ))}

        <div
          className={cn("video-compare").elem("stage").toClassName()}
          ref={containerRef}
          style={isFullScreen ? { flex: 1, minHeight: 0 } : { height: Number(item.height) }}
        >
          {stageSize && (
            <>
              <HstackVideoCanvas
                ref={item.ref}
                src={item.videoUrl}
                width={stageWidth}
                height={stageHeight}
                mode={item.mode}
                dividerPosition={item.dividerPosition}
                muted={item.muted}
                speed={item.speed}
                framerate={Number(item.framerate)}
                onFrameChange={handleFrameChange}
                onLoad={handleLoad}
                onError={handleError}
                onEnded={handleEnded}
              />
              {isWipe && (
                <DividerHandle
                  position={item.dividerPosition}
                  onCommit={handleDividerCommit}
                  containerRef={containerRef}
                  dividerRef={dividerRef}
                  canvasRef={item.ref}
                  contentRect={contentRect}
                />
              )}
            </>
          )}
        </div>

        {loaded && <CompareControls item={item} isFullScreen={isFullScreen} onToggleFullscreen={toggleFullscreen} />}
      </div>
    </ObjectTag>
  );
};

export { HtxVideoCompareView };
