// Timeline Zustand Store

import { create } from "zustand";
import {
  Track,
  Clip,
  TimelineState,
  TIMELINE_CONFIG,
  canClipBeAddedToTrack,
} from "../types/timeline";
import { StageConfig } from "../types/protocol";
import { generateId, clamp } from "../utils/timeline";
import { produce } from "immer";
import { useHistoryStore } from "./historyStore";

/**
 * Timeline Store 接口
 */
interface TimelineStore extends TimelineState {
  // Stage 操作
  setStage: (stage: StageConfig) => void;

  // Track 操作
  addTrack: (type: "video" | "audio") => void;
  insertTrackAt: (index: number, type: "video" | "audio") => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTracks: (trackIds: string[]) => void;
  setTracks: (tracks: Track[]) => void;

  // Clip 操作
  addClip: (trackId: string, clip: Omit<Clip, "id" | "trackId">) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  updateClipTransform: (
    clipId: string,
    transform: {
      position?: { x: number; y: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
    },
  ) => void;
  moveClip: (
    clipId: string,
    targetTrackId: string,
    newStartTime: number,
  ) => void;
  duplicateClip: (clipId: string) => void;
  splitClip: (clipId: string, splitTime: number) => boolean;
  splitSelectedClips: (currentTime: number) => void;

  // 选择操作
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectClip: (clipId: string) => void;
  clearSelection: () => void;
  selectTrack: (trackId: string | null) => void;

  // 时间轴操作
  setZoomLevel: (level: number) => void;
  setScrollLeft: (scrollLeft: number) => void;
  setScrollTop: (scrollTop: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // 拖拽操作
  startDrag: (clipId: string) => void;
  endDrag: () => void;

  // 吸附设置
  toggleSnapping: () => void;
  setSnapThreshold: (threshold: number) => void;

  // 帧率设置
  setFps: (fps: number) => void;

  // 时间显示格式
  setTimeDisplayFormat: (format: "milliseconds" | "frames") => void;

  // 查询方法
  getClipById: (clipId: string) => Clip | undefined;
  getSelectedClip: () => Clip | null;
  getTrackById: (trackId: string) => Track | undefined;
  getClipsAtTime: (time: number) => Clip[];

  // 批量操作
  deleteSelectedClips: () => void;

  // 撤销/重做
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 重置
  reset: () => void;

  // 获取当前状态快照（用于历史记录）
  getStateSnapshot: () => {
    stage: StageConfig;
    tracks: Track[];
  };
}

/**
 * 初始状态
 */
const initialState: TimelineState = {
  stage: {
    width: 1920,
    height: 1080,
  },
  tracks: [],
  pixelsPerSecond: TIMELINE_CONFIG.BASE_PIXELS_PER_SECOND,
  zoomLevel: 1,
  scrollLeft: 0,
  scrollTop: 0,
  selectedClipIds: [],
  selectedTrackId: null,
  isDragging: false,
  draggedClipId: null,
  snappingEnabled: true,
  snapThreshold: TIMELINE_CONFIG.SNAP_THRESHOLD,
  fps: TIMELINE_CONFIG.DEFAULT_FPS,
  timeDisplayFormat: "frames",
};

/**
 * Timeline Store
 */
// 保存到历史记录的辅助函数
const saveToHistory = () => {
  const state = useTimelineStore.getState();
  const snapshot = state.getStateSnapshot();
  useHistoryStore.getState().addToHistory(snapshot);
};

export const useTimelineStore = create<TimelineStore>()((set, get) => ({
  ...initialState,

  // Stage 操作
  setStage: (stage: StageConfig) => {
    set({ stage });
  },

  // Track 操作
  addTrack: (type) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        const newTrack: Track = {
          id: generateId("track"),
          name: `${type === "video" ? "Video" : "Audio"} Track ${draft.tracks.length + 1}`,
          type,
          clips: [],
          visible: true,
          locked: false,
          muted: false,
          order: draft.tracks.length,
        };
        draft.tracks.push(newTrack);
      }),
    );
  },

  insertTrackAt: (index, type) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        const newTrack: Track = {
          id: generateId("track"),
          name: `${type === "video" ? "Video" : "Audio"} Track ${draft.tracks.length + 1}`,
          type,
          clips: [],
          visible: true,
          locked: false,
          muted: false,
          order: index,
        };
        // Insert track at the specified index
        draft.tracks.splice(index, 0, newTrack);
        // Update order for all tracks after insertion
        draft.tracks.forEach((track, idx) => {
          track.order = idx;
        });
      }),
    );
  },

  setTracks: (tracks) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        draft.tracks = tracks;
      }),
    );
  },

  removeTrack: (trackId) => {
    set((state) => {
      // 找到要删除的track
      const trackToDelete = state.tracks.find((track) => track.id === trackId);

      // 如果是video track，检查是否是唯一的video track
      if (trackToDelete?.type === "video") {
        const videoTrackCount = state.tracks.filter(
          (track) => track.type === "video",
        ).length;
        if (videoTrackCount <= 1) {
          // 不允许删除唯一的video track，返回原状态
          return state;
        }
      }

      saveToHistory();
      return produce(state, (draft) => {
        draft.tracks = draft.tracks.filter((track) => track.id !== trackId);
        // 重新排序
        draft.tracks.forEach((track, index) => {
          track.order = index;
        });
      });
    });
  },

  updateTrack: (trackId, updates) => {
    // 不为简单的可见性/锁定切换保存历史
    const shouldSaveHistory = !(
      "visible" in updates ||
      "locked" in updates ||
      "muted" in updates
    );
    if (shouldSaveHistory) {
      saveToHistory();
    }
    set((state) =>
      produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === trackId);
        if (track) {
          Object.assign(track, updates);
        }
      }),
    );
  },

  reorderTracks: (trackIds) => {
    set((state) =>
      produce(state, (draft) => {
        const trackMap = new Map(draft.tracks.map((t) => [t.id, t]));
        draft.tracks = trackIds
          .map((id) => trackMap.get(id))
          .filter((t): t is Track => t !== undefined);

        draft.tracks.forEach((track, index) => {
          track.order = index;
        });
      }),
    );
  },

  // Clip 操作
  addClip: (trackId, clipData) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === trackId);
        if (!track) return;

        // 验证类型兼容性
        if (!canClipBeAddedToTrack(clipData.type, track.type)) {
          console.warn(
            `Cannot add ${clipData.type} clip to ${track.type} track`,
          );
          return;
        }

        const newClip: Clip = {
          ...clipData,
          id: generateId("clip"),
          trackId,
          // 确保有默认 transform 值 - 中心原点坐标系 (0, 0)
          position: clipData.position ?? { x: 0, y: 0 },
          scale: clipData.scale ?? 1,
          rotation: clipData.rotation ?? 0,
          opacity: clipData.opacity ?? 1,
        };

        track.clips.push(newClip);
      }),
    );
  },

  removeClip: (clipId) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        for (const track of draft.tracks) {
          track.clips = track.clips.filter((c) => c.id !== clipId);
        }
        // 从选中列表中移除
        draft.selectedClipIds = draft.selectedClipIds.filter(
          (id) => id !== clipId,
        );
        // 删除空的 track
        draft.tracks = draft.tracks.filter((track) => track.clips.length > 0);
        // 重新排序剩余 tracks
        draft.tracks.forEach((track, index) => {
          track.order = index;
        });

        // 检查是否还有 video track，没有则创建一个
        const hasVideoTrack = draft.tracks.some(
          (track) => track.type === "video",
        );
        if (!hasVideoTrack) {
          const newTrack: Track = {
            id: generateId(),
            name: `视频轨道 ${draft.tracks.length + 1}`,
            type: "video",
            clips: [],
            visible: true,
            locked: false,
            muted: false,
            order: draft.tracks.length,
          };
          draft.tracks.push(newTrack);
        }
      }),
    );
  },

  updateClip: (clipId, updates) => {
    // 不为选中状态保存历史
    const shouldSaveHistory = Object.keys(updates).some(
      (key) => key !== "selected",
    );
    if (shouldSaveHistory) {
      saveToHistory();
    }
    set((state) =>
      produce(state, (draft) => {
        for (const track of draft.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            Object.assign(clip, updates);

            return;
          }
        }
      }),
    );
  },

  updateClipTransform: (clipId, transform) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        for (const track of draft.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            if (transform.position !== undefined) {
              clip.position = transform.position;
            }
            if (transform.scale !== undefined) {
              clip.scale = transform.scale;
            }
            if (transform.rotation !== undefined) {
              clip.rotation = transform.rotation;
            }
            if (transform.opacity !== undefined) {
              clip.opacity = transform.opacity;
            }
            return;
          }
        }
      }),
    );
  },

  moveClip: (clipId, targetTrackId, newStartTime) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        // 查找源轨道和 clip
        let clip: Clip | undefined;
        let sourceTrack: Track | undefined;

        for (const track of draft.tracks) {
          const foundClip = track.clips.find((c) => c.id === clipId);
          if (foundClip) {
            clip = foundClip;
            sourceTrack = track;
            break;
          }
        }

        if (!clip || !sourceTrack) return;

        // 查找目标轨道
        const targetTrack = draft.tracks.find((t) => t.id === targetTrackId);
        if (!targetTrack) return;

        // 验证类型兼容性
        if (!canClipBeAddedToTrack(clip.type, targetTrack.type)) {
          console.warn(
            `Cannot move ${clip.type} clip to ${targetTrack.type} track`,
          );
          return;
        }

        // 从源轨道移除
        sourceTrack.clips = sourceTrack.clips.filter((c) => c.id !== clipId);

        // 更新 clip 信息并添加到目标轨道
        clip.trackId = targetTrackId;
        clip.startTime = Math.max(0, newStartTime);
        targetTrack.clips.push(clip);
      }),
    );
  },

  duplicateClip: (clipId) => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        for (const track of draft.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            const newClip: Clip = {
              ...clip,
              id: generateId("clip"),
              startTime: clip.startTime + clip.duration + 0.1, // 放在原 clip 后面
            };
            track.clips.push(newClip);
            return;
          }
        }
      }),
    );
  },

  splitClip: (clipId, splitTime) => {
    const state = get();

    // 查找 Clip 和所在 Track
    let clip: Clip | undefined;
    let track: Track | undefined;

    for (const t of state.tracks) {
      const foundClip = t.clips.find((c) => c.id === clipId);
      if (foundClip) {
        clip = foundClip;
        track = t;
        break;
      }
    }

    if (!clip || !track) {
      return false;
    }

    // 验证分割点是否在有效范围内
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    const tolerance = 0.01; // 0.01 秒容差

    if (
      splitTime <= clipStart + tolerance ||
      splitTime >= clipEnd - tolerance
    ) {
      return false; // 分割点不在有效范围内
    }

    // 计算分割偏移量
    const splitOffset = splitTime - clipStart;

    // 验证 Clip 是否足够长
    if (clip.duration < 0.1) {
      return false; // Clip 太短，不允许分割
    }

    saveToHistory();

    set((state) =>
      produce(state, (draft) => {
        // 重新查找 track 和 clip（在 draft 中）
        const draftTrack = draft.tracks.find((t) => t.id === track!.id);
        if (!draftTrack) return;

        const clipIndex = draftTrack.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return;

        const originalClip = draftTrack.clips[clipIndex];

        // 创建第一个 Clip（左侧）
        const leftClip: Clip = {
          ...originalClip,
          id: generateId("clip"),
          duration: splitOffset,
          trimEnd: originalClip.trimEnd + (originalClip.duration - splitOffset),
        };

        // 创建第二个 Clip（右侧）
        const rightClip: Clip = {
          ...originalClip,
          id: generateId("clip"),
          startTime: splitTime,
          duration: originalClip.duration - splitOffset,
          trimStart: originalClip.trimStart + splitOffset,
        };

        // 移除原 Clip
        draftTrack.clips.splice(clipIndex, 1);

        // 添加两个新 Clip
        draftTrack.clips.push(leftClip, rightClip);

        // 更新选中状态：选中右侧 Clip
        draft.selectedClipIds = draft.selectedClipIds.filter(
          (id) => id !== clipId,
        );
        draft.selectedClipIds.push(rightClip.id);
      }),
    );

    return true;
  },

  splitSelectedClips: (currentTime: number) => {
    const state = get();
    const selectedIds = [...state.selectedClipIds]; // 复制数组，因为会被修改

    let successCount = 0;

    for (const clipId of selectedIds) {
      const success = get().splitClip(clipId, currentTime);
      if (success) {
        successCount++;
      }
    }

    return successCount;
  },

  // 选择操作
  selectClip: (clipId, addToSelection = false) => {
    set((state) =>
      produce(state, (draft) => {
        if (addToSelection) {
          if (!draft.selectedClipIds.includes(clipId)) {
            draft.selectedClipIds.push(clipId);
          }
        } else {
          draft.selectedClipIds = [clipId];
        }
      }),
    );
  },

  deselectClip: (clipId) => {
    set((state) =>
      produce(state, (draft) => {
        draft.selectedClipIds = draft.selectedClipIds.filter(
          (id) => id !== clipId,
        );
      }),
    );
  },

  clearSelection: () => {
    set((state) =>
      produce(state, (draft) => {
        draft.selectedClipIds = [];
      }),
    );
  },

  selectTrack: (trackId) => {
    set((state) =>
      produce(state, (draft) => {
        draft.selectedTrackId = trackId;
      }),
    );
  },

  // 时间轴操作
  setZoomLevel: (level) => {
    set((state) =>
      produce(state, (draft) => {
        draft.zoomLevel = clamp(
          level,
          TIMELINE_CONFIG.MIN_ZOOM,
          TIMELINE_CONFIG.MAX_ZOOM,
        );
        draft.pixelsPerSecond =
          TIMELINE_CONFIG.BASE_PIXELS_PER_SECOND * draft.zoomLevel;
      }),
    );
  },

  setScrollLeft: (scrollLeft) => {
    set((state) =>
      produce(state, (draft) => {
        draft.scrollLeft = Math.max(0, scrollLeft);
      }),
    );
  },

  setScrollTop: (scrollTop) => {
    set((state) =>
      produce(state, (draft) => {
        draft.scrollTop = Math.max(0, scrollTop);
      }),
    );
  },

  zoomIn: () => {
    const { zoomLevel, setZoomLevel } = get();
    setZoomLevel(Math.min(zoomLevel * 1.2, 5));
  },

  zoomOut: () => {
    const { zoomLevel, setZoomLevel } = get();
    setZoomLevel(Math.max(zoomLevel / 1.2, 0.1));
  },

  // 拖拽操作
  startDrag: (clipId) => {
    set((state) =>
      produce(state, (draft) => {
        draft.isDragging = true;
        draft.draggedClipId = clipId;
      }),
    );
  },

  endDrag: () => {
    set((state) =>
      produce(state, (draft) => {
        draft.isDragging = false;
        draft.draggedClipId = null;
      }),
    );
  },

  // 吸附设置
  toggleSnapping: () => {
    set((state) =>
      produce(state, (draft) => {
        draft.snappingEnabled = !draft.snappingEnabled;
      }),
    );
  },

  setSnapThreshold: (threshold) => {
    set((state) =>
      produce(state, (draft) => {
        draft.snapThreshold = Math.max(0, threshold);
      }),
    );
  },

  // 帧率设置
  setFps: (fps) => {
    set((state) =>
      produce(state, (draft) => {
        draft.fps = Math.max(1, Math.min(120, fps)); // 限制在 1-120 fps 之间
      }),
    );
  },

  // 时间显示格式设置
  setTimeDisplayFormat: (format) => {
    set((state) =>
      produce(state, (draft) => {
        draft.timeDisplayFormat = format;
      }),
    );
  },

  // 查询方法
  getClipById: (clipId) => {
    const state = get();
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  },

  getSelectedClip: () => {
    const state = get();
    if (state.selectedClipIds.length !== 1) return null;
    return state.getClipById(state.selectedClipIds[0]) ?? null;
  },

  getTrackById: (trackId) => {
    return get().tracks.find((t) => t.id === trackId);
  },

  getClipsAtTime: (time) => {
    const state = get();
    const clips: Clip[] = [];

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          clips.push(clip);
        }
      }
    }

    return clips;
  },

  // 批量操作
  deleteSelectedClips: () => {
    saveToHistory();
    set((state) =>
      produce(state, (draft) => {
        const selectedIds = new Set(draft.selectedClipIds);

        for (const track of draft.tracks) {
          track.clips = track.clips.filter((c) => !selectedIds.has(c.id));
        }

        draft.selectedClipIds = [];

        // 删除空的 track
        draft.tracks = draft.tracks.filter((track) => track.clips.length > 0);
        // 重新排序剩余 tracks
        draft.tracks.forEach((track, index) => {
          track.order = index;
        });

        // 检查是否还有 video track，没有则创建一个
        const hasVideoTrack = draft.tracks.some(
          (track) => track.type === "video",
        );
        if (!hasVideoTrack) {
          const newTrack: Track = {
            id: generateId(),
            name: `视频轨道 ${draft.tracks.length + 1}`,
            type: "video",
            clips: [],
            visible: true,
            locked: false,
            muted: false,
            order: draft.tracks.length,
          };
          draft.tracks.push(newTrack);
        }
      }),
    );
  },

  // 撤销/重做
  undo: () => {
    const getCurrentState = get().getStateSnapshot;
    const previousState = useHistoryStore.getState().undo(getCurrentState);
    if (previousState) {
      set((state) =>
        produce(state, (draft) => {
          draft.stage = previousState.stage;
          draft.tracks = previousState.tracks;
        }),
      );
    }
  },

  redo: () => {
    const nextState = useHistoryStore.getState().redo();
    if (nextState) {
      set((state) =>
        produce(state, (draft) => {
          draft.stage = nextState.stage;
          draft.tracks = nextState.tracks;
        }),
      );
    }
  },

  canUndo: () => {
    return useHistoryStore.getState().canUndo();
  },

  canRedo: () => {
    return useHistoryStore.getState().canRedo();
  },

  // 获取状态快照
  getStateSnapshot: () => {
    const state = get();
    return {
      stage: JSON.parse(JSON.stringify(state.stage)),
      tracks: JSON.parse(JSON.stringify(state.tracks)), // 深拷贝
    };
  },

  // 重置
  reset: () => {
    useHistoryStore.getState().clearHistory();
    set((state) =>
      produce(state, (draft) => {
        Object.assign(draft, initialState);
      }),
    );
  },
}));
