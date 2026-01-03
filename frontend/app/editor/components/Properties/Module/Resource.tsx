/**
 * Resource Module
 * Displays material information for selected resource
 */

import {
  VideoMaterialProto,
  AudioMaterialProto,
  ImageMaterialProto,
} from "../../../types/protocol";

interface ResourceModuleProps {
  selectedResource: {
    id: string;
    type: string;
    data: VideoMaterialProto | AudioMaterialProto | ImageMaterialProto;
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor(ms % 1000);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

function formatBitrate(bitrate: number): string {
  if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(2)} Mbps`;
  }
  return `${bitrate} kbps`;
}

function PropertyRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-fg font-medium">{value}</span>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="text-sm font-semibold text-text-fg mt-4 mb-2 pb-1 border-b border-editor-border/50">
      {title}
    </div>
  );
}

export function ResourceModule({ selectedResource }: ResourceModuleProps) {
  const { data, type } = selectedResource;

  return (
    <div className="space-y-1">
      <SectionTitle title="基本信息" />

      <PropertyRow label="ID" value={data.id} />
      <PropertyRow label="名称" value={data.name} />
      <PropertyRow
        label="路径"
        value={data.src.length > 40 ? `...${data.src.slice(-40)}` : data.src}
      />
      <PropertyRow label="类型" value={type.toUpperCase()} />

      {type === "video" && (
        <>
          <SectionTitle title="视频属性" />
          <PropertyRow
            label="分辨率"
            value={`${(data as VideoMaterialProto).dimension.width} × ${(data as VideoMaterialProto).dimension.height}`}
          />
          {(data as VideoMaterialProto).duration !== undefined && (
            <PropertyRow
              label="时长"
              value={formatDuration((data as VideoMaterialProto).duration!)}
            />
          )}
          {(data as VideoMaterialProto).fps !== undefined && (
            <PropertyRow
              label="帧率"
              value={`${(data as VideoMaterialProto).fps!.toFixed(2)} fps`}
            />
          )}
          {(data as VideoMaterialProto).codec && (
            <PropertyRow
              label="编码格式"
              value={(data as VideoMaterialProto).codec!.toUpperCase()}
            />
          )}
          {(data as VideoMaterialProto).bitrate !== undefined && (
            <PropertyRow
              label="码率"
              value={formatBitrate((data as VideoMaterialProto).bitrate!)}
            />
          )}
        </>
      )}

      {type === "audio" && (
        <>
          <SectionTitle title="音频属性" />
          {(data as AudioMaterialProto).duration !== undefined && (
            <PropertyRow
              label="时长"
              value={formatDuration((data as AudioMaterialProto).duration!)}
            />
          )}
          {(data as AudioMaterialProto).sample_rate !== undefined && (
            <PropertyRow
              label="采样率"
              value={`${((data as AudioMaterialProto).sample_rate! / 1000).toFixed(1)} kHz`}
            />
          )}
          {(data as AudioMaterialProto).channels !== undefined && (
            <PropertyRow
              label="声道"
              value={
                (data as AudioMaterialProto).channels === 1
                  ? "单声道"
                  : (data as AudioMaterialProto).channels === 2
                    ? "立体声"
                    : `${(data as AudioMaterialProto).channels} 声道`
              }
            />
          )}
          {(data as AudioMaterialProto).codec && (
            <PropertyRow
              label="编码格式"
              value={(data as AudioMaterialProto).codec!.toUpperCase()}
            />
          )}
          {(data as AudioMaterialProto).bitrate !== undefined && (
            <PropertyRow
              label="码率"
              value={formatBitrate((data as AudioMaterialProto).bitrate!)}
            />
          )}
        </>
      )}

      {type === "image" && (
        <>
          <SectionTitle title="图片属性" />
          <PropertyRow
            label="分辨率"
            value={`${(data as ImageMaterialProto).dimension.width} × ${(data as ImageMaterialProto).dimension.height}`}
          />
          {(data as ImageMaterialProto).format && (
            <PropertyRow
              label="格式"
              value={(data as ImageMaterialProto).format!.toUpperCase()}
            />
          )}
        </>
      )}
    </div>
  );
}
