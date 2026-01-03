"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectList, ProjectHistory } from "./hooks/useProjectList";
import { ProjectCard } from "./components/ProjectCard";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { WindowControls } from "@/app/components/WindowControls";
import { usePlatform } from "@/app/hooks/usePlatform";
import { useTheme } from "@/app/hooks/useTheme";

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects, isLoading, error, refreshProjects } = useProjectList();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const platformType = usePlatform();
  useTheme();

  const navigationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  // Initialize modal state from URL param
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(() => {
    const shouldOpen = searchParams.get("create") === "true";
    return shouldOpen;
  });

  // Clean up URL param after initial render
  useEffect(() => {
    const shouldCleanup = searchParams.get("create") === "true";
    if (shouldCleanup) {
      // Use setTimeout to avoid potential infinite loops
      const timer = setTimeout(() => {
        router.replace("/projects");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [router, searchParams]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  const handleProjectSelect = useCallback(
    (project: ProjectHistory) => {
      // Prevent multiple clicks and navigation
      if (selectedProject === project.id || isNavigating) return;

      setIsNavigating(true);
      setSelectedProject(project.id);

      // Clear any existing timer
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }

      // Redirect to editor with project ID after a small delay
      navigationTimerRef.current = setTimeout(() => {
        router.push(`/editor?id=${encodeURIComponent(project.id)}`);
        // Reset navigation state after navigation completes
        setTimeout(() => {
          setIsNavigating(false);
        }, 500);
      }, 100);
    },
    [selectedProject, isNavigating, router],
  );

  const handleCreateProject = useCallback(() => {
    // Prevent multiple clicks
    if (isNavigating) return;

    setIsCreateModalOpen(true);

    // Focus the create button for better UX
    if (createButtonRef.current) {
      setTimeout(() => {
        createButtonRef.current?.blur();
      }, 100);
    }
  }, [isNavigating]);

  const handleCreateProjectClose = useCallback(() => {
    // Prevent multiple calls
    setIsCreateModalOpen(false);
  }, []);

  const handleProjectCreated = useCallback(() => {
    refreshProjects();
  }, [refreshProjects]);

  const handleProjectDeleted = useCallback(() => {
    setSelectedProject(null);
    refreshProjects();
  }, [refreshProjects]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-editor-bg)" }}
    >
      {/* Custom Header with Window Controls */}
      <header
        className="h-8 flex items-center justify-between border-b shrink-0"
        style={{
          background: "var(--color-editor-panel)",
          borderColor: "var(--color-editor-border)",
        }}
      >
        {/* macOS 窗口控制按钮 - 左侧 */}
        <div className="flex items-center h-full">
          <WindowControls
            platform={platformType === "macos" ? "macos" : null}
          />
          <div
            data-tauri-drag-region
            className="flex items-center gap-2 font-bold text-lg px-4 select-none"
          >
            <span style={{ color: "var(--color-accent-cyan)" }}>KivaCut</span>
          </div>
        </div>

        {/* 中间拖拽区域 */}
        <div
          data-tauri-drag-region
          className="flex-1 flex items-center justify-center text-sm select-none"
          style={{ color: "var(--color-text-secondary)" }}
        >
          项目列表
        </div>

        {/* 右侧 - Windows 窗口控制 */}
        <div className="flex items-center h-full">
          <WindowControls
            platform={platformType === "windows" ? "windows" : null}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <button
              ref={createButtonRef}
              onClick={handleCreateProject}
              disabled={isNavigating}
              style={{
                height: "100px",
                background: `linear-gradient(to right, var(--color-accent-blue), var(--color-accent-green))`,
                color: "var(--color-editor-panel)",
              }}
              className="w-full font-medium rounded-lg transition-all shadow-md flex items-center justify-center hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isNavigating ? "处理中..." : "创建项目"}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="border rounded-lg px-4 py-3 mb-8"
              style={{
                background: "var(--color-accent-red)",
                borderColor: "var(--color-accent-red)",
                opacity: 0.3,
              }}
            >
              <p style={{ color: "var(--color-accent-red)" }}>⚠️ {error}</p>
            </div>
          )}

          {/* Projects Grid */}
          <div>
            <div className="mb-6">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--color-text-fg)" }}
              >
                {"草稿"}
                {projects.length > 0 && (
                  <span
                    className="ml-2"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    ({projects.length})
                  </span>
                )}
              </h2>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2"
                  style={{ borderColor: "var(--color-accent-cyan)" }}
                ></div>
              </div>
            ) : projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isSelected={selectedProject === project.id}
                    onSelect={() => handleProjectSelect(project)}
                    onDelete={handleProjectDeleted}
                  />
                ))}
              </div>
            ) : (
              <div
                className="rounded-lg border border-dashed p-8 text-center"
                style={{
                  background: "var(--color-editor-panel)",
                  borderColor: "var(--color-editor-border)",
                }}
              >
                <p
                  className="mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  还没有项目捏~
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  创建一个吧
                </p>
              </div>
            )}
          </div>

          {/* Create Project Modal */}
          <CreateProjectModal
            isOpen={isCreateModalOpen}
            onClose={handleCreateProjectClose}
            onProjectCreated={handleProjectCreated}
          />

          {/* Navigation overlay to prevent interactions during navigation */}
          {isNavigating && (
            <div className="fixed inset-0 z-50 pointer-events-none"></div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex flex-col"
          style={{ background: "var(--color-editor-bg)" }}
        >
          <header
            className="h-8 flex items-center justify-between border-b shrink-0"
            style={{
              background: "var(--color-editor-panel)",
              borderColor: "var(--color-editor-border)",
            }}
          >
            <div className="flex items-center h-full">
              <div
                data-tauri-drag-region
                className="flex items-center gap-2 font-bold text-lg px-4 select-none"
              >
                <span style={{ color: "var(--color-accent-cyan)" }}>
                  KivaCut
                </span>
              </div>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2"
              style={{ borderColor: "var(--color-accent-cyan)" }}
            ></div>
          </div>
        </div>
      }
    >
      <ProjectsPageContent />
    </Suspense>
  );
}
