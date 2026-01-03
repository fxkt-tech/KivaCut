"use client";

import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  Header,
  ResourcePanel,
  WebGPUPlayer,
  PropertiesPanel,
} from "./components";
import type { PlayerRef } from "./components";
import { Timeline, TimelineRef } from "./components/Timeline/Panel";
import { useEditorState } from "./hooks/useEditorState";
import { useProjectById } from "./hooks/useProjectById";
import { useEditor } from "./hooks/useEditor";
import { useTimelineStore } from "./stores/timelineStore";
import { getPropertyTabsForClipType } from "./constants/data";
import { BackendResource } from "./types/editor";
import { DragData, Clip } from "./types/timeline";
import {
  pixelsToTime,
  collectSnapPoints,
  calculateSnappedTime,
  getAllClipsFromTracks,
  snapToFrame,
} from "./utils/timeline";
import { canClipBeAddedToTrack } from "./types/timeline";
import { ClipDragPreview } from "./components/Timeline/ClipDragPreview";
import {
  protocolToTimeline,
  timelineToProtocol,
  msToSeconds,
} from "./utils/protocolConverter";
import { debounce } from "./utils/debounce";

function EditorPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("id");

  const {
    project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useProjectById(projectId);

  const {
    protocol,
    isLoading: isLoadingProtocol,
    error: protocolError,
    saveProtocol,
    reloadProtocol,
  } = useEditor(projectId);

  const { state, setActiveTab, setActivePropertyTab } = useEditorState();

  // 使用 Timeline Store - 仅编辑相关状态
  const tracks = useTimelineStore((state) => state.tracks);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const insertTrackAt = useTimelineStore((state) => state.insertTrackAt);
  const setTracks = useTimelineStore((state) => state.setTracks);
  const setStage = useTimelineStore((state) => state.setStage);
  const addClip = useTimelineStore((state) => state.addClip);
  const moveClip = useTimelineStore((state) => state.moveClip);
  const updateClip = useTimelineStore((state) => state.updateClip);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const scrollLeft = useTimelineStore((state) => state.scrollLeft);
  const snappingEnabled = useTimelineStore((state) => state.snappingEnabled);
  const snapThreshold = useTimelineStore((state) => state.snapThreshold);
  const fps = useTimelineStore((state) => state.fps);
  const resetTimelineStore = useTimelineStore((state) => state.reset);
  const selectedClip = useTimelineStore((state) => state.getSelectedClip());
  const updateClipTransform = useTimelineStore(
    (state) => state.updateClipTransform,
  );

  // Player 状态 - 通过回调同步
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerIsPlaying, setPlayerIsPlaying] = useState(false);

  // 选中的资源状态 - 原始选择
  const [rawSelectedResource, setRawSelectedResource] = useState<{
    id: string;
    type: string;
    data: any;
  } | null>(null);

  // 计算实际显示的资源 - 当有 clip 选中时清空
  const selectedResource = useMemo(() => {
    if (selectedClip) {
      return null;
    }
    return rawSelectedResource;
  }, [selectedClip, rawSelectedResource]);

  const [activeDragData, setActiveDragData] = useState<DragData | Clip | null>(
    null,
  );

  // Track mouse position during drag for accurate drop position
  const dragMousePositionRef = useRef<{ x: number; y: number } | null>(null);

  // Flag to prevent sync loop between protocol and tracks
  const isSyncingFromProtocolRef = useRef(false);
  const isSavingToProtocolRef = useRef(false);

  // Flag to prevent duplicate drag end handling
  const isDragEndProcessingRef = useRef(false);

  // Player ref for external control
  const playerRef = useRef<PlayerRef>(null);
  // Timeline ref for external control
  const timelineRef = useRef<TimelineRef>(null);

  // === Auto-switch property tab when selected clip changes ===
  useEffect(() => {
    if (selectedClip) {
      const tabs = getPropertyTabsForClipType(selectedClip.type);
      if (
        tabs.length > 0 &&
        !tabs.some((tab) => tab.key === state.activePropertyTab)
      ) {
        setActivePropertyTab(tabs[0].key);
      }
    }
  }, [selectedClip, state.activePropertyTab, setActivePropertyTab]);

  // === 资源选择处理 ===
  const handleResourceSelect = useCallback((resource: any | null) => {
    if (!resource) {
      setRawSelectedResource(null);
      return;
    }

    // 当选中资源时，清除选中的 clip
    const clearSelection = useTimelineStore.getState().clearSelection;
    clearSelection();

    // 直接使用后端返回的完整数据
    setRawSelectedResource({
      id: resource.id,
      type: resource.material_type || resource.type,
      data: resource,
    });
  }, []);

  // === Player 回调 - 同步状态 ===
  const handlePlayerTimeUpdate = useCallback((time: number) => {
    setPlayerCurrentTime(time);
  }, []);

  const handlePlayerDurationChange = useCallback((duration: number) => {
    setPlayerDuration(duration);
  }, []);

  const handlePlayerPlayStateChange = useCallback((isPlaying: boolean) => {
    setPlayerIsPlaying(isPlaying);
  }, []);

  // === 播放控制方法 - 调用 Player ===
  const handlePlayPause = useCallback(() => {
    playerRef.current?.togglePlayPause();
  }, []);

  const handleStepForward = useCallback(() => {
    playerRef.current?.stepForward();
  }, []);

  const handleStepBackward = useCallback(() => {
    playerRef.current?.stepBackward();
  }, []);

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  // === Clip Transform 变更处理 ===
  const handleClipTransformChange = useCallback(
    (
      clipId: string,
      transform: {
        position?: { x: number; y: number };
        scale?: number;
        rotation?: number;
        opacity?: number;
      },
    ) => {
      // 1. 更新 Timeline Store（数据持久化）
      updateClipTransform(clipId, transform);

      // 2. 直接更新 Player（实时渲染）
      playerRef.current?.updateClipTransform?.(clipId, transform);
    },
    [updateClipTransform],
  );

  // 全局拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Convert protocol materials to resources format
  const resources = useMemo(() => {
    if (!protocol) return [];

    const result: BackendResource[] = [];

    // Add videos
    protocol.materials.videos.forEach((video) => {
      result.push({
        id: video.id,
        name: video.name,
        src: video.src,
        resource_type: "video",
        material_type: "video",
        dimension: video.dimension,
        duration: video.duration,
        fps: video.fps,
        codec: video.codec,
        bitrate: video.bitrate,
      });
    });
    // Add audios
    protocol.materials.audios.forEach((audio) => {
      result.push({
        id: audio.id,
        name: audio.name,
        src: audio.src,
        resource_type: "audio",
        material_type: "audio",
        duration: audio.duration,
        codec: audio.codec,
        bitrate: audio.bitrate,
        sample_rate: audio.sample_rate,
        channels: audio.channels,
      });
    });
    // Add images
    protocol.materials.images.forEach((image) => {
      result.push({
        id: image.id,
        name: image.name,
        src: image.src,
        resource_type: "image",
        material_type: "image",
        dimension: image.dimension,
        format: image.format,
      });
    });

    return result;
  }, [protocol]);

  // Cleanup timeline store when leaving editor page
  useEffect(() => {
    return () => {
      resetTimelineStore();
    };
  }, [resetTimelineStore]);

  // Initialize tracks from protocol
  useEffect(() => {
    if (!protocol) return;

    // Prevent sync if we just saved to protocol
    if (isSavingToProtocolRef.current) {
      isSavingToProtocolRef.current = false;
      return;
    }

    isSyncingFromProtocolRef.current = true;

    // Sync stage from protocol
    setStage(protocol.stage);

    if (protocol.tracks.length > 0) {
      // Convert protocol tracks to timeline tracks using converter
      const timelineTracks = protocolToTimeline(protocol);
      setTracks(timelineTracks);
      console.log("Synced tracks from protocol");
    } else {
      // Clear tracks if protocol has no tracks
      setTracks([]);
    }

    // Reset flag after a short delay to allow tracks update to propagate
    setTimeout(() => {
      isSyncingFromProtocolRef.current = false;
    }, 100);
  }, [protocol, setTracks, setStage]);

  // Get material duration helper
  const getMaterialDuration = (resourceId: string): number => {
    if (!protocol) return 3;

    const video = protocol.materials.videos.find((v) => v.id === resourceId);
    if (video && video.duration) {
      return msToSeconds(video.duration); // Convert ms to seconds
    }

    const audio = protocol.materials.audios.find((a) => a.id === resourceId);
    if (audio && audio.duration) {
      return msToSeconds(audio.duration);
    }

    // Default duration for images (3 seconds)
    return 3;
  };

  // Check if a clip would collide with existing clips on a track
  const checkCollision = (
    trackId: string,
    startTime: number,
    duration: number,
    excludeClipId?: string,
  ): boolean => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return false;

    const endTime = startTime + duration;

    return track.clips.some((clip) => {
      // Skip the clip being moved
      if (excludeClipId && clip.id === excludeClipId) return false;

      const clipEndTime = clip.startTime + clip.duration;

      // Check for overlap: two clips overlap if one starts before the other ends
      return (
        (startTime >= clip.startTime && startTime < clipEndTime) ||
        (endTime > clip.startTime && endTime <= clipEndTime) ||
        (startTime <= clip.startTime && endTime >= clipEndTime)
      );
    });
  };

  // Debounced auto-save function
  const debouncedSaveProtocol = useMemo(
    () =>
      debounce(async () => {
        if (!protocol) return;

        try {
          const updatedProtocol = timelineToProtocol(tracks, protocol);
          await saveProtocol(updatedProtocol);
          console.log("Protocol auto-saved");
        } catch (error) {
          console.error("Failed to auto-save protocol:", error);
        }
      }, 5000),
    [protocol, tracks, saveProtocol],
  );

  // Auto-save when tracks change
  useEffect(() => {
    // Prevent auto-save if we're currently syncing from protocol
    if (isSyncingFromProtocolRef.current) {
      return;
    }

    if (protocol) {
      isSavingToProtocolRef.current = true;
      debouncedSaveProtocol();
    }

    return () => {
      debouncedSaveProtocol.cancel();
    };
  }, [tracks, protocol, debouncedSaveProtocol]);

  // Manual save protocol to backend
  const handleSaveProtocol = async () => {
    if (!protocol) return;

    try {
      // Update protocol with current timeline state using converter
      const updatedProtocol = timelineToProtocol(tracks, protocol);

      await saveProtocol(updatedProtocol);
      console.log("Protocol saved successfully");
    } catch (err) {
      console.error("Failed to save protocol:", err);
    }
  };

  const projectName = useMemo(() => {
    if (project) {
      return project.name;
    }
    return "Untitled Project";
  }, [project]);

  const handleExport = async () => {
    console.log("Export clicked");
    // Save protocol before exporting
    await handleSaveProtocol();
    // TODO: Implement export functionality
  };

  const handleBackToProjects = () => {
    router.push("/");
  };

  // 处理拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    // Record initial mouse position
    if (event.activatorEvent && "clientX" in event.activatorEvent) {
      const pointerEvent = event.activatorEvent as PointerEvent;
      dragMousePositionRef.current = {
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      };
    }

    // 判断是资源还是片段
    if (data && "resourceId" in data && !("clipId" in data)) {
      setActiveDragData(data as DragData);
    } else if (data && data.type === "clip") {
      // 处理 clip 拖拽 - 直接传递 clip 对象
      const clip = useTimelineStore.getState().getClipById(data.clipId);
      if (clip) {
        setActiveDragData(clip);
      }
    }
  };

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    // Prevent duplicate execution
    if (isDragEndProcessingRef.current) {
      return;
    }
    isDragEndProcessingRef.current = true;

    const { active, over } = event;

    // Calculate final mouse position
    if (dragMousePositionRef.current && event.delta) {
      dragMousePositionRef.current = {
        x: dragMousePositionRef.current.x + event.delta.x,
        y: dragMousePositionRef.current.y + event.delta.y,
      };
    }

    setActiveDragData(null);

    if (!over) {
      // Reset flag before returning
      setTimeout(() => {
        isDragEndProcessingRef.current = false;
      }, 100);
      return;
    }

    const activeData = active.data.current;
    const dropData = over.data.current;

    if (!activeData || !dropData) return;

    // 情况1: 从资源面板拖拽到空白区域 - 创建新轨道
    if ("resourceId" in activeData && dropData.type === "empty-area") {
      const dragData = activeData as DragData;

      // 根据资源类型确定轨道类型
      const trackType: "video" | "audio" =
        dragData.resourceType === "video" || dragData.resourceType === "image"
          ? "video"
          : "audio";

      // 计算拖放的时间位置
      const rect = document
        .querySelector("[data-timeline-content]")
        ?.getBoundingClientRect();
      let startTime = 0;

      if (rect && dragMousePositionRef.current) {
        // 使用实际的鼠标位置
        const x = dragMousePositionRef.current.x - rect.left;
        startTime = pixelsToTime(x + scrollLeft, pixelsPerSecond);

        // 应用吸附
        if (snappingEnabled) {
          const allClips = getAllClipsFromTracks(tracks);
          const snapPoints = collectSnapPoints(allClips, playerCurrentTime);
          const snapped = calculateSnappedTime(
            startTime,
            snapPoints,
            snapThreshold,
            pixelsPerSecond,
          );
          if (snapped.snapped) {
            startTime = snapped.time;
          }
        }

        // 应用帧对齐
        startTime = snapToFrame(startTime, fps);
      }

      // Clear mouse position ref
      dragMousePositionRef.current = null;

      // 获取材料时长
      const materialDuration = getMaterialDuration(dragData.resourceId);

      // 创建新轨道（使用 addTrack 会自动添加到 store）
      addTrack(trackType);

      // 获取新创建的轨道（它会是最后一个）
      setTimeout(() => {
        const currentTracks = useTimelineStore.getState().tracks;
        const newTrack = currentTracks[currentTracks.length - 1];

        if (newTrack) {
          // 添加 Clip 到新轨道
          addClip(newTrack.id, {
            name: dragData.resourceName,
            type: dragData.resourceType,
            startTime: Math.max(0, startTime),
            duration: materialDuration,
            resourceId: dragData.resourceId,
            resourceSrc: dragData.resourceSrc,
            trimStart: 0,
            trimEnd: materialDuration,
            position: { x: 0, y: 0 },
            scale: 1,
            rotation: 0,
            opacity: 1,
            volume: 1,
          });
        }
      }, 0);
    }
    // 情况2: 从资源面板拖拽到轨道插入区域 - 在指定位置插入新轨道
    else if (
      "resourceId" in activeData &&
      dropData.type === "track-drop-zone"
    ) {
      const dragData = activeData as DragData;
      const insertIndex = dropData.insertIndex;

      // 根据资源类型确定轨道类型
      const trackType: "video" | "audio" =
        dragData.resourceType === "video" || dragData.resourceType === "image"
          ? "video"
          : "audio";

      // 计算拖放的时间位置
      const rect = document
        .querySelector("[data-timeline-content]")
        ?.getBoundingClientRect();
      let startTime = 0;

      if (rect && dragMousePositionRef.current) {
        // 使用实际的鼠标位置
        const x = dragMousePositionRef.current.x - rect.left;
        startTime = pixelsToTime(x + scrollLeft, pixelsPerSecond);

        // 应用吸附
        if (snappingEnabled) {
          const allClips = getAllClipsFromTracks(tracks);
          const snapPoints = collectSnapPoints(allClips, playerCurrentTime);
          const snapped = calculateSnappedTime(
            startTime,
            snapPoints,
            snapThreshold,
            pixelsPerSecond,
          );
          if (snapped.snapped) {
            startTime = snapped.time;
          }
        }

        // 应用帧对齐
        startTime = snapToFrame(startTime, fps);
      }

      // Clear mouse position ref
      dragMousePositionRef.current = null;

      // 获取材料时长
      const materialDuration = getMaterialDuration(dragData.resourceId);

      // 在指定位置插入新轨道
      insertTrackAt(insertIndex, trackType);

      // 获取新创建的轨道
      setTimeout(() => {
        const currentTracks = useTimelineStore.getState().tracks;
        const newTrack = currentTracks[insertIndex];

        if (newTrack) {
          // 添加 Clip 到新轨道
          addClip(newTrack.id, {
            name: dragData.resourceName,
            type: dragData.resourceType,
            startTime: Math.max(0, startTime),
            duration: materialDuration,
            resourceId: dragData.resourceId,
            resourceSrc: dragData.resourceSrc,
            trimStart: 0,
            trimEnd: materialDuration,
            position: { x: 0, y: 0 },
            scale: 1,
            rotation: 0,
            opacity: 1,
            volume: 1,
          });
        }
      }, 0);
    }
    // 情况3: 从资源面板拖拽到轨道
    else if ("resourceId" in activeData && dropData.type === "track") {
      const dragData = activeData as DragData;
      const trackId = dropData.trackId;
      const track = tracks.find((t) => t.id === trackId);

      if (!track || track.locked) return;

      // 验证Clip类型是否可以添加到该Track
      if (!canClipBeAddedToTrack(dragData.resourceType, track.type)) {
        console.warn(
          `Cannot add ${dragData.resourceType} clip to ${track.type} track`,
        );
        setTimeout(() => {
          isDragEndProcessingRef.current = false;
        }, 100);
        return;
      }

      // 计算拖放的时间位置
      const rect = document
        .querySelector("[data-timeline-content]")
        ?.getBoundingClientRect();
      if (!rect) return;

      const x = dragMousePositionRef.current
        ? dragMousePositionRef.current.x - rect.left
        : event.activatorEvent
          ? (event.activatorEvent as PointerEvent).clientX - rect.left
          : 0;
      let startTime = pixelsToTime(x + scrollLeft, pixelsPerSecond);

      // Clear mouse position ref
      dragMousePositionRef.current = null;

      // 应用吸附
      if (snappingEnabled) {
        const allClips = getAllClipsFromTracks(tracks);
        const snapPoints = collectSnapPoints(allClips, playerCurrentTime);
        const snapped = calculateSnappedTime(
          startTime,
          snapPoints,
          snapThreshold,
          pixelsPerSecond,
        );
        if (snapped.snapped) {
          startTime = snapped.time;
        }
      }

      // 应用帧对齐
      startTime = snapToFrame(startTime, fps);

      // Get actual duration from material
      const materialDuration = getMaterialDuration(dragData.resourceId);

      // Check for collision before adding clip
      if (checkCollision(trackId, startTime, materialDuration)) {
        console.warn("Cannot add clip: collision detected");
        return;
      }

      // 添加片段到轨道
      addClip(trackId, {
        name: dragData.resourceName,
        type: dragData.resourceType,
        startTime: Math.max(0, startTime),
        duration: materialDuration,
        resourceId: dragData.resourceId,
        resourceSrc: dragData.resourceSrc,
        trimStart: 0,
        trimEnd: materialDuration,
        position: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
        opacity: 1,
        volume: 1,
      });
    }
    // 情况4: 移动现有Clip到轨道
    else if (activeData.type === "clip" && dropData.type === "track") {
      const clipId = activeData.clipId;
      const sourceTrackId = activeData.trackId;
      const targetTrackId = dropData.trackId;

      const targetTrack = tracks.find((t) => t.id === targetTrackId);
      if (!targetTrack || targetTrack.locked) return;

      // 计算新的时间位置
      const rect = document
        .querySelector("[data-timeline-content]")
        ?.getBoundingClientRect();
      if (!rect) return;

      const deltaX = event.delta.x;

      const clip = useTimelineStore.getState().getClipById(clipId);
      if (!clip) return;

      // Clear mouse position ref
      dragMousePositionRef.current = null;

      // 计算新的开始时间
      const deltaTime = pixelsToTime(deltaX, pixelsPerSecond);
      let newStartTime = Math.max(0, clip.startTime + deltaTime);

      // 应用吸附
      if (snappingEnabled) {
        const allClips = getAllClipsFromTracks(tracks);
        const snapPoints = collectSnapPoints(
          allClips,
          playerCurrentTime,
          clipId,
        );
        const snapped = calculateSnappedTime(
          newStartTime,
          snapPoints,
          snapThreshold,
          pixelsPerSecond,
        );
        if (snapped.snapped) {
          newStartTime = snapped.time;
        }
      }

      // 应用帧对齐
      newStartTime = snapToFrame(newStartTime, fps);

      // Check for collision before moving clip
      if (checkCollision(targetTrackId, newStartTime, clip.duration, clipId)) {
        console.warn("Cannot move clip: collision detected");
        return;
      }

      // 如果是跨轨道拖拽
      if (sourceTrackId !== targetTrackId) {
        moveClip(clipId, targetTrackId, newStartTime);
      } else {
        // 同轨道内拖拽,只更新时间
        updateClip(clipId, { startTime: newStartTime });
      }
    }

    // Reset flag after processing
    setTimeout(() => {
      isDragEndProcessingRef.current = false;
    }, 100);
  };

  // 键盘快捷键
  useKeyboardShortcuts({
    enabled: true,
    currentTime: playerCurrentTime,
    duration: playerDuration,
    onPlayPause: handlePlayPause,
    onStepForward: handleStepForward,
    onStepBackward: handleStepBackward,
    onSeek: handleSeek,
  });

  if (isLoadingProject || isLoadingProtocol) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-editor-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent-blue border-t-transparent" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-editor-bg">
        <div className="rounded-lg p-8 max-w-md bg-editor-panel">
          <p className="mb-4 text-accent-red">
            {projectError || "Project not found"}
          </p>
          <button
            onClick={handleBackToProjects}
            className="px-4 py-2 text-white rounded-lg bg-accent-blue hover:bg-accent-cyan transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-screen w-screen overflow-hidden font-sans bg-editor-bg text-text-primary">
        {/* Header */}
        <Header
          projectId={project.id}
          projectName={projectName}
          protocol={protocol}
          onExport={handleExport}
          onBack={handleBackToProjects}
        />

        {/* Error Banner */}
        {protocolError && (
          <div className="border-b border-accent-red bg-accent-red/10 px-4 py-2">
            <p className="text-sm text-accent-red">⚠️ {protocolError}</p>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Section */}
          <div className="flex-1 flex min-h-0">
            {/* Left Sidebar: Resources */}
            <ResourcePanel
              activeTab={state.activeTab}
              onTabChange={setActiveTab}
              resources={resources}
              isLoading={isLoadingProtocol}
              projectPath={project?.path || null}
              loadResources={reloadProtocol}
              onResourceSelect={handleResourceSelect}
            />

            {/* Center: Player */}
            <WebGPUPlayer
              ref={playerRef}
              tracks={tracks}
              fps={fps}
              onTimeUpdate={handlePlayerTimeUpdate}
              onDurationChange={handlePlayerDurationChange}
              onPlayStateChange={handlePlayerPlayStateChange}
            />

            {/* Right Sidebar: Properties */}
            <PropertiesPanel
              activeTab={state.activePropertyTab}
              onTabChange={setActivePropertyTab}
              selectedResource={selectedResource}
              selectedClip={selectedClip}
              onClipTransformChange={handleClipTransformChange}
            />
          </div>

          {/* Bottom Section: Timeline */}
          <div className="flex-1 flex min-h-0">
            <Timeline
              ref={timelineRef}
              isPlaying={playerIsPlaying}
              currentTime={playerCurrentTime}
              duration={playerDuration}
              onPlayPause={handlePlayPause}
              onStepForward={handleStepForward}
              onStepBackward={handleStepBackward}
              onSeek={handleSeek}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          </div>
        </div>
      </div>

      {/* 拖拽覆盖层 - 显示正在拖拽的内容 */}
      <DragOverlay dropAnimation={null}>
        {activeDragData ? (
          <ClipDragPreview
            data={activeDragData}
            type={"name" in activeDragData ? "clip" : "resource"}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen w-screen bg-editor-bg">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent-blue border-t-transparent" />
        </div>
      }
    >
      <EditorPageContent />
    </Suspense>
  );
}
