/**
 * useTauriCommands Hook
 * Wrapper for Tauri IPC commands
 */

import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

export interface ProjectHistory {
  id: string;
  name: string;
  path: string;
  create_time: string;
  last_modified: string;
}

export interface Resource {
  id: string;
  name: string;
  src: string;
  resource_type: string;
}

export function useTauriCommands() {
  const createProject = async (
    projectName: string,
    projectPath: string,
  ): Promise<ProjectHistory> => {
    try {
      return await invoke<ProjectHistory>("create_project", {
        projectName,
        projectPath,
      });
    } catch (error) {
      throw new Error(`Failed to create project: ${error}`);
    }
  };

  const listResources = async (projectPath: string): Promise<Resource[]> => {
    try {
      // Unified material system - list_materials is the single source of truth
      return await invoke<Resource[]>("list_materials", {
        projectPath,
      });
    } catch (error) {
      throw new Error(`Failed to list resources: ${error}`);
    }
  };

  const importResource = async (
    projectPath: string,
    sourcePath: string,
  ): Promise<Resource> => {
    try {
      // Unified material system - import_material is the single source of truth
      return await invoke<Resource>("import_material", {
        projectPath,
        sourcePath,
      });
    } catch (error) {
      throw new Error(`Failed to import resource: ${error}`);
    }
  };

  const importResourceFile = async (
    projectPath: string,
    fileName: string,
    base64Content: string,
  ): Promise<Resource> => {
    try {
      // Unified material system - import_material_from_base64_content is the new name
      return await invoke<Resource>("import_material_from_base64_content", {
        projectPath,
        fileName,
        base64Content,
      });
    } catch (error) {
      throw new Error(`Failed to import resource file: ${error}`);
    }
  };

  const importMaterial = async (
    projectPath: string,
    sourcePath: string,
  ): Promise<Resource> => {
    try {
      return await invoke<Resource>("import_material", {
        projectPath,
        sourcePath,
      });
    } catch (error) {
      throw new Error(`Failed to import material: ${error}`);
    }
  };

  const listMaterials = async (projectPath: string): Promise<Resource[]> => {
    try {
      return await invoke<Resource[]>("list_materials", {
        projectPath,
      });
    } catch (error) {
      throw new Error(`Failed to list materials: ${error}`);
    }
  };

  const deleteMaterial = async (
    projectPath: string,
    materialId: string,
  ): Promise<void> => {
    try {
      return await invoke<void>("delete_material", {
        projectPath,
        materialId,
      });
    } catch (error) {
      throw new Error(`Failed to delete material: ${error}`);
    }
  };

  const openProjectDir = async (projectPath: string): Promise<void> => {
    try {
      return await invoke<void>("open_project_dir", {
        projectPath,
      });
    } catch (error) {
      throw new Error(`Failed to open project directory: ${error}`);
    }
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    try {
      return await invoke<void>("delete_project", {
        projectId,
      });
    } catch (error) {
      throw new Error(`Failed to delete project: ${error}`);
    }
  };

  const getDefaultProjectsDir = async (): Promise<string> => {
    try {
      return await invoke<string>("get_default_projects_dir");
    } catch (error) {
      throw new Error(`Failed to get default projects directory: ${error}`);
    }
  };

  const exportVideo = async (
    projectId: string,
    outputPath?: string,
    exportType?: "video" | "audio",
  ): Promise<string> => {
    try {
      return await invoke<string>("export_video", {
        projectId,
        outputPath,
        exportType,
      });
    } catch (error) {
      throw new Error(`Failed to export video: ${error}`);
    }
  };

  return useMemo(
    () => ({
      createProject,
      listResources,
      importResource,
      importResourceFile,
      importMaterial,
      listMaterials,
      deleteMaterial,
      openProjectDir,
      deleteProject,
      getDefaultProjectsDir,
      exportVideo,
    }),
    [],
  );
}
