/**
 * AudioManager - 音频管理器
 * 统一管理所有音频片段的播放、暂停、seek 和混音
 */

import { AudioClipNode, AudioClipConfig } from "./AudioClipNode";

export interface AudioManagerConfig {
  masterVolume?: number;
  sampleRate?: number;
}

export interface VideoAudioConfig {
  id: string;
  videoElement: HTMLVideoElement;
  startTime: number;
  duration: number;
  volume?: number;
  muted?: boolean;
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private audioClips: Map<string, AudioClipNode> = new Map();
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private videoAudioSources: Map<string, MediaElementAudioSourceNode> =
    new Map();
  private videoGainNodes: Map<string, GainNode> = new Map();
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  private masterVolume: number = 1.0;

  constructor(config?: AudioManagerConfig) {
    console.log("🎵 AudioManager constructor called", config);
    this.masterVolume = config?.masterVolume ?? 1.0;
    this.initialize(config?.sampleRate);
    console.log("✅ AudioManager constructor completed");
  }

  /**
   * 初始化 AudioContext
   */
  private initialize(sampleRate?: number): void {
    try {
      console.log("🔧 Initializing AudioContext...", { sampleRate });
      this.audioContext = new AudioContext(
        sampleRate ? { sampleRate } : undefined,
      );
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.masterVolume;
      this.masterGainNode.connect(this.audioContext.destination);
      console.log("✅ AudioContext initialized successfully", {
        state: this.audioContext.state,
        sampleRate: this.audioContext.sampleRate,
        masterVolume: this.masterVolume,
      });
    } catch (error) {
      console.error("❌ Failed to initialize AudioContext:", error);
    }
  }

  /**
   * 加载音频文件
   * @param id 音频资源 ID
   * @param url 音频文件路径
   */
  async loadAudio(id: string, url: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(id, audioBuffer);
    } catch (error) {
      console.error(`Failed to load audio: ${url}`, error);
      throw error;
    }
  }

  /**
   * 创建音频片段
   * @param config 音频片段配置
   */
  createAudioClip(config: AudioClipConfig): void {
    if (!this.audioContext || !this.masterGainNode) {
      throw new Error("AudioContext not initialized");
    }

    const buffer = this.audioBuffers.get(config.bufferId);
    if (!buffer) {
      throw new Error(`Audio buffer not found: ${config.bufferId}`);
    }

    // 如果已存在同 ID 的 clip，先移除
    this.removeAudioClip(config.id);

    const clip = new AudioClipNode(
      this.audioContext,
      buffer,
      config,
      this.masterGainNode,
    );

    this.audioClips.set(config.id, clip);

    // 如果正在播放，立即启动这个 clip
    if (this.isPlaying && clip.shouldPlayAt(this.currentTime)) {
      clip.start(this.currentTime);
    }
  }

  /**
   * 移除音频片段
   * @param clipId 片段 ID
   */
  removeAudioClip(clipId: string): void {
    const clip = this.audioClips.get(clipId);
    if (clip) {
      clip.dispose();
      this.audioClips.delete(clipId);
    }
  }

  /**
   * 添加视频元素的音频流
   * @param config 视频音频配置
   */
  addVideoAudio(config: VideoAudioConfig): void {
    if (!this.audioContext || !this.masterGainNode) {
      console.warn("⚠️ AudioContext not initialized, skipping video audio");
      return;
    }

    // 如果已存在，先移除
    this.removeVideoAudio(config.id);

    try {
      console.log(`🎬 Adding video audio: ${config.id}`, {
        videoElement: config.videoElement,
        audioContextState: this.audioContext.state,
        masterGainValue: this.masterGainNode.gain.value,
        configVolume: config.volume,
        configMuted: config.muted,
      });

      // 将视频元素静音，音频由 AudioContext 管理
      config.videoElement.muted = true;

      // 创建 MediaElementSource
      // 注意：只能对同一个元素创建一次
      const source = this.audioContext.createMediaElementSource(
        config.videoElement,
      );

      // 创建 GainNode 用于音量控制
      const gainNode = this.audioContext.createGain();
      const targetVolume = config.muted ? 0 : (config.volume ?? 1.0);
      gainNode.gain.value = targetVolume;

      // 连接音频图
      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      this.videoAudioSources.set(config.id, source);
      this.videoGainNodes.set(config.id, gainNode);

      console.log(`✅ 视频音频连接成功: ${config.id}`, {
        gainNodeVolume: gainNode.gain.value,
        masterVolume: this.masterGainNode.gain.value,
        audioContextState: this.audioContext.state,
      });

      // 如果 AudioContext 是 suspended，尝试恢复
      if (this.audioContext.state === "suspended") {
        console.log("🔄 AudioContext is suspended, will resume on play");
      }
    } catch (error) {
      // 如果已经创建过 MediaElementSource，会抛出错误
      console.error(`❌ Failed to add video audio: ${config.id}`, error);
      console.warn(`⚠️ 降级：使用视频元素原生音频`);
      // 恢复视频元素的音频（fallback）
      config.videoElement.muted = false;
    }
  }

  /**
   * 移除视频音频
   * @param videoId 视频 ID
   */
  removeVideoAudio(videoId: string): void {
    const source = this.videoAudioSources.get(videoId);
    if (source) {
      source.disconnect();
      this.videoAudioSources.delete(videoId);
    }

    const gainNode = this.videoGainNodes.get(videoId);
    if (gainNode) {
      gainNode.disconnect();
      this.videoGainNodes.delete(videoId);
    }
  }

  /**
   * 设置视频音频音量
   * @param videoId 视频 ID
   * @param volume 音量 0-1
   */
  setVideoVolume(videoId: string, volume: number): void {
    const gainNode = this.videoGainNodes.get(videoId);
    if (gainNode) {
      gainNode.gain.value = volume;
    }
  }

  /**
   * 设置视频音频静音
   * @param videoId 视频 ID
   * @param muted 是否静音
   */
  setVideoMuted(videoId: string, muted: boolean): void {
    const gainNode = this.videoGainNodes.get(videoId);
    if (gainNode) {
      // 保持当前音量，只是静音
      gainNode.gain.value = muted ? 0 : gainNode.gain.value;
    }
  }

  /**
   * 播放所有音频
   * @param startTime 起始时间（秒）
   */
  play(startTime?: number): void {
    if (!this.audioContext) {
      console.warn("⚠️ AudioContext not available for play");
      return;
    }

    if (startTime !== undefined) {
      this.currentTime = startTime;
    }

    console.log(`▶️ AudioManager.play()`, {
      currentTime: this.currentTime,
      audioContextState: this.audioContext.state,
      audioClipsCount: this.audioClips.size,
      videoAudioCount: this.videoAudioSources.size,
    });

    // 恢复 AudioContext（关键：让视频音频也能播放）
    if (this.audioContext.state === "suspended") {
      console.log("🔄 Resuming AudioContext...");
      this.audioContext.resume().then(() => {
        console.log(
          "✅ AudioContext resumed, state:",
          this.audioContext!.state,
        );
      });
    }

    this.isPlaying = true;

    // 启动所有应该播放的音频片段
    this.audioClips.forEach((clip) => {
      if (clip.shouldPlayAt(this.currentTime)) {
        clip.start(this.currentTime);
      }
    });
  }

  /**
   * 暂停所有音频
   */
  pause(): void {
    if (!this.audioContext) return;

    this.isPlaying = false;

    // 暂停 AudioContext
    if (this.audioContext.state === "running") {
      this.audioContext.suspend();
    }

    // 停止所有音频片段
    this.audioClips.forEach((clip) => {
      clip.stop();
    });
  }

  /**
   * Seek 到指定时间
   * @param time 目标时间（秒）
   */
  seekTo(time: number): void {
    const wasPlaying = this.isPlaying;

    // 停止所有音频
    this.audioClips.forEach((clip) => {
      clip.stop();
    });

    this.currentTime = time;

    // 如果之前在播放，重新启动
    if (wasPlaying) {
      this.play(time);
    }
  }

  /**
   * 同步时间（在渲染循环中调用）
   * @param time 当前时间
   */
  syncTime(time: number): void {
    this.currentTime = time;

    if (this.isPlaying) {
      // 检查是否有新的 clip 需要启动
      this.audioClips.forEach((clip) => {
        const config = clip.getConfig();
        const clipStartTime = config.startTime;
        const clipEndTime = clipStartTime + config.duration;

        // 如果 clip 刚进入播放范围
        if (time >= clipStartTime && time < clipEndTime) {
          // 尝试启动（AudioClipNode 会检查是否已启动）
          clip.start(time);
        }
      });
    }
  }

  /**
   * 设置音频片段音量
   * @param clipId 片段 ID
   * @param volume 音量 0-1
   */
  setClipVolume(clipId: string, volume: number): void {
    const clip = this.audioClips.get(clipId);
    if (clip) {
      clip.setVolume(volume);
    }
  }

  /**
   * 设置音频片段静音
   * @param clipId 片段 ID
   * @param muted 是否静音
   */
  setClipMuted(clipId: string, muted: boolean): void {
    const clip = this.audioClips.get(clipId);
    if (clip) {
      clip.setMuted(muted);
    }
  }

  /**
   * 设置主音量
   * @param volume 音量 0-1
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  /**
   * 获取主音量
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * 获取当前播放状态
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取当前时间
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * 获取音频上下文状态
   */
  getContextState(): AudioContextState | null {
    return this.audioContext?.state ?? null;
  }

  /**
   * 清空所有音频资源
   */
  clear(): void {
    // 清空所有音频片段
    this.audioClips.forEach((clip) => clip.dispose());
    this.audioClips.clear();

    // 清空所有视频音频
    this.videoAudioSources.forEach((source) => source.disconnect());
    this.videoAudioSources.clear();

    this.videoGainNodes.forEach((gainNode) => gainNode.disconnect());
    this.videoGainNodes.clear();

    // 清空音频缓冲区
    this.audioBuffers.clear();

    this.currentTime = 0;
    this.isPlaying = false;
  }

  /**
   * 释放所有资源
   */
  dispose(): void {
    this.clear();

    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
      this.masterGainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * 获取音频缓冲区信息
   */
  getBufferInfo(
    bufferId: string,
  ): { duration: number; sampleRate: number } | null {
    const buffer = this.audioBuffers.get(bufferId);
    if (!buffer) return null;

    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
    };
  }

  /**
   * 获取所有音频片段 ID
   */
  getClipIds(): string[] {
    return Array.from(this.audioClips.keys());
  }

  /**
   * 获取所有视频音频 ID
   */
  getVideoAudioIds(): string[] {
    return Array.from(this.videoAudioSources.keys());
  }
}
