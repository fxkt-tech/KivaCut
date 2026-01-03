// TimelineTrack 组件 - 时间轴轨道

"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Track,
  getTrackHeight,
  canClipBeAddedToTrack,
} from "../../types/timeline";
import { useTimelineStore } from "../../stores/timelineStore";
import { TimelineClip } from "./Clip";
import { TrackDropZone } from "./TrackDropZone";

interface TimelineTrackProps {
  track: Track;
  index: number;
  isResourceDragging?: boolean;
  activeDragResourceType?: "video" | "audio" | "image";
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  index,
  isResourceDragging = false,
  activeDragResourceType,
}) => {
  const selectedClipIds = useTimelineStore((state) => state.selectedClipIds);
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId);
  const selectTrack = useTimelineStore((state) => state.selectTrack);
  const clearSelection = useTimelineStore((state) => state.clearSelection);

  const isSelected = selectedTrackId === track.id;
  const trackHeight = getTrackHeight(track.type);

  // 检查是否可以接受当前拖拽的资源类型
  const canAcceptDrag = activeDragResourceType
    ? canClipBeAddedToTrack(activeDragResourceType, track.type)
    : true;

  // 配置拖拽放置区域
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: {
      type: "track",
      trackId: track.id,
      trackType: track.type,
    },
    disabled: track.locked || !canAcceptDrag,
  });

  const handleTrackClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      clearSelection();
      selectTrack(track.id);
    }
  };

  return (
    <div className="relative">
      {/* Drop zone above track */}
      <TrackDropZone
        position="above"
        trackIndex={index}
        isActive={isResourceDragging}
        activeDragType={activeDragResourceType}
      />

      {/* Track content */}
      <div
        ref={setNodeRef}
        className={`relative bg-editor-bg-alt border-editor-border ${
          isSelected ? "bg-editor-panel" : "bg-editor-bg"
        } ${track.locked ? "opacity-50 cursor-not-allowed" : ""} ${
          isOver && !track.locked && canAcceptDrag
            ? "bg-accent-blue/20 ring-2 ring-accent-blue"
            : ""
        } ${isResourceDragging && !canAcceptDrag ? "opacity-30 cursor-not-allowed" : ""}`}
        style={{
          height: trackHeight,
          minHeight: trackHeight,
        }}
        onClick={handleTrackClick}
      >
        {/* 轨道背景网格 */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="h-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 50px)",
            }}
          />
        </div>

        {/* Clips */}
        {track.visible && !track.locked && (
          <div className="relative h-full">
            {track.clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                isSelected={selectedClipIds.includes(clip.id)}
              />
            ))}
          </div>
        )}

        {/* 锁定提示 */}
        {track.locked && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm pointer-events-none">
            Locked
          </div>
        )}

        {/* 隐藏提示 */}
        {!track.visible && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm pointer-events-none">
            Hidden
          </div>
        )}
      </div>

      {/* Drop zone below track */}
      <TrackDropZone
        position="below"
        trackIndex={index}
        isActive={isResourceDragging}
        activeDragType={activeDragResourceType}
      />
    </div>
  );
};
