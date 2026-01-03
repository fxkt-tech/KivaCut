// Timeline 核心类型定义

import { StageConfig } from "./protocol";

/**
 * 媒体资源类型
 */
export type MediaType = "video" | "audio" | "image" | "text";

/**
 * Clip 位置信息
 */
export interface ClipPosition {
  x: number;
  y: number;
}

/**
 * Clip 数据结构
 */
export interface Clip {
  id: string;
  name: string;
  type: MediaType;
  trackId: string;
  startTime: number; // 在轨道上的起始时间（秒）
  duration: number; // Clip 的持续时间（秒）

  // 媒体资源信息
  resourceId?: string;
  resourceSrc?: string;

  // 裁剪信息
  trimStart: number; // 原始资源的裁剪起始点（秒）
  trimEnd: number; // 原始资源的裁剪结束点（秒）

  // 变换属性
  position: ClipPosition;
  scale: number;
  rotation: number;
  opacity: number;

  // 音频属性
  volume: number; // 0-1
}

/**
 * 轨道类型
 */
export type TrackType = "video" | "audio";

/**
 * 轨道数据结构
 */
export interface Track {
  id: string;
  name: string;
  type: TrackType;
  clips: Clip[];
  visible: boolean;
  locked: boolean;
  muted: boolean;
  order: number; // 轨道顺序，数字越小越靠上
}

/**
 * Timeline 状态
 */
export interface TimelineState {
  stage: StageConfig; // 舞台配置
  tracks: Track[];
  pixelsPerSecond: number; // 缩放级别,每秒对应的像素数
  zoomLevel: number; // 缩放倍数
  scrollLeft: number; // 水平滚动位置
  scrollTop: number; // 垂直滚动位置

  // 选中状态
  selectedClipIds: string[];
  selectedTrackId: string | null;

  // 拖拽状态
  isDragging: boolean;
  draggedClipId: string | null;

  // 吸附设置
  snappingEnabled: boolean;
  snapThreshold: number; // 吸附阈值（像素）

  // 帧率设置
  fps: number; // 项目帧率

  // 时间显示格式
  timeDisplayFormat: "milliseconds" | "frames"; // 时间显示格式
}

/**
 * Timeline 配置常量
 */
export const TIMELINE_CONFIG = {
  // 布局常量
  TRACK_HEIGHT: 80, // 轨道高度（像素）- 保留作为默认值
  VIDEO_TRACK_HEIGHT: 60, // 视频轨道高度（像素）
  AUDIO_TRACK_HEIGHT: 40, // 音频轨道高度（像素）
  TRACK_HEADER_WIDTH: 180, // 轨道头部宽度（像素）
  MIN_CLIP_WIDTH: 10, // Clip 最小宽度（像素）

  // 缩放常量
  BASE_PIXELS_PER_SECOND: 50, // 基础缩放级别
  MIN_ZOOM: 0.1, // 最小缩放倍数
  MAX_ZOOM: 10, // 最大缩放倍数

  // 吸附常量
  SNAP_THRESHOLD: 5, // 默认吸附阈值（像素）

  // 标尺常量
  RULER_HEIGHT: 30, // 标尺高度（像素）
  MAJOR_TICK_INTERVAL: 1, // 主刻度间隔（秒）
  MINOR_TICK_COUNT: 5, // 每个主刻度之间的次刻度数量

  // 帧率常量
  DEFAULT_FPS: 30, // 默认帧率
} as const;

/**
 * 根据轨道类型获取轨道高度
 */
export function getTrackHeight(trackType: TrackType): number {
  return trackType === "video"
    ? TIMELINE_CONFIG.VIDEO_TRACK_HEIGHT
    : TIMELINE_CONFIG.AUDIO_TRACK_HEIGHT;
}

/**
 * 工具函数类型
 */
export interface TimelineUtils {
  timeToPixels: (time: number, pixelsPerSecond: number) => number;
  pixelsToTime: (pixels: number, pixelsPerSecond: number) => number;
  formatTime: (seconds: number) => string;
  snapTime: (time: number, snapPoints: number[], threshold: number) => number;
}

/**
 * 吸附点类型
 */
export interface SnapPoint {
  time: number;
  type: "clip-start" | "clip-end" | "playhead" | "marker";
  clipId?: string;
}

/**
 * 时间标记
 */
export interface TimeMark {
  time: number;
  label: string;
  isMajor: boolean;
}

/**
 * 拖拽数据
 */
export interface DragData {
  resourceId: string;
  resourceName: string;
  resourceType: MediaType;
  resourceSrc: string;
}

/**
 * 媒体信息（来自 Tauri 后端）
 */
export interface MediaInfo {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/**
 * 检查Clip类型是否可以添加到指定Track类型
 * @param clipType - Clip的媒体类型
 * @param trackType - Track的类型
 * @returns 是否可以添加
 */
export function canClipBeAddedToTrack(
  clipType: MediaType,
  trackType: TrackType,
): boolean {
  if (trackType === "video") {
    // Video Track 可以包含 video 和 image
    return clipType === "video" || clipType === "image";
  } else if (trackType === "audio") {
    // Audio Track 只能包含 audio
    return clipType === "audio";
  }
  return false;
}

/**
 * 获取媒体类型对应的轨道类型
 * @param mediaType - 媒体类型
 * @returns 对应的轨道类型
 */
export function getTrackTypeForMediaType(mediaType: MediaType): TrackType {
  return mediaType === "audio" ? "audio" : "video";
}
