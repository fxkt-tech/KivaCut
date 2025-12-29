/**
 * AudioSource - 音频媒体源
 * 实现 IMediaSource 接口，用于管理音频资源
 */

import { IMediaSource, MediaType, TextureResult } from "./types";

export class AudioSource implements IMediaSource {
  readonly id: string;
  readonly type: MediaType = "audio";

  private audioElement: HTMLAudioElement | null = null;
  private _duration: number = 0;
  private _isLoaded: boolean = false;
  private url: string = "";

  constructor(id: string) {
    this.id = id;
  }

  get duration(): number {
    return this._duration;
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get width(): number {
    // 音频没有宽度
    return 0;
  }

  get height(): number {
    // 音频没有高度
    return 0;
  }

  /**
   * 加载音频资源
   * @param url 音频文件路径
   */
  async load(url: string): Promise<void> {
    this.url = url;

    return new Promise((resolve, reject) => {
      this.audioElement = new Audio();
      this.audioElement.preload = "metadata";

      this.audioElement.addEventListener("loadedmetadata", () => {
        if (this.audioElement) {
          this._duration = this.audioElement.duration;
          this._isLoaded = true;
          resolve();
        }
      });

      this.audioElement.addEventListener("error", () => {
        const error = new Error(
          `Failed to load audio: ${url}, error: ${this.audioElement?.error?.message || "Unknown error"}`,
        );
        reject(error);
      });

      this.audioElement.src = url;
      this.audioElement.load();
    });
  }

  /**
   * 获取纹理（音频没有视觉纹理）
   * @returns null（音频不提供纹理）
   */
  getTexture(): TextureResult | null {
    // 音频没有视觉纹理
    // 如果未来需要音频可视化，可以在这里生成波形纹理
    return null;
  }

  /**
   * 播放（由 AudioManager 管理，这里不实际播放）
   */
  play(): void {
    // 音频播放由 AudioManager 统一管理
    // 这里保留接口兼容性
  }

  /**
   * 暂停（由 AudioManager 管理）
   */
  pause(): void {
    // 音频播放由 AudioManager 统一管理
  }

  /**
   * Seek（由 AudioManager 管理）
   */
  seek(): void {
    // 音频播放由 AudioManager 统一管理
  }

  /**
   * 获取音频元素（用于获取原始资源）
   */
  getAudioElement(): HTMLAudioElement | null {
    return this.audioElement;
  }

  /**
   * 获取音频 URL
   */
  getUrl(): string {
    return this.url;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      this.audioElement = null;
    }
    this._isLoaded = false;
    this._duration = 0;
    this.url = "";
  }
}
