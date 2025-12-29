/**
 * 媒体源模块导出
 * 提供统一的媒体源工厂和类型
 */

export * from "./types";
export { VideoSource } from "./VideoSource";
export { StaticImageSource } from "./StaticImageSource";
export { AnimatedImageSource } from "./AnimatedImageSource";
export { AudioSource } from "./AudioSource";

import { IMediaSource, MediaType } from "./types";
import { VideoSource } from "./VideoSource";
import { StaticImageSource } from "./StaticImageSource";
import { AnimatedImageSource } from "./AnimatedImageSource";
import { AudioSource } from "./AudioSource";

/**
 * 媒体源工厂
 * 根据文件类型自动创建对应的媒体源
 */
export class MediaSourceFactory {
  /**
   * 根据文件扩展名判断媒体类型
   */
  static detectMediaType(url: string): MediaType {
    const extension = url.toLowerCase().split(".").pop() || "";

    // 视频格式
    const videoExtensions = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "m4v"];
    if (videoExtensions.includes(extension)) {
      return "video";
    }

    // 动图格式
    const animatedImageExtensions = ["gif", "apng"];
    if (animatedImageExtensions.includes(extension)) {
      return "animated-image";
    }

    // 静态图片格式
    const staticImageExtensions = ["png", "jpg", "jpeg", "webp", "bmp", "svg"];
    if (staticImageExtensions.includes(extension)) {
      return "image";
    }

    // 音频格式（未来实现）
    const audioExtensions = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];
    if (audioExtensions.includes(extension)) {
      return "audio";
    }

    // 默认作为静态图片处理
    return "image";
  }

  /**
   * 创建媒体源实例
   * @param id 唯一标识符
   * @param url 媒体文件路径
   * @param type 媒体类型（可选，不提供则自动检测）
   */
  static createMediaSource(
    id: string,
    url: string,
    type?: MediaType,
  ): IMediaSource {
    const mediaType = type || this.detectMediaType(url);

    switch (mediaType) {
      case "video":
        return new VideoSource(id);

      case "image":
        return new StaticImageSource(id);

      case "animated-image":
        return new AnimatedImageSource(id);

      case "audio":
        return new AudioSource(id);

      default:
        throw new Error(`Unknown media type: ${mediaType}`);
    }
  }

  /**
   * 创建并加载媒体源
   * @param id 唯一标识符
   * @param url 媒体文件路径
   * @param type 媒体类型（可选）
   */
  static async createAndLoad(
    id: string,
    url: string,
    type?: MediaType,
  ): Promise<IMediaSource> {
    const source = this.createMediaSource(id, url, type);
    await source.load(url);
    return source;
  }
}
