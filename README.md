# Kiva Cut

基于 Next.js + Tauri 实现的非线性编辑系统（NLE）。

## 特性

- 🎬 **实时渲染**: 使用 WebGPU + WebCodecs 实现高性能实时预览
- 🎥 **视频导出**: 基于 FFmpeg 的专业级视频渲染，支持 MP4/MP3 格式
- 🎨 **多轨道编辑**: 支持多个视频和音频轨道的复杂合成
- ⚡ **现代技术栈**: Next.js 16 + Tauri V2 + Rust
- 🎯 **类型安全**: 全栈 TypeScript + Rust 类型系统

## 快速开始

### 开发环境

```bash
# 安装依赖
cd frontend
pnpm install

# 启动开发服务器
pnpm run dev

# 启动 Tauri 应用
pnpm run tauri dev
```

### 构建应用

```bash
cd frontend
pnpm run tauri build
```

## 导出功能

### 支持格式

- **MP4 视频**: H.264 视频编码 + AAC 音频编码
- **MP3 音频**: 纯音频导出

### 使用方法

1. 在编辑器中完成视频编辑
2. 点击顶部工具栏的"导出"按钮
3. 选择保存位置和文件格式
4. 等待渲染完成


## 技术架构

- **前端**: Next.js 16 + TailwindCSS v4 (App Router)
- **桌面框架**: Tauri V2
- **视频处理**: kiva-cut (Rust FFmpeg 封装)
- **实时渲染**: WebGPU + WebCodecs
- **状态管理**: Zustand


## 开发

### 项目结构

```
KivaCut/
├── frontend/              # Next.js 前端
│   ├── app/              # 页面和组件
│   ├── src-tauri/        # Tauri 后端
│   └── ...
├── crates/               # Rust crates
│   └── kiva-cut/        # 视频编辑核心库
└── docs/                # 文档
```

## License

[LICENSE](LICENSE)
