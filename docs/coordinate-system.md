# 坐标系转换说明

## 概述

KivaCut 在前端和后端使用不同的坐标系统。前端使用笛卡尔坐标系（原点在舞台中心），而 FFmpeg 使用屏幕坐标系（原点在左上角）。在导出视频时需要进行坐标转换。

## 坐标系统对比

### 1. 笛卡尔坐标系（前端使用）

```
Stage (1920x1080)
        Y+
        ↑
        │
─────640│0────────────── X+
        │
        │360
        ↓
        
原点 (0, 0) 在舞台中心
X轴：向右为正
Y轴：向上为正
坐标 (x, y) 表示：内容的中心点位置
```

**特点：**
- 原点在舞台中心 (0, 0)
- X轴：向右为正，范围 [-960, 960]
- Y轴：**向上为正**，范围 [-540, 540]
- 坐标表示内容的**中心点**
- 符合数学习惯
- Canvas、Three.js、数学图形库常用

**示例：**
```
舞台 1920x1080
┌────────────────────────┐
│   (-640,360)  (0,360)  │ ← 顶部
│       ●         ●      │
│                        │
│ (-640,0)   (0,0)       │ ← 中心
│     ●        ●         │
│                        │
│   (-640,-360) (0,-360) │ ← 底部
│       ●         ●      │
└────────────────────────┘
```

### 2. FFmpeg/屏幕坐标系（导出使用）

```
Stage (1920x1080)
(0,0) ───────────────── X+
  │
  │
  │
  ↓
  Y+

原点 (0, 0) 在左上角
X轴：向右为正
Y轴：向下为正
坐标 (x, y) 表示：内容的左上角位置
```

**特点：**
- 原点在左上角 (0, 0)
- X轴：向右为正，范围 [0, 1920]
- Y轴：**向下为正**，范围 [0, 1080]
- 坐标表示内容的**左上角**
- FFmpeg、CSS、大多数图像处理库使用

**示例：**
```
舞台 1920x1080
┌────────────────────────┐
│(0,0)     (640,0)       │ ← 顶部
│  ●         ●           │
│                        │
│(0,360)   (640,360)     │ ← 中间
│  ●         ●           │
│                        │
│(0,720)   (640,720)     │ ← 底部
│  ●         ●           │
└────────────────────────┘
```

## 坐标转换公式

### 从笛卡尔坐标转换到 FFmpeg 坐标

```
输入：
- (x_cartesian, y_cartesian)  笛卡尔坐标（内容中心点）
- stage_width                  舞台宽度
- stage_height                 舞台高度
- content_width                内容宽度
- content_height               内容高度

输出：
- (x_ffmpeg, y_ffmpeg)        FFmpeg 坐标（内容左上角）

公式：
x_ffmpeg = (stage_width - content_width) / 2 + x_cartesian
y_ffmpeg = (stage_height - content_height) / 2 - y_cartesian
```

### 转换推导

1. **笛卡尔原点到屏幕原点的偏移**：
   - 笛卡尔原点在舞台中心：`(stage_width/2, stage_height/2)`
   
2. **从中心点转换到左上角**：
   - 笛卡尔坐标表示内容中心，需要减去内容尺寸的一半
   - FFmpeg坐标表示内容左上角

3. **综合计算**：
   ```
   x_ffmpeg = stage_width/2 + x_cartesian - content_width/2
            = (stage_width - content_width) / 2 + x_cartesian
   
   y_ffmpeg = stage_height/2 - y_cartesian - content_height/2
            = (stage_height - content_height) / 2 - y_cartesian
   ```

### 转换示例

假设舞台尺寸为 **1920×1080**，内容尺寸为 **640×360**：

| 笛卡尔坐标 | 描述 | FFmpeg 坐标 | 计算过程 |
|-----------|------|------------|---------|
| (0, 0) | 舞台中心 | (640, 360) | x=(1920-640)/2+0=640, y=(1080-360)/2-0=360 |
| (0, 360) | 顶部中心 | (640, 0) | x=640+0=640, y=360-360=0 |
| (0, -360) | 底部中心 | (640, 720) | x=640+0=640, y=360-(-360)=720 |
| (-640, 0) | 左侧中心 | (0, 360) | x=640+(-640)=0, y=360-0=360 |
| (640, 0) | 右侧中心 | (1280, 360) | x=640+640=1280, y=360-0=360 |
| (-640, 360) | 左上角 | (0, 0) | x=640+(-640)=0, y=360-360=0 |
| (640, -360) | 右下角 | (1280, 720) | x=640+640=1280, y=360-(-360)=720 |

### 视觉对比

```
笛卡尔坐标系（原点在中心）       FFmpeg坐标系（原点在左上角）

        Y+                              (0,0)
        ↑                                 ↓ Y+
     540│                                 0 ┌──────────┐
        │                                   │          │
     360│    ● (0,360)                  360 │  ●       │ (640,360)
        │                                   │          │
   ─640─┼────0────640─ X+                  │          │
        │                                   │          │
    -360│    ● (0,-360)                 720 │  ●       │ (640,720)
        │                                   │          │
    -540│                                1080└──────────┘
                                             0   640   1280
                                                  ─→ X+

笛卡尔 (0, 0) 表示内容中心在舞台中心
FFmpeg (640, 360) 表示内容左上角，使内容中心在舞台中心
```

## 代码实现

### Rust (后端导出)

```rust
/// 将笛卡尔坐标转换为 FFmpeg 坐标
fn cartesian_to_ffmpeg_coords(
    x_cartesian: i32,
    y_cartesian: i32,
    stage_width: i32,
    stage_height: i32,
    content_width: i32,
    content_height: i32,
) -> (i32, i32) {
    let x_ffmpeg = (stage_width - content_width) / 2 + x_cartesian;
    let y_ffmpeg = (stage_height - content_height) / 2 - y_cartesian;
    (x_ffmpeg, y_ffmpeg)
}

// 使用示例
let (x_ffmpeg, y_ffmpeg) = cartesian_to_ffmpeg_coords(
    0,      // x_cartesian (舞台中心)
    0,      // y_cartesian (舞台中心)
    1920,   // stage_width
    1080,   // stage_height
    640,    // content_width
    360,    // content_height
);
// 结果: (640, 360) - 内容左上角在 (640, 360)，使得内容中心在舞台中心
```

### TypeScript (前端参考)

```typescript
/**
 * 将笛卡尔坐标转换为 FFmpeg 坐标
 * 注意：前端使用笛卡尔坐标，不需要转换。
 * 此函数仅供参考或测试使用。
 */
function cartesianToFFmpegCoords(
  xCartesian: number,
  yCartesian: number,
  stageWidth: number,
  stageHeight: number,
  contentWidth: number,
  contentHeight: number
): { x: number; y: number } {
  const xFFmpeg = (stageWidth - contentWidth) / 2 + xCartesian;
  const yFFmpeg = (stageHeight - contentHeight) / 2 - yCartesian;
  return { x: xFFmpeg, y: yFFmpeg };
}
```

## 使用场景

### 前端（编辑器）

- **使用笛卡尔坐标系**
- 用户在画布上拖动 clip 时，position 使用笛卡尔坐标（中心点）
- 保存到协议时，position 保持笛卡尔坐标
- Canvas 渲染时直接使用笛卡尔坐标

```typescript
// 前端编辑器中
const clip = {
  position: { x: 0, y: 0 },  // 笛卡尔坐标，表示内容中心在舞台中心
  scale: { width: 640, height: 360 }
};
```

### 后端（导出）

- **在导出时转换为 FFmpeg 坐标系**
- 从协议读取笛卡尔坐标（中心点）
- 转换为 FFmpeg 坐标（左上角）
- 传递给 FFmpeg overlay 滤镜

```rust
// 后端导出时
let x_cartesian = segment.position.map(|p| p.x).unwrap_or(0);
let y_cartesian = segment.position.map(|p| p.y).unwrap_or(0);

// 获取内容尺寸
let (content_width, content_height) = if let Some(scale) = segment.scale {
    (scale.width, scale.height)
} else {
    // 从 material 获取原始尺寸
    material.dimensions().map(|d| (d.width, d.height)).unwrap_or((1920, 1080))
};

// 转换坐标
let (x_ffmpeg, y_ffmpeg) = Self::cartesian_to_ffmpeg_coords(
    x_cartesian,
    y_cartesian,
    stage_width,
    stage_height,
    content_width,
    content_height,
);

// 使用 FFmpeg 坐标
Filter::overlay_with_enable(x_ffmpeg, y_ffmpeg, enable_expr)
```

## 协议说明

### Protocol 中的坐标

协议文件 (`protocol.json`) 中的 position 字段**始终使用笛卡尔坐标系**：

```json
{
  "stage": {
    "width": 1920,
    "height": 1080
  },
  "tracks": [
    {
      "segments": [
        {
          "position": {
            "x": 0,
            "y": 0
          },
          "scale": {
            "width": 640,
            "height": 360
          }
        }
      ]
    }
  ]
}
```

说明：
- `position.x = 0, position.y = 0` 表示内容中心在舞台中心
- `position.x = -640, position.y = 360` 表示内容中心在左上角（内容左上角对齐舞台左上角）
- `position.x = 0, position.y = -360` 表示内容中心在底部中心

### 转换时机

```
用户编辑 → 协议保存 → 协议加载 → 导出
  ↓           ↓           ↓         ↓
笛卡尔     笛卡尔      笛卡尔    FFmpeg
中心点     中心点      中心点    左上角
  ↓           ↓           ↓         ↓
Canvas    JSON存储    Canvas    转换+overlay
```

## 常见问题

### Q1: 为什么原点在舞台中心而不是左上角？

**A:** 中心原点的优势：
- 更符合物理和数学直觉（向上/向右为正）
- 居中对齐更简单（只需设置 x=0, y=0）
- 对称操作更直观（-x 是水平翻转位置）
- 旋转和缩放以中心为原点更自然

### Q2: 为什么坐标表示中心点而不是左上角？

**A:** 使用中心点的优势：
- 更符合用户思维（"把视频放在中间"）
- 旋转时自然以内容中心旋转
- 缩放时中心点保持不变
- 对齐操作更直观

### Q3: 如果内容尺寸未知怎么办？

**A:** 代码中有回退逻辑：
1. 优先使用 `segment.scale` (width & height)
2. 如果没有，从 `material.dimensions()` 获取
3. 最后回退到 `stage` 尺寸（全屏）

### Q4: 旋转和缩放会影响转换吗？

**A:** 
- **缩放**：使用缩放后的尺寸进行转换 ✅
- **旋转**：FFmpeg 的 rotate 滤镜以中心点旋转，坐标转换仍然正确 ✅
- **顺序**：先缩放，再转换坐标，最后叠加

### Q5: 如何将内容放在左上角？

**A:** 
```typescript
// 舞台 1920x1080, 内容 640x360
// 要让内容左上角对齐舞台左上角
// 笛卡尔坐标: (-640, 360)
const clip = {
  position: { x: -640, y: 360 },  // 内容中心在左上象限
  scale: { width: 640, height: 360 }
};
```

### Q6: 如何验证转换是否正确？

**A:** 测试步骤：
1. 在前端将 clip 设置为 (0, 0) - 应该在舞台中心
2. 导出视频
3. 检查视频中 clip 是否居中
4. 如果居中，说明转换正确 ✅

## 测试用例

```rust
#[test]
fn test_coordinate_conversion() {
    // 舞台: 1920x1080, 内容: 640x360
    
    // 测试中心
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, 0, 1920, 1080, 640, 360);
    assert_eq!((x, y), (640, 360));
    
    // 测试顶部中心
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, 360, 1920, 1080, 640, 360);
    assert_eq!((x, y), (640, 0));
    
    // 测试底部中心
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(0, -360, 1920, 1080, 640, 360);
    assert_eq!((x, y), (640, 720));
    
    // 测试左侧中心
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(-640, 0, 1920, 1080, 640, 360);
    assert_eq!((x, y), (0, 360));
    
    // 测试右侧中心
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(640, 0, 1920, 1080, 640, 360);
    assert_eq!((x, y), (1280, 360));
    
    // 测试左上角
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(-640, 360, 1920, 1080, 640, 360);
    assert_eq!((x, y), (0, 0));
    
    // 测试右下角
    let (x, y) = Editor::cartesian_to_ffmpeg_coords(640, -360, 1920, 1080, 640, 360);
    assert_eq!((x, y), (1280, 720));
}
```

## 参考图示

### 笛卡尔坐标系示例

```
舞台 1920x1080
┌─────────────────────────────┐
│        (0, 540)             │ y=540 ← 最顶部可放置位置
│           ●                 │
│                             │
│ (-960,0)  (0,0)  (960,0)   │ y=0   ← 水平中线
│    ●       ●        ●       │
│                             │
│        (0, -540)            │ y=-540 ← 最底部可放置位置
│           ●                 │
└─────────────────────────────┘
  x=-960   x=0    x=960
  ← 左边界  中线   右边界 →
```

### FFmpeg 坐标系示例

```
舞台 1920x1080（内容640x360）
┌─────────────────────────────┐
│(0,0)      (640,0)  (1280,0) │ y=0 ← 最顶部
│ ●           ●         ●     │
│                             │
│(0,360)  (640,360)(1280,360) │ y=360 ← 垂直中线
│ ●           ●         ●     │
│                             │
│(0,720)  (640,720)(1280,720) │ y=720 ← 最底部
│ ●           ●         ●     │
└─────────────────────────────┘
  x=0     x=640    x=1280
  ← 左边界  水平中线  右边界 →
```

## 相关文件

- `crates/kiva-cut/src/cut/editor.rs` - 坐标转换实现
- `frontend/app/editor/components/Player/` - 前端渲染（笛卡尔坐标）
- `frontend/app/editor/utils/protocolConverter.ts` - 协议转换（保持笛卡尔坐标）

## 参考资料

- [FFmpeg overlay filter documentation](https://ffmpeg.org/ffmpeg-filters.html#overlay-1)
- [Canvas Coordinate System](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_shapes)
- [Cartesian Coordinate System](https://en.wikipedia.org/wiki/Cartesian_coordinate_system)

## 修订历史

- 2024-XX-XX: 修正坐标系统说明，原点在舞台中心，坐标表示内容中心点