// ClipContent 组件 - 可复用的 Clip 视觉渲染组件

"use client";

import React from "react";
import { Clip, getTrackHeight } from "../../types/timeline";
import { TIMELINE_CONFIG } from "../../types/timeline";
import { useTimelineStore } from "../../stores/timelineStore";
import { timeToPixels } from "../../utils/timeline";
import { formatTime } from "../../utils/time";
import { getClipColor } from "../../utils/color";

interface ClipContentProps {
  clip: Clip;
  isSelected?: boolean;
  isDragging?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ClipContent: React.FC<ClipContentProps> = ({
  clip,
  isSelected = false,
  isDragging = false,
  className = "",
  style = {},
}: ClipContentProps) => {
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const tracks = useTimelineStore((state) => state.tracks);
  const timeDisplayFormat = useTimelineStore(
    (state) => state.timeDisplayFormat,
  );
  const fps = useTimelineStore((state) => state.fps);

  // 获取轨道高度
  const track = tracks.find((t) => t.id === clip.trackId);
  const trackHeight = track
    ? getTrackHeight(track.type)
    : TIMELINE_CONFIG.TRACK_HEIGHT;

  // 计算宽度
  const width = timeToPixels(clip.duration, pixelsPerSecond);

  const mergedStyle = {
    width: `${Math.max(width, TIMELINE_CONFIG.MIN_CLIP_WIDTH)}px`,
    height: `${trackHeight - 8}px`,
    ...style,
  };

  return (
    <div
      className={`rounded border-2 overflow-hidden ${getClipColor(clip.type)} ${
        isSelected
          ? "ring-1 ring-black ring-offset-0 ring-offset-editor-bg"
          : ""
      } ${isDragging ? "opacity-50" : ""} ${className}`}
      style={mergedStyle}
    >
      {/* Clip 内容 */}
      <div className="px-2 py-1 h-full flex space-x-2 text-white">
        <div className="text-xs font-medium truncate">{clip.name}</div>
        <div className="text-[10px] opacity-75">
          {formatTime(clip.duration, timeDisplayFormat, fps)}
        </div>
      </div>
    </div>
  );
};
