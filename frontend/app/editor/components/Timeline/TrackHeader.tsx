// TrackHeader 组件 - 轨道头部控制面板

"use client";

import React from "react";
import { Track, getTrackHeight, TIMELINE_CONFIG } from "../../types/timeline";
import { useTimelineStore } from "../../stores/timelineStore";
import {
  VideoTrackIcon,
  AudioTrackIcon,
  EyeIcon,
  EyeOffIcon,
  LockClosedIcon,
  LockOpenIcon,
  VolumeOffIcon,
  VolumeUpIcon,
  TrashIcon,
} from "../../icons";

interface TrackHeaderProps {
  track: Track;
  index: number;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({ track }) => {
  const updateTrack = useTimelineStore((state) => state.updateTrack);
  const removeTrack = useTimelineStore((state) => state.removeTrack);
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId);
  const tracks = useTimelineStore((state) => state.tracks);

  const isSelected = selectedTrackId === track.id;
  const trackHeight = getTrackHeight(track.type);

  const handleToggleVisible = () => {
    updateTrack(track.id, { visible: !track.visible });
  };

  const handleToggleLocked = () => {
    updateTrack(track.id, { locked: !track.locked });
  };

  const handleToggleMuted = () => {
    updateTrack(track.id, { muted: !track.muted });
  };

  const handleDelete = () => {
    removeTrack(track.id);
  };

  // 检查是否是唯一的video track
  const isOnlyVideoTrack =
    track.type === "video" &&
    tracks.filter((t) => t.type === "video").length <= 1;

  return (
    <div
      className={`flex items-center justify-center bg-editor-bg-alt border-editor-border px-2 py-2 ${
        isSelected ? "bg-editor-panel" : "bg-editor-bg"
      }`}
      style={{
        width: TIMELINE_CONFIG.TRACK_HEADER_WIDTH,
        height: trackHeight,
        minWidth: TIMELINE_CONFIG.TRACK_HEADER_WIDTH,
      }}
    >
      <div className="flex items-center gap-2">
        {/* 轨道类型图标 */}
        <div className="shrink-0 text-text-fg">
          {track.type === "video" ? (
            <VideoTrackIcon className="w-4 h-4" />
          ) : (
            <AudioTrackIcon className="w-4 h-4" />
          )}
        </div>

        {/* 竖线分隔符 */}
        <div className="h-4 w-px bg-editor-border" />

        {/* 锁定按钮 */}
        <button
          onClick={handleToggleLocked}
          className={`p-1 rounded hover:bg-editor-hover transition-colors ${
            track.locked ? "text-accent-blue" : "text-text-muted"
          }`}
          title={track.locked ? "Unlock track" : "Lock track"}
        >
          {track.locked ? (
            <LockClosedIcon className="w-4 h-4" />
          ) : (
            <LockOpenIcon className="w-4 h-4" />
          )}
        </button>

        {/* 可见性按钮 */}
        <button
          onClick={handleToggleVisible}
          className={`p-1 rounded hover:bg-editor-hover transition-colors ${
            track.visible ? "text-text-muted" : "text-accent-blue"
          }`}
          title={track.visible ? "Hide track" : "Show track"}
        >
          {track.visible ? (
            <EyeIcon className="w-4 h-4" />
          ) : (
            <EyeOffIcon className="w-4 h-4" />
          )}
        </button>

        {/* 静音按钮 */}
        <button
          onClick={handleToggleMuted}
          className={`p-1 rounded hover:bg-editor-hover transition-colors ${
            track.muted ? "text-accent-blue" : "text-text-muted"
          }`}
          title={track.muted ? "Unmute track" : "Mute track"}
          disabled={track.locked}
        >
          {track.muted ? (
            <VolumeOffIcon className="w-4 h-4" />
          ) : (
            <VolumeUpIcon className="w-4 h-4" />
          )}
        </button>

        {/* 删除按钮 */}
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-accent-red/20 text-text-muted hover:text-accent-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            isOnlyVideoTrack
              ? "Cannot delete the only video track"
              : "Delete track"
          }
          disabled={track.locked || isOnlyVideoTrack}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
