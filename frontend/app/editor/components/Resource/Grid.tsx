/**
 * ResourceGrid Component
 * Displays resource items in a grid layout
 */

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTauriCommands } from "@/app/hooks/useTauriCommands";
import { DragData, MediaType } from "../../types/timeline";
import { BackendResource } from "../../types/editor";
import { DeleteIcon } from "../../icons/UIIcons";
import { VideoIcon, AudioIcon, ImageIcon } from "../../icons/MaterialIcons";

interface ResourceGridProps {
  resources: BackendResource[];
  onSelect?: (resource: BackendResource | null) => void;
  projectPath?: string | null;
  onDelete?: () => void;
}

export function ResourceGrid({
  resources,
  onSelect,
  projectPath,
  onDelete,
}: ResourceGridProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { deleteMaterial } = useTauriCommands();

  const handleDelete = async (
    e: React.MouseEvent<HTMLButtonElement>,
    resource: BackendResource,
  ) => {
    e.stopPropagation();
    if (!projectPath || deletingId) return;

    setDeletingId(resource.id);
    try {
      await deleteMaterial(projectPath, resource.id);
      onDelete?.();
    } catch (error) {
      console.error("Failed to delete material:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleResourceClick = (resource: BackendResource) => {
    if (selectedId === resource.id) {
      // If clicking the same resource, deselect it
      setSelectedId(null);
      onSelect?.(null);
    } else {
      // Select new resource
      setSelectedId(resource.id);
      onSelect?.(resource);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {resources.map((resource) => (
        <ResourceItem
          key={resource.id}
          resource={resource}
          isSelected={selectedId === resource.id}
          isDeleting={deletingId === resource.id}
          onClick={() => handleResourceClick(resource)}
          onDelete={(e) => handleDelete(e, resource)}
        />
      ))}
    </div>
  );
}

interface ResourceItemProps {
  resource: BackendResource;
  isSelected: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function ResourceItem({
  resource,
  isSelected,
  isDeleting,
  onClick,
  onDelete,
}: ResourceItemProps) {
  // 根据文件扩展名或类型确定媒体类型
  const getMediaType = (resourceType: string): MediaType => {
    const type = resourceType.toLowerCase();
    if (
      type.includes("video") ||
      type.includes("mp4") ||
      type.includes("mov")
    ) {
      return "video";
    }
    if (
      type.includes("audio") ||
      type.includes("mp3") ||
      type.includes("wav")
    ) {
      return "audio";
    }
    if (
      type.includes("image") ||
      type.includes("png") ||
      type.includes("jpg") ||
      type.includes("jpeg") ||
      type.includes("webp")
    ) {
      return "image";
    }
    return "video"; // 默认为视频
  };

  const mediaType = getMediaType(resource.resource_type);

  // 根据媒体类型返回对应的 icon
  const getDragIcon = () => {
    switch (mediaType) {
      case "video":
        return <VideoIcon size={16} className="text-gray-400" />;
      case "audio":
        return <AudioIcon size={16} className="text-gray-400" />;
      case "image":
        return <ImageIcon size={16} className="text-gray-400" />;
      default:
        return <VideoIcon size={16} className="text-gray-400" />;
    }
  };

  // 配置拖拽
  const dragData: DragData = {
    resourceId: resource.id,
    resourceName: resource.name,
    resourceType: mediaType,
    resourceSrc: resource.src,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `resource-${resource.id}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`aspect-video rounded cursor-grab active:cursor-grabbing group relative transition-all bg-editor-panel border-2 ${
        isSelected
          ? "border-accent-blue bg-accent-blue/10"
          : "border-editor-border hover:border-accent-blue"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="absolute left-0 bottom-0 w-full text-xs p-1 text-text-muted pointer-events-none text-ellipsis text-nowrap overflow-hidden">
        {resource.name}
      </div>

      {/* 拖拽提示图标 */}
      <div className="absolute top-1 left-1 opacity-50 pointer-events-none">
        {getDragIcon()}
      </div>

      {/* Delete button - hidden by default, shown on hover */}
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded disabled:opacity-50 bg-accent-red text-white hover:opacity-80 z-10 flex items-center justify-center"
        title="Delete material"
        aria-label="Delete material"
      >
        {isDeleting ? "..." : <DeleteIcon size={12} />}
      </button>
    </div>
  );
}
