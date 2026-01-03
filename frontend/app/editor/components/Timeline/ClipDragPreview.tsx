// ClipDragPreview 组件 - 拖拽时的预览组件

"use client";

import React from "react";
import { DragData, Clip, MediaType } from "../../types/timeline";
import { ClipContent } from "./ClipContent";
import { AudioTrackIcon, VideoTrackIcon, ImageTrackIcon } from "../../icons";

interface ClipDragPreviewProps {
  data: DragData | Clip;
  type: "resource" | "clip";
}

export const ClipDragPreview: React.FC<ClipDragPreviewProps> = ({
  data,
  type,
}) => {
  // 如果是拖动 Clip，直接使用 ClipContent 组件保持一致性
  if (type === "clip" && "name" in data) {
    return <ClipContent clip={data as Clip} isDragging={false} />;
  }

  // 以下是拖动 Resource 时的卡片样式
  const getName = () => {
    if ("resourceName" in data) {
      return data.resourceName;
    }
    return "name" in data ? data.name : "";
  };

  const getMediaType = (): MediaType => {
    if ("resourceType" in data) {
      return data.resourceType;
    }
    return "type" in data ? data.type : "video";
  };

  const getTypeColor = () => {
    const mediaType = getMediaType();
    switch (mediaType) {
      case "video":
        return "bg-accent-magenta border-accent-magenta/80";
      case "audio":
        return "bg-accent-green border-accent-green/80";
      case "image":
        return "bg-accent-blue border-accent-blue/80";
      case "text":
        return "bg-accent-yellow border-accent-yellow/80";
      default:
        return "bg-text-muted border-text-muted/80";
    }
  };

  const getTypeIcon = () => {
    const mediaType = getMediaType();
    switch (mediaType) {
      case "video":
        return <VideoTrackIcon className="w-4 h-4" />;
      case "audio":
        return <AudioTrackIcon className="w-4 h-4" />;
      case "image":
        return <ImageTrackIcon className="w-4 h-4" />;
      case "text":
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 shadow-xl ${getTypeColor()} text-white`}
      style={{
        minWidth: "150px",
        maxWidth: "250px",
      }}
    >
      {/* 图标 */}
      <div className="shrink-0">{getTypeIcon()}</div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{getName()}</div>
      </div>

      {/* 拖拽图标 */}
      <div className="shrink-0 opacity-75">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </div>
    </div>
  );
};
