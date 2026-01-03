// Timeline Toolbar 组件 - 时间轴工具栏

"use client";

import React from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import {
  VideoTrackIcon,
  AudioTrackIcon,
  UndoIcon,
  RedoIcon,
  SnappingIcon,
  ZoomOutIcon,
  ZoomInIcon,
  SplitIcon,
  TimeFormatIcon,
} from "../../icons";

interface TimelineToolbarProps {
  isPlaying: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
}

export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  currentTime,
}) => {
  const zoomLevel = useTimelineStore((state) => state.zoomLevel);
  const setZoomLevel = useTimelineStore((state) => state.setZoomLevel);
  const zoomIn = useTimelineStore((state) => state.zoomIn);
  const zoomOut = useTimelineStore((state) => state.zoomOut);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const toggleSnapping = useTimelineStore((state) => state.toggleSnapping);
  const undo = useTimelineStore((state) => state.undo);
  const redo = useTimelineStore((state) => state.redo);
  const canUndo = useTimelineStore((state) => state.canUndo);
  const canRedo = useTimelineStore((state) => state.canRedo);
  const selectedClipIds = useTimelineStore((state) => state.selectedClipIds);
  const splitSelectedClips = useTimelineStore(
    (state) => state.splitSelectedClips,
  );
  const timeDisplayFormat = useTimelineStore(
    (state) => state.timeDisplayFormat,
  );
  const setTimeDisplayFormat = useTimelineStore(
    (state) => state.setTimeDisplayFormat,
  );

  return (
    <div className="h-8 flex items-center justify-between px-4 py-1 bg-editor-bg border-t-2 border-b border-editor-border">
      <div className="flex items-center gap-2">
        {/* 撤销/重做按钮 */}
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon className="w-5 h-5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Shift+Z)"
        >
          <RedoIcon className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-editor-border" />

        <button
          onClick={() => addTrack("video")}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors"
          title="Add Video Track"
        >
          <VideoTrackIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => addTrack("audio")}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors"
          title="Add Audio Track"
        >
          <AudioTrackIcon className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-editor-border" />

        {/* 分割按钮 */}
        <button
          onClick={() => splitSelectedClips(currentTime)}
          disabled={selectedClipIds.length === 0}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Split Clip (Ctrl+B)"
        >
          <SplitIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* 时间格式切换 */}
        <button
          onClick={() => {
            setTimeDisplayFormat(
              timeDisplayFormat === "frames" ? "milliseconds" : "frames",
            );
          }}
          className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors flex items-center gap-1"
          title={
            timeDisplayFormat === "frames"
              ? "Display: Frames (HH:MM:SS.FF)"
              : "Display: Milliseconds (HH:MM:SS.mmm)"
          }
        >
          <TimeFormatIcon className="w-5 h-5" />
          <span className="text-xs font-mono">
            {timeDisplayFormat === "frames" ? "FF" : "ms"}
          </span>
        </button>

        <div className="w-px h-6 bg-editor-border" />

        {/* 吸附开关 */}
        <button
          onClick={toggleSnapping}
          className={`p-1 rounded transition-colors relative ${
            snappingEnabled
              ? "text-accent-blue hover:text-accent-blue/80"
              : "hover:bg-editor-hover text-text-muted hover:text-editor-dark"
          }`}
          title={snappingEnabled ? "Snapping: ON" : "Snapping: OFF"}
        >
          <SnappingIcon className="w-5 h-5" />
          {snappingEnabled && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-accent-blue rounded-full" />
          )}
        </button>

        <div className="w-px h-6 bg-editor-border" />

        {/* 缩放控制 */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOutIcon className="w-5 h-5" />
          </button>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => {
              setZoomLevel(Number(e.target.value));
            }}
            className="w-24 h-1 bg-editor-hover rounded-lg appearance-none cursor-pointer accent-accent-blue"
            title={`Zoom Level: ${zoomLevel.toFixed(1)}x`}
            style={{
              background: `linear-gradient(to right, var(--color-accent-blue) 0%, var(--color-accent-blue) ${((zoomLevel - 0.1) / 9.9) * 100}%, var(--color-editor-hover) ${((zoomLevel - 0.1) / 9.9) * 100}%, var(--color-editor-hover) 100%)`,
            }}
          />
          <button
            onClick={zoomIn}
            className="p-1 hover:bg-editor-hover text-text-muted hover:text-(--color-editor-dark) rounded transition-colors"
            title="Zoom In"
          >
            <ZoomInIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
