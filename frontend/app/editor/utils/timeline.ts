// Timeline 工具函数

import { Clip, TimeMark, Track } from "../types/timeline";

/**
 * 将时间转换为像素
 */
export function timeToPixels(time: number, pixelsPerSecond: number): number {
  return time * pixelsPerSecond;
}

/**
 * 将像素转换为时间
 */
export function pixelsToTime(pixels: number, pixelsPerSecond: number): number {
  return pixels / pixelsPerSecond;
}

/**
 * 格式化时间为 HH:MM:SS.mmm
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

/**
 * 简单时间格式化 MM:SS
 */
export function formatTimeSimple(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 格式化时间和帧号 HH:MM:SS.FF
 * @param seconds 时间（秒）
 * @param fps 帧率
 * @returns 格式化的字符串
 */
export function formatTimeWithFrames(seconds: number, fps: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${frames.toString().padStart(2, "0")}`;
}

/**
 * 根据当前显示格式格式化时间
 * @param seconds 时间（秒）
 * @param format 显示格式
 * @param fps 帧率
 * @returns 格式化的时间字符串
 */
export function formatTimeByDisplayMode(
  seconds: number,
  format: "milliseconds" | "frames",
  fps: number = 30,
): string {
  if (format === "frames") {
    return formatTimeWithFrames(seconds, fps);
  } else {
    return formatTime(seconds);
  }
}

/**
 * 仅格式化帧号
 * @param seconds 时间（秒）
 * @param fps 帧率
 * @returns 帧号字符串
 */
export function formatFrameNumber(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  return `${totalFrames}f`;
}

/**
 * 吸附时间到最近的吸附点
 * @param time 当前时间
 * @param snapPoints 吸附点时间数组
 * @param threshold 吸附阈值（像素）
 * @param pixelsPerSecond 每秒像素数
 * @returns 吸附后的时间
 */
export function snapTime(
  time: number,
  snapPoints: number[],
  threshold: number,
  pixelsPerSecond: number,
): number {
  if (snapPoints.length === 0) {
    return time;
  }

  // 将像素阈值转换为时间阈值
  const thresholdInSeconds = threshold / pixelsPerSecond;

  // 找到最近的吸附点
  let closestPoint = time;
  let minDistance = thresholdInSeconds;

  for (const point of snapPoints) {
    const distance = Math.abs(time - point);
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  }

  return closestPoint;
}

/**
 * 计算时间标记（用于标尺显示）
 */
export function calculateTimeMarks(
  startTime: number,
  endTime: number,
  pixelsPerSecond: number,
): TimeMark[] {
  const marks: TimeMark[] = [];

  // 根据缩放级别动态调整间隔
  let interval = 1; // 默认1秒
  if (pixelsPerSecond < 10) {
    interval = 10; // 缩小时使用10秒间隔
  } else if (pixelsPerSecond < 30) {
    interval = 5; // 使用5秒间隔
  } else if (pixelsPerSecond > 100) {
    interval = 0.5; // 放大时使用0.5秒间隔
  }

  const maxTime = Math.ceil(endTime / interval) * interval;

  for (let time = 0; time <= maxTime; time += interval) {
    if (time >= startTime && time <= endTime) {
      const isMajor = time % (interval * 5) === 0;
      marks.push({
        time,
        label: isMajor ? formatTimeSimple(time) : "",
        isMajor,
      });
    }
  }

  return marks;
}

/**
 * 计算基于帧的时间标记（用于标尺显示）
 * 刻度的最小单位为帧
 */
export function calculateFrameBasedTimeMarks(
  startTime: number,
  endTime: number,
  pixelsPerSecond: number,
  fps: number = 30,
): TimeMark[] {
  const marks: TimeMark[] = [];

  // 计算每帧的像素宽度
  const pixelsPerFrame = pixelsPerSecond / fps;

  // 根据缩放级别动态调整间隔（以帧为单位）
  let frameInterval = 1; // 默认每帧一个刻度
  let majorFrameInterval = fps; // 主刻度间隔（默认1秒）

  if (pixelsPerFrame < 2) {
    // 非常缩小：每10帧一个刻度，每10秒一个主刻度
    frameInterval = 10;
    majorFrameInterval = fps * 10;
  } else if (pixelsPerFrame < 5) {
    // 缩小：每5帧一个刻度，每5秒一个主刻度
    frameInterval = 5;
    majorFrameInterval = fps * 5;
  } else if (pixelsPerFrame < 10) {
    // 中等：每帧一个刻度，每秒一个主刻度
    frameInterval = 1;
    majorFrameInterval = fps;
  } else if (pixelsPerFrame < 20) {
    // 放大：每帧一个刻度，每秒一个主刻度
    frameInterval = 1;
    majorFrameInterval = fps;
  } else {
    // 非常放大：每帧一个刻度，每秒一个主刻度
    frameInterval = 1;
    majorFrameInterval = fps;
  }

  // 判断是否应该在次刻度显示帧号：主刻度间隔为1秒且空间足够大
  const showMinorFrameLabels =
    majorFrameInterval === fps && pixelsPerFrame >= 20;

  // 转换为帧数
  const startFrame = Math.floor(startTime * fps);
  const endFrame = Math.ceil(endTime * fps);

  // 生成刻度标记
  for (let frame = startFrame; frame <= endFrame; frame += frameInterval) {
    const time = frame / fps;

    if (time >= startTime && time <= endTime) {
      const isMajor = frame % majorFrameInterval === 0;
      let label = "";

      if (isMajor) {
        // 主刻度：始终显示完整时间格式（秒级，不显示帧）
        label = formatTimeSimple(time); // HH:MM:SS
      } else if (showMinorFrameLabels) {
        // 次刻度：仅在主刻度间隔为1秒且空间足够大时显示帧号
        const frameInSecond = Math.floor((time % 1) * fps);
        label = `${frameInSecond}F`;
      }

      marks.push({
        time,
        label,
        isMajor,
      });
    }
  }

  return marks;
}

/**
 * 检测 Clip 碰撞
 */
export function detectClipCollision(clip: Clip, otherClips: Clip[]): boolean {
  const clipEnd = clip.startTime + clip.duration;

  for (const other of otherClips) {
    if (other.id === clip.id) continue;

    const otherEnd = other.startTime + other.duration;

    // 检查时间范围是否重叠
    if (
      (clip.startTime >= other.startTime && clip.startTime < otherEnd) ||
      (clipEnd > other.startTime && clipEnd <= otherEnd) ||
      (clip.startTime <= other.startTime && clipEnd >= otherEnd)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 限制数值在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string = "id"): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * 将秒转换为帧数
 */
export function secondsToFrames(seconds: number, fps: number = 30): number {
  return Math.round(seconds * fps);
}

/**
 * 将帧数转换为秒
 */
export function framesToSeconds(frames: number, fps: number = 30): number {
  return frames / fps;
}

/**
 * 将时间吸附到最近的帧（四舍五入）
 * @param time 时间（秒）
 * @param fps 帧率
 * @returns 对齐到帧的时间
 */
export function snapToFrame(time: number, fps: number = 30): number {
  const frames = Math.round(time * fps);
  return frames / fps;
}

/**
 * 获取 Clip 的结束时间
 */
export function getClipEndTime(clip: Clip): number {
  return clip.startTime + clip.duration;
}

/**
 * 检查两个时间范围是否重叠
 */
export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * 计算轨道的总时长
 */
export function getTrackDuration(clips: Clip[]): number {
  if (clips.length === 0) return 0;

  return Math.max(...clips.map((clip) => clip.startTime + clip.duration));
}

/**
 * 四舍五入到指定的小数位数
 */
export function roundTo(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * 收集所有吸附点
 */
export interface SnapPoint {
  time: number;
  type: "clip-start" | "clip-end" | "playhead" | "marker";
  clipId?: string;
}

export function collectSnapPoints(
  clips: Clip[],
  currentTime: number,
  excludeClipId?: string,
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  // 添加播放头位置
  snapPoints.push({
    time: currentTime,
    type: "playhead",
  });

  // 添加时间轴起点
  snapPoints.push({
    time: 0,
    type: "marker",
  });

  // 添加所有片段的开始和结束点
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;

    // 片段开始点
    snapPoints.push({
      time: clip.startTime,
      type: "clip-start",
      clipId: clip.id,
    });

    // 片段结束点
    snapPoints.push({
      time: clip.startTime + clip.duration,
      type: "clip-end",
      clipId: clip.id,
    });
  }

  return snapPoints;
}

/**
 * 计算吸附后的时间
 */
export function calculateSnappedTime(
  time: number,
  snapPoints: SnapPoint[],
  threshold: number,
  pixelsPerSecond: number,
): { time: number; snapped: boolean; snapPoint?: SnapPoint } {
  if (snapPoints.length === 0) {
    return { time, snapped: false };
  }

  // 将像素阈值转换为时间阈值
  const thresholdInSeconds = threshold / pixelsPerSecond;

  let closestPoint: SnapPoint | null = null;
  let minDistance = thresholdInSeconds;

  for (const point of snapPoints) {
    const distance = Math.abs(time - point.time);
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  }

  if (closestPoint) {
    return {
      time: closestPoint.time,
      snapped: true,
      snapPoint: closestPoint,
    };
  }

  return {
    time,
    snapped: false,
  };
}

/**
 * 获取轨道中的所有片段
 */
export function getAllClipsFromTracks(tracks: Track[]): Clip[] {
  return tracks.flatMap((track) => track.clips);
}
