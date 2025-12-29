# Audio Module

音频管理模块，为 WebGPUPlayer 提供统一的音频播放、混音和控制功能。

## 概述

该模块使用 Web Audio API 实现了专业级的音频处理能力，支持：

- ✅ 多轨道音频播放和混音
- ✅ 视频音频流的统一管理
- ✅ 精确的时间同步
- ✅ 音频裁剪（trim）
- ✅ 音量控制和静音
- ✅ 淡入淡出效果
- ✅ Seek 操作支持

## 架构设计

### 核心组件

```
audio/
├── AudioManager.ts      # 音频管理器 - 统一管理所有音频资源
├── AudioClipNode.ts     # 音频片段节点 - 管理单个音频片段
└── index.ts             # 模块导出
```

### 工作流程

1. **初始化**：创建 `AudioManager` 实例，初始化 `AudioContext`
2. **加载资源**：通过 `loadAudio()` 加载音频文件到缓冲区
3. **创建片段**：使用 `createAudioClip()` 创建音频片段节点
4. **播放控制**：通过 `play()`, `pause()`, `seekTo()` 控制播放
5. **时间同步**：在渲染循环中调用 `syncTime()` 保持同步

## 使用方法

### 基础用法

```typescript
import { AudioManager } from './audio';

// 1. 创建音频管理器
const audioManager = new AudioManager({
  masterVolume: 1.0,
  sampleRate: 48000, // 可选
});

// 2. 加载音频资源
await audioManager.loadAudio('audio-1', '/path/to/audio.mp3');

// 3. 创建音频片段
audioManager.createAudioClip({
  id: 'clip-1',
  bufferId: 'audio-1',
  startTime: 0,        // 在时间轴上的起始时间（秒）
  duration: 5.0,       // 片段持续时间（秒）
  trimStart: 0,        // 原始音频的裁剪起始点（秒）
  trimEnd: 5.0,        // 原始音频的裁剪结束点（秒）
  volume: 1.0,         // 音量 0-1
  fadeIn: 0.5,         // 淡入时长（秒）
  fadeOut: 0.5,        // 淡出时长（秒）
  muted: false,        // 是否静音
});

// 4. 播放
audioManager.play(0); // 从第 0 秒开始播放

// 5. 在渲染循环中同步时间
function renderLoop(currentTime) {
  audioManager.syncTime(currentTime);
  requestAnimationFrame(renderLoop);
}
```

### 视频音频管理

```typescript
// 将视频元素的音频流接入 AudioContext
const video = document.createElement('video');
video.src = '/path/to/video.mp4';

audioManager.addVideoAudio({
  id: 'video-1',
  videoElement: video,
  startTime: 0,
  duration: video.duration,
  volume: 1.0,
  muted: false,
});

// 控制视频音频
audioManager.setVideoVolume('video-1', 0.5);
audioManager.setVideoMuted('video-1', true);
```

### 音频片段控制

```typescript
// 设置片段音量
audioManager.setClipVolume('clip-1', 0.8);

// 设置片段静音
audioManager.setClipMuted('clip-1', true);

// 移除片段
audioManager.removeAudioClip('clip-1');
```

### 主控制

```typescript
// 设置主音量（影响所有音频）
audioManager.setMasterVolume(0.7);

// 暂停所有音频
audioManager.pause();

// Seek 到指定时间
audioManager.seekTo(10.0);

// 清空所有音频资源
audioManager.clear();

// 释放资源
audioManager.dispose();
```

## API 文档

### AudioManager

#### 构造函数

```typescript
constructor(config?: AudioManagerConfig)
```

**参数：**
- `config.masterVolume?: number` - 主音量，默认 1.0
- `config.sampleRate?: number` - 采样率，可选

#### 方法

##### `loadAudio(id: string, url: string): Promise<void>`

加载音频文件到缓冲区。

##### `createAudioClip(config: AudioClipConfig): void`

创建音频片段节点。

**AudioClipConfig:**
```typescript
{
  id: string;           // 片段 ID
  bufferId: string;     // 音频缓冲区 ID
  startTime: number;    // 在时间轴上的起始时间
  duration: number;     // 片段持续时间
  trimStart: number;    // 裁剪起始点
  trimEnd: number;      // 裁剪结束点
  volume: number;       // 音量 0-1
  fadeIn?: number;      // 淡入时长
  fadeOut?: number;     // 淡出时长
  muted?: boolean;      // 是否静音
}
```

##### `addVideoAudio(config: VideoAudioConfig): void`

添加视频元素的音频流。

##### `play(startTime?: number): void`

播放所有音频。

##### `pause(): void`

暂停所有音频。

##### `seekTo(time: number): void`

Seek 到指定时间。

##### `syncTime(time: number): void`

同步时间（在渲染循环中调用）。

##### `setMasterVolume(volume: number): void`

设置主音量。

##### `clear(): void`

清空所有音频资源。

##### `dispose(): void`

释放所有资源。

### AudioClipNode

音频片段节点，由 AudioManager 内部创建和管理。

#### 方法

##### `start(globalTime: number): void`

根据全局时间启动音频片段。

##### `stop(): void`

停止播放。

##### `setVolume(volume: number, rampTime?: number): void`

设置音量，支持渐变。

##### `setMuted(muted: boolean): void`

设置静音。

##### `shouldPlayAt(time: number): boolean`

检查 clip 是否应该在指定时间播放。

## 技术细节

### Web Audio API

该模块基于 Web Audio API 实现，提供了以下优势：

1. **精确时间控制**：使用 `AudioContext.currentTime` 实现亚毫秒级精度
2. **高质量混音**：多个音频源自动混合，无需手动处理
3. **音频图架构**：灵活的节点连接方式，易于扩展效果器
4. **高性能**：硬件加速，低延迟播放

### 音频图结构

```
[AudioBufferSourceNode] ──→ [GainNode] ──┐
[AudioBufferSourceNode] ──→ [GainNode] ──┤
[MediaElementSource]    ──→ [GainNode] ──┼──→ [MasterGainNode] ──→ [Destination]
[MediaElementSource]    ──→ [GainNode] ──┘
```

### 时间同步机制

1. **视频时间**：由 WebGPUPlayer 的渲染循环驱动
2. **音频时间**：通过 `syncTime()` 方法同步到视频时间
3. **启动检测**：自动检测进入播放范围的音频片段并启动
4. **Seek 处理**：停止所有音频节点，根据新时间重新创建

### 淡入淡出实现

使用 `GainNode.gain.linearRampToValueAtTime()` 实现平滑的音量过渡：

```typescript
// 淡入：从 0 到目标音量
gainNode.gain.setValueAtTime(0, now);
gainNode.gain.linearRampToValueAtTime(targetVolume, now + fadeInDuration);

// 淡出：从目标音量到 0
gainNode.gain.setValueAtTime(targetVolume, fadeOutStartTime);
gainNode.gain.linearRampToValueAtTime(0, fadeOutStartTime + fadeOutDuration);
```

## 集成到 WebGPUPlayer

在 `WebGPUPlayer.tsx` 中已经完成了集成：

```typescript
// 1. 初始化
const audioManagerRef = useRef<AudioManager | null>(null);

useEffect(() => {
  audioManagerRef.current = new AudioManager({ masterVolume: 1.0 });
  return () => audioManagerRef.current?.dispose();
}, []);

// 2. 同步轨道
const syncTracksToLayers = async (tracks: Track[]) => {
  // 处理音频轨道
  const audioClips = tracks.flatMap(track => 
    track.clips.filter(clip => clip.type === 'audio')
  );
  
  for (const clip of audioClips) {
    await audioManagerRef.current.loadAudio(bufferId, audioUrl);
    audioManagerRef.current.createAudioClip(config);
  }
};

// 3. 播放控制
const play = () => {
  audioManagerRef.current?.play(currentTime);
};

const pause = () => {
  audioManagerRef.current?.pause();
};

// 4. 时间同步（在渲染循环中）
audioManagerRef.current?.syncTime(currentTime);
```

## 性能优化

### 内存管理

- 音频缓冲区复用：相同音频文件只加载一次
- 及时释放：不再使用的资源立即释放
- 节点池：未来可实现节点池以减少创建开销

### 播放优化

- 懒加载：只有进入播放范围的片段才会启动
- 预调度：提前一帧检测即将播放的片段
- 自动停止：超出播放范围的片段自动停止

## 未来扩展

### 音频效果

```typescript
// 均衡器
const eq = context.createBiquadFilter();
eq.type = 'peaking';
eq.frequency.value = 1000;
eq.Q.value = 1;
eq.gain.value = 10;

// 压缩器
const compressor = context.createDynamicsCompressor();
compressor.threshold.value = -50;
compressor.knee.value = 40;
compressor.ratio.value = 12;
```

### 音频可视化

```typescript
// 频谱分析
const analyser = context.createAnalyser();
analyser.fftSize = 2048;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);
analyser.getByteFrequencyData(dataArray);

// 生成波形纹理用于可视化渲染
```

### 实时音频录制

```typescript
// MediaRecorder API
const destination = context.createMediaStreamDestination();
const recorder = new MediaRecorder(destination.stream);
recorder.start();
```

## 故障排除

### 常见问题

**Q: 音频无法播放？**
- 检查 AudioContext 状态，确保不是 'suspended'
- 调用 `audioContext.resume()` 恢复上下文
- 确保在用户交互后才创建 AudioContext（浏览器限制）

**Q: 音频与视频不同步？**
- 确保在渲染循环中调用 `syncTime()`
- 检查是否正确处理了 seek 操作
- 验证 startTime 和 duration 参数是否正确

**Q: 性能问题？**
- 减少同时播放的音频片段数量
- 使用更低的采样率（如 44100 Hz）
- 避免频繁创建和销毁节点

## 参考资料

- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioContext - MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)
- [AudioBufferSourceNode - MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode)
- [GainNode - MDN](https://developer.mozilla.org/en-US/docs/Web/API/GainNode)

## 许可

与 KivaCut 项目相同。