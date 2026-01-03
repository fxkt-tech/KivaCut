/**
 * ResourcePanel Component
 * Left sidebar for managing resources and media
 */

import { RESOURCE_TABS, RESOURCE_TAB_LABELS } from "../../constants/data";
import { ResourceGrid } from "./Grid";
import {
  EditorResource,
  BackendResource,
  ResourceTab,
} from "../../types/editor";
import { useState } from "react";
import { useTauriCommands } from "@/app/hooks/useTauriCommands";
import { open } from "@tauri-apps/plugin-dialog";
import { ResourceIcon } from "../../icons/UIIcons";

interface ResourcePanelProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  resources?: BackendResource[];
  isLoading?: boolean;
  onResourceSelect?: (resource: any | null) => void;
  projectPath?: string | null;
  loadResources?: () => Promise<void>;
}

export function ResourcePanel({
  activeTab,
  onTabChange,
  resources = [],
  isLoading = false,
  onResourceSelect,
  projectPath = null,
  loadResources,
}: ResourcePanelProps) {
  const [isImporting, setIsImporting] = useState(false);
  const { importMaterial } = useTauriCommands();
  // Filter resources by active tab type
  const filteredResources = resources.filter(
    (r) => r.resource_type === activeTab || activeTab === "media",
  );

  // Pass BackendResource directly to parent with full metadata
  const handleResourceSelect = (backendResource: BackendResource | null) => {
    if (onResourceSelect) {
      // Handle null case (deselection)
      if (!backendResource) {
        onResourceSelect(null);
        return;
      }

      // Map backend resource to EditorResource format with full metadata
      let resourceType: EditorResource["type"] = "media";
      if (backendResource.material_type === "video") {
        resourceType = "media";
      } else if (backendResource.material_type === "audio") {
        resourceType = "audio";
      } else if (backendResource.material_type === "image") {
        resourceType = "media";
      }

      const editorResource: EditorResource & {
        material_type?: string;
        dimension?: { width: number; height: number };
        duration?: number;
        fps?: number;
        codec?: string;
        bitrate?: number;
        sample_rate?: number;
        channels?: number;
        format?: string;
      } = {
        id: backendResource.id,
        name: backendResource.name,
        type: resourceType,
        src: backendResource.src,
        material_type: backendResource.material_type,
        dimension: backendResource.dimension,
        duration: backendResource.duration,
        fps: backendResource.fps,
        codec: backendResource.codec,
        bitrate: backendResource.bitrate,
        sample_rate: backendResource.sample_rate,
        channels: backendResource.channels,
        format: backendResource.format,
      };
      onResourceSelect(editorResource as any);
    }
  };

  return (
    <aside className="w-resource-panel flex flex-col border-r border-editor-border bg-editor-bg">
      {/* Resource Tabs */}
      <div className="flex items-center justify-between px-2 pt-2 pb-2 overflow-x-auto">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {RESOURCE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                activeTab === tab
                  ? "bg-editor-hover text-accent-blue"
                  : "text-text-secondary hover:text-text-fg"
              }`}
            >
              {RESOURCE_TAB_LABELS[tab as ResourceTab]}
            </button>
          ))}
        </div>
      </div>

      {/* Resource Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-4">
          <button
            onClick={async () => {
              if (!projectPath || isImporting) return;
              setIsImporting(true);
              try {
                const selected = await open({
                  multiple: false,
                  filters: [
                    {
                      name: "Media Files",
                      extensions: [
                        "mp4",
                        "avi",
                        "mov",
                        "mkv",
                        "flv",
                        "wmv",
                        "webm",
                        "mp3",
                        "wav",
                        "aac",
                        "flac",
                        "wma",
                        "m4a",
                        "ogg",
                        "jpg",
                        "jpeg",
                        "png",
                        "gif",
                        "bmp",
                        "webp",
                        "svg",
                      ],
                    },
                  ],
                });

                if (selected && typeof selected === "string") {
                  await importMaterial(projectPath, selected);
                  if (loadResources) await loadResources();
                }
              } catch (err) {
                console.error("Import failed", err);
              } finally {
                setIsImporting(false);
              }
            }}
            disabled={!projectPath || isImporting}
            className={`w-full py-2 rounded text-sm mb-4 transition-colors flex items-center justify-center gap-2 bg-editor-hover hover:opacity-80 ${
              !projectPath ? "opacity-60" : ""
            }`}
            aria-label="Import resources"
            title={
              !projectPath
                ? "Open a project to import resources"
                : "Import resources"
            }
          >
            <span>+</span>
            {isImporting ? "导入中..." : "导入"}
          </button>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && filteredResources.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <ResourceIcon size={48} className="mb-4 opacity-50" />
              <span className="text-sm">素材</span>
            </div>
          )}

          {!isLoading && filteredResources.length > 0 && (
            <ResourceGrid
              resources={filteredResources}
              onSelect={handleResourceSelect}
              projectPath={projectPath}
              onDelete={loadResources}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
