import { observer } from "mobx-react";
import { useCallback } from "react";

import {
  IconFullscreen,
  IconFullscreenExit,
  IconPause,
  IconPlay,
  IconVolumeFull,
  IconVolumeMute,
} from "@humansignal/icons";
import { Button, Tooltip } from "@humansignal/ui";
import { Slider } from "../../../components/Timeline/Controls/Slider";
import { cn } from "../../../utils/bem";
import "./CompareControls.prefix.css";

const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const ToolbarButton = ({ tooltip, onClick, children }) => (
  <Tooltip title={tooltip}>
    <Button onClick={onClick} look="string" size="small" variant="neutral" aria-label={tooltip}>
      {children}
    </Button>
  </Tooltip>
);

export const CompareControls = observer(({ item, isFullScreen, onToggleFullscreen }) => {
  const framerate = Number(item.framerate);
  const isFrameUnit = item.timeUnit === "frames";

  const positionLabel = isFrameUnit ? String(item.frame) : formatSeconds((item.frame - 1) / framerate);
  const durationLabel = isFrameUnit ? String(item.length) : formatSeconds((item.length - 1) / framerate);

  const handlePlayPause = useCallback(() => item.togglePlay(), [item]);

  // The scrub bar always operates on frame indices directly - it's the actual source of truth
  // for playback position, and stepping by exactly 1 avoids the rounding a seconds<->frame
  // conversion would introduce.
  const handleSeek = useCallback(
    (e) => {
      item.setFrame(Number(e.currentTarget.value));
    },
    [item],
  );

  const handleVolume = useCallback(
    (e) => {
      item.setVolume(Number(e.currentTarget.value));
    },
    [item],
  );

  const handleMuteToggle = useCallback(() => item.toggleMute(), [item]);

  const handleModeToggle = useCallback(() => {
    item.setMode(item.mode === "wipe" ? "side-by-side" : "wipe");
  }, [item]);

  const handleTimeUnitToggle = useCallback(() => item.toggleTimeUnit(), [item]);

  return (
    <div className={cn("compare-controls").toClassName()}>
      <ToolbarButton tooltip={item.playing ? "Pause" : "Play"} onClick={handlePlayPause}>
        {item.playing ? <IconPause /> : <IconPlay />}
      </ToolbarButton>

      <span className={cn("compare-controls").elem("time").toClassName()}>{positionLabel}</span>

      <div className={cn("compare-controls").elem("seek").toClassName()}>
        <Slider
          min={1}
          max={Math.max(item.length, 1)}
          step={1}
          value={item.frame}
          onChange={handleSeek}
          showInput={false}
        />
      </div>

      <span className={cn("compare-controls").elem("time").toClassName()}>{durationLabel}</span>

      <Tooltip title={isFrameUnit ? "Show time in seconds" : "Show time in frames"}>
        <Button
          onClick={handleTimeUnitToggle}
          look="string"
          size="small"
          variant="neutral"
          aria-label="Toggle time unit"
          className={cn("compare-controls").elem("time-unit-toggle").toClassName()}
        >
          {isFrameUnit ? "frames" : "sec"}
        </Button>
      </Tooltip>

      <ToolbarButton tooltip={item.muted ? "Unmute" : "Mute"} onClick={handleMuteToggle}>
        {item.muted ? <IconVolumeMute /> : <IconVolumeFull />}
      </ToolbarButton>

      <div className={cn("compare-controls").elem("volume").toClassName()}>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={item.muted ? 0 : item.volume}
          onChange={handleVolume}
          showInput={false}
        />
      </div>

      <Button
        onClick={handleModeToggle}
        look="string"
        size="small"
        variant="neutral"
        className={cn("compare-controls").elem("mode-toggle").toClassName()}
      >
        {item.mode === "wipe" ? "Side by side" : "Wipe compare"}
      </Button>

      <ToolbarButton tooltip={isFullScreen ? "Exit fullscreen" : "Fullscreen"} onClick={onToggleFullscreen}>
        {isFullScreen ? <IconFullscreenExit /> : <IconFullscreen />}
      </ToolbarButton>
    </div>
  );
});
