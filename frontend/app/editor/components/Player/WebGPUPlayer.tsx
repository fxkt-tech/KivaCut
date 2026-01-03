/**
 * WebGPU Video Player Component
 * 基于 WebGPU 的视频播放和合成引擎
 * 完全独立的播放器，不依赖外部状态管理
 */

import {
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
} from "react";
import {
  PlayIcon,
  PauseIcon,
  PreviousFrameIcon,
  NextFrameIcon,
} from "../../icons";
import { Track } from "../../types/timeline";
import { convertFileSrc } from "@tauri-apps/api/core";
import { SHADER_EXTERNAL, SHADER_2D } from "./shader/unified";
import { generateId, formatTimeByDisplayMode } from "../../utils/timeline";
import { useTimelineStore } from "../../stores/timelineStore";
import { MediaSourceFactory } from "./media-sources";
import { AudioManager } from "./audio/AudioManager";

// 临时开关：是否使用 AudioManager 管理视频音频
// 如果遇到问题，可以设置为 false 使用视频原生音频
const USE_AUDIO_MANAGER_FOR_VIDEO = false;

/**
 * 视频图层接口
 */
export interface VideoLayer {
  id: string;
  name: string;
  video: HTMLVideoElement;
  zIndex: number;
  posX: number;
  posY: number;
  scale: number;
  startTime: number;
  duration: number; // clip 在时间轴上的持续时间
  baseScaleX: number;
  baseScaleY: number;
  uniformBuffer?: GPUBuffer;
  opacity?: number;
  rotation?: number;
  isImage?: boolean; // 标记是否为图片（用于兼容性）
  imageTexture?: GPUTexture; // 图片纹理缓存
}

/**
 * Player 暴露的方法接口
 */
export interface PlayerRef {
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  addVideoLayer: (
    videoSrc: string,
    startTime: number,
    name?: string,
  ) => Promise<void>;
  addImageLayer: (
    imageSrc: string,
    startTime: number,
    duration: number,
    name?: string,
    clipId?: string,
    transform?: {
      position?: { x: number; y: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
    },
  ) => Promise<void>;
  clearLayers: () => void;
  updateLayerTransform: (
    layerId: string,
    transform: Partial<VideoLayer>,
  ) => void;
  updateClipTransform: (
    clipId: string,
    transform: {
      position?: { x: number; y: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
    },
  ) => void;
  syncTracksToLayers: (tracks: Track[]) => Promise<void>;
}

/**
 * Player 组件属性
 */
interface PlayerProps {
  tracks: Track[];
  fps?: number; // 帧率，用于上一帧/下一帧功能
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onDurationChange?: (duration: number) => void;
}

export const WebGPUPlayer = forwardRef<PlayerRef, PlayerProps>(
  (
    {
      tracks,
      fps = 30,
      onTimeUpdate,
      onPlayStateChange,
      onDurationChange,
    }: PlayerProps,
    ref,
  ) => {
    // Canvas 引用
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 播放状态 - 组件内部状态
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const timeDisplayFormat = useTimelineStore(
      (state) => state.timeDisplayFormat,
    );
    const storeFps = useTimelineStore((state) => state.fps);
    const [hasLayers, setHasLayers] = useState(false);
    const [isWebGPUReady, setIsWebGPUReady] = useState(false);

    // 使用 ref 来跟踪上次通知的值，避免重复通知
    const lastNotifiedTimeRef = useRef<number>(currentTime);
    const lastNotifiedDurationRef = useRef<number>(duration);
    const lastNotifiedPlayStateRef = useRef<boolean>(isPlaying);

    // WebGPU 资源引用
    const deviceRef = useRef<GPUDevice | null>(null);
    const contextRef = useRef<GPUCanvasContext | null>(null);
    const pipelineRef = useRef<GPURenderPipeline | null>(null);
    const pipeline2DRef = useRef<GPURenderPipeline | null>(null);
    const samplerRef = useRef<GPUSampler | null>(null);

    // 音频管理器引用
    const audioManagerRef = useRef<AudioManager | null>(null);

    // 图层和动画状态
    const layersRef = useRef<VideoLayer[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number>(0);
    const isSeekingRef = useRef(false);
    const isPlayingRef = useRef(isPlaying);
    const currentTimeRef = useRef(currentTime);
    const durationRef = useRef(duration);

    // 画布尺寸 - 从 stage 获取
    const stage = useTimelineStore((state) => state.stage);
    const width: number = stage.width;
    const height: number = stage.height;

    /**
     * 将像素坐标转换为 WebGPU 标准化坐标
     * 像素坐标系：中心为原点 (0, 0)，向右为 X 正方向，向上为 Y 正方向
     * WebGPU 坐标系：中心为原点 (0, 0)，向右为 X 正方向，向上为 Y 正方向，范围 [-1, 1]
     */
    const pixelToNormalized = useCallback(
      (pixelX: number, pixelY: number): { x: number; y: number } => {
        // 将像素值转换为标准化坐标
        const normalizedX = pixelX / (width / 2);
        const normalizedY = pixelY / (height / 2);
        return { x: normalizedX, y: normalizedY };
      },
      [width, height],
    );

    /**
     * 将 WebGPU 标准化坐标转换为像素坐标
     * 暂时未使用，保留供将来使用
     */
    // const normalizedToPixel = useCallback(
    //   (normalizedX: number, normalizedY: number): { x: number; y: number } => {
    //     const pixelX = normalizedX * (width / 2);
    //     const pixelY = normalizedY * (height / 2);
    //     return { x: pixelX, y: pixelY };
    //   },
    //   [width, height],
    // );

    /**
     * 初始化 WebGPU
     */
    const initWebGPU = async () => {
      if (!navigator.gpu) {
        console.error("WebGPU 不支持");
        return false;
      }

      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          console.error("无法获取 GPU 适配器");
          return false;
        }

        const device = await adapter.requestDevice();
        deviceRef.current = device;

        const canvas = canvasRef.current;
        if (!canvas) return false;

        // 设置画布尺寸
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("webgpu");
        if (!context) {
          console.error("无法获取 WebGPU 上下文");
          return false;
        }

        contextRef.current = context;
        context.configure({
          device,
          format: navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: "premultiplied",
        });

        // 创建 Shader 模块 (external texture for video)
        const shaderModule = device.createShaderModule({
          code: SHADER_EXTERNAL,
        });

        // 创建渲染管线 (external texture for video)
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: {
            module: shaderModule,
            entryPoint: "vs_main",
          },
          fragment: {
            module: shaderModule,
            entryPoint: "fs_main",
            targets: [
              {
                format: navigator.gpu.getPreferredCanvasFormat(),
                blend: {
                  color: {
                    operation: "add",
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                  },
                  alpha: {
                    operation: "add",
                    srcFactor: "one",
                    dstFactor: "one-minus-src-alpha",
                  },
                },
              },
            ],
          },
          primitive: { topology: "triangle-strip" },
        });

        pipelineRef.current = pipeline;

        // 创建 Shader 模块 (2D texture for images)
        const shader2DModule = device.createShaderModule({ code: SHADER_2D });

        // 创建渲染管线 (2D texture for images)
        const pipeline2D = device.createRenderPipeline({
          layout: "auto",
          vertex: {
            module: shader2DModule,
            entryPoint: "vs_main",
          },
          fragment: {
            module: shader2DModule,
            entryPoint: "fs_main",
            targets: [
              {
                format: navigator.gpu.getPreferredCanvasFormat(),
                blend: {
                  color: {
                    operation: "add",
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                  },
                  alpha: {
                    operation: "add",
                    srcFactor: "one",
                    dstFactor: "one-minus-src-alpha",
                  },
                },
              },
            ],
          },
          primitive: { topology: "triangle-strip" },
        });

        pipeline2DRef.current = pipeline2D;

        // 创建采样器
        const sampler = device.createSampler({
          magFilter: "linear",
          minFilter: "linear",
        });

        samplerRef.current = sampler;

        setIsWebGPUReady(true);
        return true;
      } catch (error) {
        console.error("WebGPU 初始化失败:", error);
        setIsWebGPUReady(false);
        return false;
      }
    };

    /**
     * 同步所有视频到指定时间
     */
    const syncVideosToTime = useCallback((time: number) => {
      layersRef.current.forEach((layer) => {
        // 跳过图片图层，图片不需要视频同步
        if (layer.isImage) return;

        const clipDuration = layer.duration || layer.video.duration;
        if (!clipDuration) return;

        const localTime = time - layer.startTime;
        const targetTime = Math.max(0, Math.min(localTime, clipDuration));

        if (
          Math.abs(layer.video.currentTime - targetTime) > 0.05 &&
          layer.video.readyState >= 2
        ) {
          layer.video.currentTime = targetTime;
        }
      });
    }, []);

    /**
     * 渲染循环 - 使用 ref 获取最新状态
     */
    const renderLoopRef = useRef<((timestamp: number) => void) | null>(null);

    useEffect(() => {
      isPlayingRef.current = isPlaying;
      currentTimeRef.current = currentTime;
      durationRef.current = duration;

      const renderLoop = (timestamp: number) => {
        if (!lastTimestampRef.current) {
          lastTimestampRef.current = timestamp;
        }

        const deltaTime = (timestamp - lastTimestampRef.current) / 1000;
        lastTimestampRef.current = timestamp;

        const device = deviceRef.current;
        const context = contextRef.current;
        const pipeline = pipelineRef.current;
        const pipeline2D = pipeline2DRef.current;
        const sampler = samplerRef.current;

        if (!device || !context || !pipeline || !pipeline2D || !sampler) {
          animationFrameRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        const currentIsPlaying = isPlayingRef.current;
        const currentDuration = durationRef.current;
        let newTime = currentTimeRef.current;

        // 更新时间
        if (!isSeekingRef.current && currentIsPlaying) {
          newTime += deltaTime;

          if (newTime >= currentDuration) {
            newTime = currentDuration;
            // 播放结束，暂停
            setIsPlaying(false);
            layersRef.current.forEach((layer) => layer.video.pause());
            // 暂停音频
            if (audioManagerRef.current) {
              audioManagerRef.current.pause();
            }
          }

          setCurrentTime(newTime);

          // 同步音频时间
          if (audioManagerRef.current) {
            audioManagerRef.current.syncTime(newTime);
          }
        }

        // 开始渲染
        const commandEncoder = device.createCommandEncoder();
        const currentTexture = context.getCurrentTexture();
        const renderPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: currentTexture.createView(),
              clearValue: { r: 0.02, g: 0.02, b: 0.02, a: 1.0 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });

        // 按 zIndex 排序图层
        const sortedLayers = [...layersRef.current].sort(
          (a, b) => a.zIndex - b.zIndex,
        );

        for (const layer of sortedLayers) {
          const localTime = newTime - layer.startTime;

          // 调试：每隔一段时间输出图层状态
          if (layer.isImage && Math.floor(newTime * 10) % 10 === 0) {
            console.log("🎬 渲染图层:", {
              id: layer.id,
              name: layer.name,
              isImage: layer.isImage,
              localTime,
              duration: layer.duration,
              hasTexture: !!layer.imageTexture,
              currentTime: newTime,
              startTime: layer.startTime,
            });
          }

          // 控制视频播放状态（仅对视频）
          if (!layer.isImage) {
            if (currentIsPlaying && !isSeekingRef.current) {
              const videoClipDuration = layer.duration || layer.video.duration;
              if (localTime >= 0 && localTime < videoClipDuration) {
                if (layer.video.paused && !layer.video.ended) {
                  layer.video.play().catch(() => {});
                }
              } else {
                if (!layer.video.paused) {
                  layer.video.pause();
                }
              }
            }
          }

          // 判断是否可见
          const clipDuration = layer.duration || layer.video.duration;
          const isVisible = localTime >= 0 && localTime <= clipDuration;

          // 检查资源是否准备好
          let hasResource = false;
          if (layer.isImage) {
            hasResource = !!layer.imageTexture;
            if (!hasResource && Math.floor(newTime * 10) % 10 === 0) {
              console.warn("⚠️ 图片纹理未就绪:", layer.name);
            }
          } else {
            hasResource = layer.video.readyState >= 2 && !layer.video.seeking;
          }

          if (
            !isVisible &&
            layer.isImage &&
            Math.floor(newTime * 10) % 10 === 0
          ) {
            console.log("👁️ 图片不可见:", {
              name: layer.name,
              localTime,
              duration: layer.duration,
              isVisible,
            });
          }

          if (isVisible && hasResource) {
            try {
              // 将像素坐标转换为标准化坐标
              const normalizedPos = pixelToNormalized(layer.posX, layer.posY);

              // 更新 uniform buffer
              const data = new Float32Array([
                normalizedPos.x,
                normalizedPos.y,
                layer.baseScaleX * layer.scale,
                layer.baseScaleY * layer.scale,
                layer.rotation ?? 0,
                layer.opacity ?? 1.0,
              ]);

              if (!layer.uniformBuffer) {
                layer.uniformBuffer = device.createBuffer({
                  size: 24,
                  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
              }

              device.queue.writeBuffer(layer.uniformBuffer, 0, data);

              // 根据类型选择管线并创建 bind group
              let bindGroup: GPUBindGroup;

              if (layer.isImage && layer.imageTexture) {
                // 图片：使用 2D 纹理管线
                if (Math.floor(newTime * 10) % 50 === 0) {
                  console.log("🎨 使用 2D 纹理管线渲染图片:", layer.name);
                }
                renderPass.setPipeline(pipeline2D);
                bindGroup = device.createBindGroup({
                  layout: pipeline2D.getBindGroupLayout(0),
                  entries: [
                    { binding: 0, resource: { buffer: layer.uniformBuffer } },
                    { binding: 1, resource: sampler },
                    {
                      binding: 2,
                      resource: layer.imageTexture.createView(),
                    },
                  ],
                });
              } else {
                // 视频：使用外部纹理管线
                renderPass.setPipeline(pipeline);
                bindGroup = device.createBindGroup({
                  layout: pipeline.getBindGroupLayout(0),
                  entries: [
                    { binding: 0, resource: { buffer: layer.uniformBuffer } },
                    { binding: 1, resource: sampler },
                    {
                      binding: 2,
                      resource: device.importExternalTexture({
                        source: layer.video,
                      }),
                    },
                  ],
                });
              }

              renderPass.setBindGroup(0, bindGroup);
              renderPass.draw(4);
            } catch (error) {
              // 渲染错误
              console.error("❌ 渲染错误:", {
                layer: layer.name,
                isImage: layer.isImage,
                error,
              });
            }
          }
        }

        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);

        animationFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoopRef.current = renderLoop;
    }, [isPlaying, currentTime, duration, pixelToNormalized]);

    /**
     * 更新总时长（根据所有图层的最大结束时间）
     */
    const updateDuration = useCallback(() => {
      const maxDuration =
        layersRef.current.length === 0
          ? 0
          : Math.max(
              ...layersRef.current.map(
                (l) => l.startTime + (l.duration || l.video.duration || 0),
              ),
            );

      setDuration((prevDuration) => {
        if (Math.abs(prevDuration - maxDuration) > 0.001) {
          return maxDuration;
        }
        return prevDuration;
      });
    }, []);

    /**
     * 添加视频图层
     */
    const addVideoLayer = useCallback(
      async (
        videoSrc: string,
        startTime: number = 0,
        name?: string,
        clipId?: string,
        transform?: {
          position?: { x: number; y: number };
          scale?: number;
          rotation?: number;
          opacity?: number;
        },
      ): Promise<void> => {
        const device = deviceRef.current;
        if (!device) {
          console.error("WebGPU 未初始化");
          return;
        }

        return new Promise((resolve, reject) => {
          const video = document.createElement("video");
          video.src = videoSrc;
          video.muted = USE_AUDIO_MANAGER_FOR_VIDEO; // 如果使用 AudioManager 则静音
          video.playsInline = true;
          video.crossOrigin = "anonymous";
          video.preload = "auto";

          video.onloadedmetadata = () => {
            const canvasAspect = width / height;
            const videoAspect = video.videoWidth / video.videoHeight;

            let initScaleX = 1.0;
            let initScaleY = 1.0;

            // 自适应缩放以适配画布
            if (videoAspect > canvasAspect) {
              initScaleY = canvasAspect / videoAspect;
            } else {
              initScaleX = videoAspect / canvasAspect;
            }

            const layer: VideoLayer = {
              id: clipId ?? generateId(),
              name: name || `Video ${layersRef.current.length + 1}`,
              video,
              zIndex: 100 - layersRef.current.length,
              // 默认位置为中心 (0, 0) - 笛卡尔坐标系
              posX: transform?.position?.x ?? 0,
              posY: transform?.position?.y ?? 0,
              scale: transform?.scale ?? 1.0,
              startTime,
              duration: video.duration,
              baseScaleX: initScaleX,
              baseScaleY: initScaleY,
              opacity: transform?.opacity ?? 1.0,
              rotation: transform?.rotation
                ? transform.rotation * (Math.PI / 180)
                : 0,
              isImage: false,
            };

            layersRef.current.push(layer);
            setHasLayers(true);
            updateDuration();

            // 将视频音频添加到 AudioManager（如果启用）
            if (
              USE_AUDIO_MANAGER_FOR_VIDEO &&
              audioManagerRef.current &&
              video.duration > 0
            ) {
              try {
                console.log("🎬 Adding video audio to AudioManager:", layer.id);
                audioManagerRef.current.addVideoAudio({
                  id: layer.id,
                  videoElement: video,
                  startTime,
                  duration: video.duration,
                  volume: 1.0,
                  muted: false,
                });
              } catch (error) {
                console.error(
                  "❌ Failed to add video audio to AudioManager:",
                  error,
                );
                // 如果添加失败，恢复视频原生音频
                video.muted = false;
                console.warn("⚠️ 降级：使用视频元素原生音频");
              }
            } else {
              // 不使用 AudioManager 或未初始化，使用视频原生音频
              if (!USE_AUDIO_MANAGER_FOR_VIDEO) {
                console.log(
                  "ℹ️ Using native video audio (AudioManager disabled for video)",
                );
              } else if (!audioManagerRef.current) {
                console.warn(
                  "⚠️ AudioManager not initialized, using native video audio",
                );
              }
              video.muted = false;
            }

            resolve();
          };

          video.onerror = () => {
            reject(new Error("视频加载失败"));
          };
        });
      },
      [updateDuration, width, height],
    );

    /**
     * 添加图片图层
     */
    const addImageLayer = useCallback(
      async (
        imageSrc: string,
        startTime: number = 0,
        duration: number = 5,
        name?: string,
        clipId?: string,
        transform?: {
          position?: { x: number; y: number };
          scale?: number;
          rotation?: number;
          opacity?: number;
        },
      ): Promise<void> => {
        const device = deviceRef.current;
        if (!device) {
          console.error("WebGPU 未初始化");
          return;
        }

        console.log("🖼️ 开始加载图片:", imageSrc);

        try {
          // 使用 MediaSourceFactory 加载图片
          const layerId = clipId ?? generateId();
          console.log("📝 创建图层 ID:", layerId);

          const source = await MediaSourceFactory.createAndLoad(
            layerId,
            imageSrc,
          );

          console.log("✅ 图片加载成功:", {
            type: source.type,
            width: source.width,
            height: source.height,
            duration: source.duration,
          });

          // 计算基础缩放
          const canvasAspect = width / height;
          const imageAspect = source.width / source.height;

          let initScaleX = 1.0;
          let initScaleY = 1.0;

          if (imageAspect > canvasAspect) {
            initScaleY = canvasAspect / imageAspect;
          } else {
            initScaleX = imageAspect / canvasAspect;
          }

          console.log("📐 计算缩放:", { initScaleX, initScaleY });

          // 获取纹理并缓存
          const textureResult = source.getTexture(device, 0);
          if (!textureResult || textureResult.type !== "2d") {
            throw new Error("无法获取图片纹理");
          }

          console.log("🎨 纹理创建成功:", textureResult.type);

          // 创建一个假的 video 元素用于兼容现有渲染逻辑
          const dummyVideo = document.createElement("video");
          dummyVideo.width = source.width;
          dummyVideo.height = source.height;

          const layer: VideoLayer = {
            id: layerId,
            name: name || `Image ${layersRef.current.length + 1}`,
            video: dummyVideo,
            zIndex: 100 - layersRef.current.length,
            posX: transform?.position?.x ?? 0,
            posY: transform?.position?.y ?? 0,
            scale: transform?.scale ?? 1.0,
            startTime,
            duration: duration,
            baseScaleX: initScaleX,
            baseScaleY: initScaleY,
            opacity: transform?.opacity ?? 1.0,
            rotation: transform?.rotation
              ? transform.rotation * (Math.PI / 180)
              : 0,
            isImage: true,
            imageTexture: textureResult.texture as GPUTexture,
          };

          layersRef.current.push(layer);
          setHasLayers(true);
          updateDuration();

          console.log("🎉 图片图层添加成功:", {
            id: layerId,
            name: layer.name,
            startTime,
            duration,
            layerCount: layersRef.current.length,
          });
        } catch (error) {
          console.error("❌ 图片加载失败:", error);
          throw error;
        }
      },
      [updateDuration, width, height],
    );

    /**
     * 清空所有图层
     */
    const clearLayers = useCallback(() => {
      layersRef.current.forEach((layer) => {
        if (!layer.isImage) {
          layer.video.pause();
          layer.video.src = "";
        }
        if (layer.imageTexture) {
          layer.imageTexture.destroy();
        }
        if (layer.uniformBuffer) {
          layer.uniformBuffer.destroy();
        }
      });
      layersRef.current = [];
      setHasLayers(false);
      setCurrentTime(0);
      updateDuration();
    }, [updateDuration]);

    /**
     * 更新图层变换
     */
    const updateLayerTransform = useCallback(
      (layerId: string, transform: Partial<VideoLayer>) => {
        const layer = layersRef.current.find((l) => l.id === layerId);
        if (layer) {
          Object.assign(layer, transform);
        }
      },
      [],
    );

    /**
     * 从 Timeline tracks 同步视频图层
     */
    const syncTracksToLayers = useCallback(
      async (newTracks: Track[]) => {
        const device = deviceRef.current;
        if (!device || !isWebGPUReady) {
          console.warn("WebGPU 未就绪，等待初始化...");
          return;
        }

        // 收集所有视频和图片 clips
        const mediaClips = newTracks.flatMap((track) =>
          track.clips
            .filter(
              (clip) =>
                (clip.type === "video" || clip.type === "image") &&
                clip.resourceSrc,
            )
            .map((clip) => ({
              id: clip.id,
              type: clip.type,
              src: clip.resourceSrc!,
              startTime: clip.startTime,
              duration: clip.duration,
              name: clip.name,
              transform: {
                position: clip.position,
                scale: clip.scale,
                rotation: clip.rotation,
                opacity: clip.opacity,
              },
            })),
        );

        // 收集所有音频 clips
        const audioClips = newTracks.flatMap((track) =>
          track.clips
            .filter((clip) => clip.type === "audio" && clip.resourceSrc)
            .map((clip) => ({
              id: clip.id,
              src: clip.resourceSrc!,
              startTime: clip.startTime,
              duration: clip.duration,
              trimStart: clip.trimStart || 0,
              trimEnd: clip.trimEnd || clip.duration,
              volume: clip.volume ?? 1.0,
              name: clip.name,
            })),
        );

        // 检查是否需要更新 - 不仅检查 ID，还要检查 startTime 等属性
        const existingIds = new Set(layersRef.current.map((l) => l.id));
        const newIds = new Set(mediaClips.map((c) => c.id));

        // 检查是否有 ID 变化或 startTime 变化
        let needsUpdate =
          existingIds.size !== newIds.size ||
          ![...existingIds].every((id) => newIds.has(id));

        // 如果 ID 相同，检查 startTime 是否有变化
        if (!needsUpdate) {
          for (const clip of mediaClips) {
            const layer = layersRef.current.find((l) => l.id === clip.id);
            if (layer && Math.abs(layer.startTime - clip.startTime) > 0.001) {
              needsUpdate = true;
              break;
            }
          }
        }

        if (!needsUpdate) {
          return;
        }

        // 清空现有图层
        layersRef.current.forEach((layer) => {
          if (!layer.isImage) {
            layer.video.pause();
            layer.video.src = "";
          }
          if (layer.imageTexture) {
            layer.imageTexture.destroy();
          }
          if (layer.uniformBuffer) {
            layer.uniformBuffer.destroy();
          }
        });
        layersRef.current = [];

        // 清空音频管理器
        if (audioManagerRef.current) {
          audioManagerRef.current.clear();
        }

        // 添加新图层
        for (const clip of mediaClips) {
          try {
            const mediaUrl = convertFileSrc(clip.src);

            if (clip.type === "video") {
              console.log("🎬 添加视频 clip:", clip.name);
              await addVideoLayer(
                mediaUrl,
                clip.startTime,
                clip.name,
                clip.id,
                clip.transform,
              );
            } else if (clip.type === "image") {
              console.log("🖼️ 添加图片 clip:", {
                name: clip.name,
                src: mediaUrl,
                startTime: clip.startTime,
                duration: clip.duration,
              });
              await addImageLayer(
                mediaUrl,
                clip.startTime,
                clip.duration,
                clip.name,
                clip.id,
                clip.transform,
              );
            }
          } catch (error) {
            console.error(`加载媒体失败: ${clip.name}`, error);
          }
        }

        // 加载并添加音频 clips
        if (audioManagerRef.current) {
          for (const audioClip of audioClips) {
            try {
              const audioUrl = convertFileSrc(audioClip.src);
              console.log("🎵 添加音频 clip:", audioClip.name);

              // 加载音频缓冲区
              const bufferId = `audio-${audioClip.id}`;
              await audioManagerRef.current.loadAudio(bufferId, audioUrl);

              // 创建音频片段
              audioManagerRef.current.createAudioClip({
                id: audioClip.id,
                bufferId: bufferId,
                startTime: audioClip.startTime,
                duration: audioClip.duration,
                trimStart: audioClip.trimStart,
                trimEnd: audioClip.trimEnd,
                volume: audioClip.volume,
              });
            } catch (error) {
              console.error(`加载音频失败: ${audioClip.name}`, error);
            }
          }
        }

        setHasLayers(mediaClips.length > 0);

        // 更新总时长
        updateDuration();
      },
      [addVideoLayer, addImageLayer, isWebGPUReady, updateDuration],
    );

    /**
     * 初始化音频管理器
     */
    useEffect(() => {
      console.log("🎵 Initializing AudioManager...");
      audioManagerRef.current = new AudioManager({ masterVolume: 1.0 });
      console.log("✅ AudioManager initialized successfully");

      return () => {
        if (audioManagerRef.current) {
          console.log("🧹 Disposing AudioManager...");
          audioManagerRef.current.dispose();
          audioManagerRef.current = null;
        }
      };
    }, []);

    /**
     * 播放
     */
    const play = useCallback(() => {
      if (layersRef.current.length === 0 && !audioManagerRef.current) return;

      // 如果播放到结尾，重置到开始
      setCurrentTime((prevTime) => {
        if (prevTime >= duration - 0.001) {
          const newTime = 0;
          syncVideosToTime(newTime);
          // 重置音频时间
          if (audioManagerRef.current) {
            audioManagerRef.current.seekTo(newTime);
          }
          return newTime;
        }
        return prevTime;
      });

      setIsPlaying(true);

      // 启动相关时间点的视频
      layersRef.current.forEach((layer) => {
        // 跳过图片图层，图片不需要播放
        if (layer.isImage) return;

        const localTime = currentTime - layer.startTime;
        const clipDuration = layer.duration || layer.video.duration;
        if (localTime >= 0 && localTime < clipDuration) {
          layer.video.play().catch(() => {});
        }
      });

      // 播放音频
      if (audioManagerRef.current) {
        console.log("🎵 Starting AudioManager from WebGPUPlayer.play()");
        audioManagerRef.current.play(currentTime);
      } else {
        console.warn("⚠️ AudioManager not available in play()");
      }
    }, [currentTime, duration, syncVideosToTime]);

    /**
     * 暂停
     */
    const pause = useCallback(() => {
      setIsPlaying(false);
      layersRef.current.forEach((layer) => layer.video.pause());

      // 暂停音频
      if (audioManagerRef.current) {
        audioManagerRef.current.pause();
      }
    }, []);

    /**
     * 切换播放/暂停
     */
    const togglePlayPause = useCallback(() => {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    }, [isPlaying, play, pause]);

    /**
     * 跳转到指定时间
     */
    const seekTo = useCallback(
      (time: number) => {
        isSeekingRef.current = true;
        const clampedTime = Math.max(0, Math.min(time, duration));
        setCurrentTime(clampedTime);
        syncVideosToTime(clampedTime);

        // Seek 音频
        if (audioManagerRef.current) {
          audioManagerRef.current.seekTo(clampedTime);
        }

        setTimeout(() => {
          isSeekingRef.current = false;
        }, 100);
      },
      [duration, syncVideosToTime],
    );

    /**
     * 下一帧
     */
    const stepForward = useCallback(() => {
      const frameTime = 1 / fps;
      setCurrentTime((prevTime) => {
        const newTime = Math.min(prevTime + frameTime, duration);
        syncVideosToTime(newTime);
        return newTime;
      });
    }, [fps, duration, syncVideosToTime]);

    /**
     * 上一帧
     */
    const stepBackward = useCallback(() => {
      const frameTime = 1 / fps;
      setCurrentTime((prevTime) => {
        const newTime = Math.max(prevTime - frameTime, 0);
        syncVideosToTime(newTime);
        return newTime;
      });
    }, [fps, syncVideosToTime]);

    /**
     * 获取当前时间
     */
    const getCurrentTime = useCallback(() => currentTime, [currentTime]);

    /**
     * 获取总时长
     */
    const getDuration = useCallback(() => duration, [duration]);

    /**
     * 获取播放状态
     */
    const getIsPlaying = useCallback(() => isPlaying, [isPlaying]);

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        play, // 播放
        pause, // 暂停
        togglePlayPause, // 切换播放状态
        seekTo, // 跳转到指定时间
        stepForward, // 向前跳一帧
        stepBackward, // 向后跳一帧
        getCurrentTime, // 获取当前时间
        getDuration, // 获取总时长
        isPlaying: getIsPlaying, // 获取播放状态
        addVideoLayer, // 添加视频层
        addImageLayer, // 添加图片层
        clearLayers, // 清除所有层
        updateLayerTransform, // 更新层的变换
        updateClipTransform: (
          clipId: string,
          transform: {
            position?: { x: number; y: number };
            scale?: number;
            rotation?: number;
            opacity?: number;
          },
        ) => {
          const layer = layersRef.current.find((l) => l.id === clipId);
          if (!layer) {
            console.warn(`Layer not found: ${clipId}`);
            return;
          }

          if (transform.position !== undefined) {
            layer.posX = transform.position.x;
            layer.posY = transform.position.y;
          }
          if (transform.scale !== undefined) {
            layer.scale = transform.scale;
          }
          if (transform.rotation !== undefined) {
            layer.rotation = transform.rotation * (Math.PI / 180);
          }
          if (transform.opacity !== undefined) {
            layer.opacity = transform.opacity;
          }
        },
        syncTracksToLayers, // 同步轨道到层
      }),
      [
        play,
        pause,
        togglePlayPause,
        seekTo,
        stepForward,
        stepBackward,
        getCurrentTime,
        getDuration,
        getIsPlaying,
        addVideoLayer,
        addImageLayer,
        clearLayers,
        updateLayerTransform,
        syncTracksToLayers,
      ],
    );

    // 初始化 WebGPU 和渲染循环
    useEffect(() => {
      let mounted = true;
      const init = async () => {
        const success = await initWebGPU();
        if (success && mounted && renderLoopRef.current) {
          animationFrameRef.current = requestAnimationFrame(
            renderLoopRef.current,
          );
        }
      };

      init();

      return () => {
        mounted = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        // 清理图层
        layersRef.current.forEach((layer) => {
          layer.video.pause();
          layer.video.src = "";
          if (layer.uniformBuffer) {
            layer.uniformBuffer.destroy();
          }
        });
        layersRef.current = [];
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 从 tracks 同步图层（等待 WebGPU 初始化完成）
    // 使用 useEffect 异步通知父组件状态变化
    useEffect(() => {
      if (Math.abs(currentTime - lastNotifiedTimeRef.current) > 0.001) {
        lastNotifiedTimeRef.current = currentTime;
        onTimeUpdate?.(currentTime);
      }
    }, [currentTime, onTimeUpdate]);

    useEffect(() => {
      if (Math.abs(duration - lastNotifiedDurationRef.current) > 0.001) {
        lastNotifiedDurationRef.current = duration;
        onDurationChange?.(duration);
      }
    }, [duration, onDurationChange]);

    useEffect(() => {
      if (isPlaying !== lastNotifiedPlayStateRef.current) {
        lastNotifiedPlayStateRef.current = isPlaying;
        onPlayStateChange?.(isPlaying);
      }
    }, [isPlaying, onPlayStateChange]);

    useEffect(() => {
      let mounted = true;
      const sync = async () => {
        if (mounted && isWebGPUReady && tracks && tracks.length > 0) {
          await syncTracksToLayers(tracks);
        }
      };
      sync();
      return () => {
        mounted = false;
      };
    }, [tracks, syncTracksToLayers, isWebGPUReady]);

    // UI 控制处理
    const handlePlayPause = () => {
      togglePlayPause();
    };

    const handlePrevious = () => {
      stepBackward();
    };

    const handleNext = () => {
      stepForward();
    };

    const [aspectRatio, setAspectRatio] = useState<string>("原始");

    return (
      <main className={"flex-1 flex flex-col relative min-w-0 bg-editor-bg"}>
        {/* 播放器画布 */}
        <div className="flex-1 flex items-center justify-center p-2">
          <canvas
            ref={canvasRef}
            className="aspect-video max-w-full max-h-full shadow-lg border border-editor-border bg-black object-contain"
          />
        </div>

        {/* 播放控制栏 */}
        <div className="h-8 flex items-center relative shrink-0 border-t border-editor-border bg-editor-bg px-4">
          {/* 左侧：时间显示 */}
          <div className="text-xs font-mono text-accent-cyan min-w-fit">
            {formatTimeByDisplayMode(currentTime, timeDisplayFormat, storeFps)}{" "}
            / {formatTimeByDisplayMode(duration, timeDisplayFormat, storeFps)}
          </div>

          {/* 中间：播放控制按钮 */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
            <button
              onClick={handlePrevious}
              className="transition-colors text-lg text-text-secondary hover:text-text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="上一帧"
              disabled={!hasLayers}
            >
              <PreviousFrameIcon size={20} />
            </button>

            <button
              onClick={handlePlayPause}
              className="transition-colors text-lg text-text-secondary hover:text-text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={isPlaying ? "暂停" : "播放"}
              disabled={!hasLayers}
            >
              {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>

            <button
              onClick={handleNext}
              className="transition-colors text-lg text-text-secondary hover:text-text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="下一帧"
              disabled={!hasLayers}
            >
              <NextFrameIcon size={20} />
            </button>
          </div>

          {/* 右侧：宽高比选择 */}
          <div className="ml-auto">
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={true}
              className="text-xs px-2 py-1 rounded bg-editor-bg text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
            >
              <option value="原始">原始</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
              <option value="1:1">1:1</option>
            </select>
          </div>
        </div>
      </main>
    );
  },
);

WebGPUPlayer.displayName = "WebGPUPlayer";
