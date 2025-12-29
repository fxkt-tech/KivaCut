/**
 * AudioClipNode - 单个音频片段节点
 * 管理音频片段的播放、时间同步和音量控制
 */

export interface AudioClipConfig {
  id: string;
  bufferId: string;
  startTime: number; // 在时间轴上的起始时间（秒）
  duration: number; // clip 的持续时间（秒）
  trimStart: number; // 原始音频的裁剪起始点（秒）
  trimEnd: number; // 原始音频的裁剪结束点（秒）
  volume: number; // 音量 0-1
  fadeIn?: number; // 淡入时长（秒）
  fadeOut?: number; // 淡出时长（秒）
  muted?: boolean; // 是否静音
}

export class AudioClipNode {
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private isScheduled: boolean = false;
  private scheduledStartTime: number = 0;
  private config: AudioClipConfig;

  constructor(
    private context: AudioContext,
    private buffer: AudioBuffer,
    config: AudioClipConfig,
    private destination: AudioNode,
  ) {
    this.config = config;
    this.gainNode = context.createGain();
    this.gainNode.gain.value = config.muted ? 0 : config.volume;
    this.gainNode.connect(destination);
  }

  /**
   * 根据全局时间启动音频片段
   * @param globalTime 当前的全局播放时间（秒）
   */
  start(globalTime: number): void {
    if (this.isScheduled || this.sourceNode) {
      return;
    }

    const clipEndTime = this.config.startTime + this.config.duration;

    // 检查 clip 是否在播放范围内
    if (globalTime >= clipEndTime || globalTime < this.config.startTime) {
      return;
    }

    // 创建音频源节点
    this.sourceNode = this.context.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.connect(this.gainNode);

    // 计算播放参数
    const offsetInClip = globalTime - this.config.startTime; // 当前在 clip 中的位置
    const offsetInBuffer = this.config.trimStart + offsetInClip; // 在原始音频中的位置
    const remainingDuration = this.config.duration - offsetInClip; // 剩余播放时长

    // 计算实际可播放的时长（不超过原始音频的裁剪范围）
    const maxDuration = Math.min(
      this.config.trimEnd - offsetInBuffer,
      remainingDuration,
    );

    if (maxDuration <= 0) {
      this.stop();
      return;
    }

    // 应用淡入淡出效果
    this.applyFadeEffects(offsetInClip, remainingDuration);

    // 立即开始播放
    const now = this.context.currentTime;
    this.sourceNode.start(now, offsetInBuffer, maxDuration);
    this.scheduledStartTime = now;
    this.isScheduled = true;

    // 设置结束回调
    this.sourceNode.onended = () => {
      this.cleanup();
    };
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // 节点可能已经停止
      }
      this.cleanup();
    }
  }

  /**
   * 设置音量
   * @param volume 音量值 0-1
   * @param rampTime 渐变时间（秒），默认立即改变
   */
  setVolume(volume: number, rampTime: number = 0): void {
    this.config.volume = volume;
    const targetVolume = this.config.muted ? 0 : volume;

    if (rampTime > 0) {
      const now = this.context.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(targetVolume, now + rampTime);
    } else {
      this.gainNode.gain.value = targetVolume;
    }
  }

  /**
   * 设置静音
   */
  setMuted(muted: boolean): void {
    this.config.muted = muted;
    this.gainNode.gain.value = muted ? 0 : this.config.volume;
  }

  /**
   * 获取当前配置
   */
  getConfig(): AudioClipConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AudioClipConfig>): void {
    const needsRestart =
      config.trimStart !== undefined ||
      config.trimEnd !== undefined ||
      config.startTime !== undefined ||
      config.duration !== undefined;

    Object.assign(this.config, config);

    if (config.volume !== undefined) {
      this.setVolume(config.volume);
    }

    if (config.muted !== undefined) {
      this.setMuted(config.muted);
    }

    // 如果改变了时间相关的参数，需要重新启动
    if (needsRestart && this.isScheduled) {
      this.stop();
    }
  }

  /**
   * 检查 clip 是否应该在指定时间播放
   */
  shouldPlayAt(time: number): boolean {
    return (
      time >= this.config.startTime &&
      time < this.config.startTime + this.config.duration
    );
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.stop();
    this.gainNode.disconnect();
  }

  /**
   * 应用淡入淡出效果
   */
  private applyFadeEffects(
    offsetInClip: number,
    remainingDuration: number,
  ): void {
    const now = this.context.currentTime;
    const { fadeIn = 0, fadeOut = 0 } = this.config;
    const currentVolume = this.config.muted ? 0 : this.config.volume;

    // 淡入效果（仅在 clip 开始时）
    if (fadeIn > 0 && offsetInClip < fadeIn) {
      const fadeInRemaining = fadeIn - offsetInClip;
      this.gainNode.gain.setValueAtTime(0, now);
      this.gainNode.gain.linearRampToValueAtTime(
        currentVolume,
        now + fadeInRemaining,
      );
    } else {
      this.gainNode.gain.setValueAtTime(currentVolume, now);
    }

    // 淡出效果（在 clip 结束前）
    if (fadeOut > 0 && remainingDuration > fadeOut) {
      const fadeOutStartTime = now + remainingDuration - fadeOut;
      this.gainNode.gain.setValueAtTime(currentVolume, fadeOutStartTime);
      this.gainNode.gain.linearRampToValueAtTime(0, fadeOutStartTime + fadeOut);
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isScheduled = false;
    this.scheduledStartTime = 0;
  }
}
