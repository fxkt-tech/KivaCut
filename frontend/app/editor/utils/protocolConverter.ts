// Protocol Converter - 在 Timeline 数据和 CutProtocol 之间转换

import { Track, Clip, MediaType } from "../types/timeline";
import { CutProtocol, ProtocolTrack } from "../types/protocol";

/**
 * 将毫秒转换为秒（Protocol → Timeline）
 * Protocol 中的时间单位是毫秒(int)，Timeline 中的时间单位是秒(float)
 */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}

/**
 * 将秒转换为毫秒（Timeline → Protocol）
 * Timeline 中的时间单位是秒(float)，Protocol 中的时间单位是毫秒(int)
 */
export function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * 从 Protocol 转换到 Timeline 数据
 */
export function protocolToTimeline(protocol: CutProtocol): Track[] {
  return protocol.tracks.map((protoTrack, index) => {
    const trackType = protoTrack.type === "video" ? "video" : "audio";

    const clips: Clip[] = protoTrack.segments.map((segment) => {
      // 确定媒体类型
      let mediaType: MediaType = "video";
      let resourceSrc = "";
      let resourceName = "";
      let originalWidth = 1920;
      let originalHeight = 1080;

      // 从 materials 中查找对应的素材
      const videoMaterial = protocol.materials.videos.find(
        (v) => v.id === segment.material_id,
      );
      const audioMaterial = protocol.materials.audios.find(
        (a) => a.id === segment.material_id,
      );
      const imageMaterial = protocol.materials.images.find(
        (i) => i.id === segment.material_id,
      );

      if (videoMaterial) {
        mediaType = "video";
        resourceSrc = videoMaterial.src;
        resourceName = videoMaterial.name;
        originalWidth = videoMaterial.dimension.width;
        originalHeight = videoMaterial.dimension.height;
      } else if (audioMaterial) {
        mediaType = "audio";
        resourceSrc = audioMaterial.src;
        resourceName = audioMaterial.name;
      } else if (imageMaterial) {
        mediaType = "image";
        resourceSrc = imageMaterial.src;
        resourceName = imageMaterial.name;
        originalWidth = imageMaterial.dimension.width;
        originalHeight = imageMaterial.dimension.height;
      }

      // 计算 scale: Protocol 的 scale 是像素值，Timeline 的 scale 是倍数
      let scale = 1;
      if (segment.scale) {
        scale = segment.scale.width / originalWidth;
      }

      return {
        id: segment.id,
        name: resourceName,
        type: mediaType,
        trackId: protoTrack.id,
        // Protocol 使用毫秒(int)，Timeline 使用秒(float)
        startTime: msToSeconds(segment.target_timerange.start),
        duration: msToSeconds(segment.target_timerange.duration),
        resourceId: segment.material_id,
        resourceSrc: resourceSrc,
        trimStart: msToSeconds(segment.source_timerange.start),
        trimEnd: msToSeconds(
          segment.source_timerange.start + segment.source_timerange.duration,
        ),
        position: segment.position || { x: 0, y: 0 },
        scale: scale,
        rotation: segment.rotation || 0,
        opacity: segment.opacity ?? 1,
        volume: 1,
      };
    });

    return {
      id: protoTrack.id,
      name: `${trackType === "video" ? "Video" : "Audio"} Track ${index + 1}`,
      type: trackType,
      clips: clips,
      visible: true,
      locked: false,
      muted: false,
      order: index,
    };
  });
}

/**
 * 从 Timeline 转换到 Protocol 数据
 */
export function timelineToProtocol(
  tracks: Track[],
  existingProtocol: CutProtocol,
): CutProtocol {
  const protocolTracks: ProtocolTrack[] = [...tracks]
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      id: track.id,
      type: track.type,
      segments: track.clips.map((clip) => {
        // 获取素材原始尺寸
        let originalWidth = 1920;
        let originalHeight = 1080;

        const videoMaterial = existingProtocol.materials.videos.find(
          (v) => v.id === clip.resourceId,
        );
        const imageMaterial = existingProtocol.materials.images.find(
          (i) => i.id === clip.resourceId,
        );

        if (videoMaterial) {
          originalWidth = videoMaterial.dimension.width;
          originalHeight = videoMaterial.dimension.height;
        } else if (imageMaterial) {
          originalWidth = imageMaterial.dimension.width;
          originalHeight = imageMaterial.dimension.height;
        }

        // 计算像素尺寸: Timeline 的 scale 是倍数，Protocol 的 scale 是像素值
        const scaledWidth = Math.round(clip.scale * originalWidth);
        const scaledHeight = Math.round(clip.scale * originalHeight);

        return {
          id: clip.id,
          type: clip.type,
          material_id: clip.resourceId || "",
          // Timeline 使用秒(float)，Protocol 使用毫秒(int)
          target_timerange: {
            start: secondsToMs(clip.startTime),
            duration: secondsToMs(clip.duration),
          },
          source_timerange: {
            start: secondsToMs(clip.trimStart),
            duration: secondsToMs(clip.trimEnd - clip.trimStart),
          },
          scale: {
            width: scaledWidth,
            height: scaledHeight,
          },
          position: clip.position,
          rotation: clip.rotation !== 0 ? clip.rotation : undefined,
          opacity: clip.opacity !== 1 ? clip.opacity : undefined,
        };
      }),
    }));

  return {
    ...existingProtocol,
    tracks: protocolTracks,
  };
}

/**
 * 创建空的 Protocol（用于新项目）
 */
export function createEmptyProtocol(
  width: number = 1920,
  height: number = 1080,
): CutProtocol {
  return {
    stage: {
      width,
      height,
    },
    materials: {
      videos: [],
      images: [],
      audios: [],
    },
    tracks: [],
  };
}

/**
 * 验证 Protocol 数据的完整性
 */
export function validateProtocol(protocol: unknown): protocol is CutProtocol {
  if (!protocol || typeof protocol !== "object") return false;

  const p = protocol as Record<string, unknown>;

  if (!p.stage || typeof p.stage !== "object") return false;
  const stage = p.stage as Record<string, unknown>;
  if (typeof stage.width !== "number") return false;

  if (!p.materials) return false;
  if (!Array.isArray(p.tracks)) return false;

  return true;
}

/**
 * 合并两个 Protocol（主要用于添加新素材时）
 */
export function mergeProtocols(
  base: CutProtocol,
  updates: Partial<CutProtocol>,
): CutProtocol {
  return {
    stage: updates.stage || base.stage,
    materials: {
      videos: updates.materials?.videos || base.materials.videos,
      images: updates.materials?.images || base.materials.images,
      audios: updates.materials?.audios || base.materials.audios,
    },
    tracks: updates.tracks || base.tracks,
  };
}
