import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import type { AppMode, WorkspaceInfo } from "../../../types";
import { KanbanModeToggle } from "./KanbanModeToggle";

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type KanbanBoardHeaderProps = {
  workspace: WorkspaceInfo;
  onBack: () => void;
  onAppModeChange: (mode: AppMode) => void;
  groupedWorkspaces?: WorkspaceGroupSection[];
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void;
};

export function KanbanBoardHeader({
  workspace,
  onBack,
  onAppModeChange,
  groupedWorkspaces,
  activeWorkspaceId,
  onSelectWorkspace,
}: KanbanBoardHeaderProps) {
  const { t } = useTranslation();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  // 判断是否显示项目选择菜单
  const showProjectMenu = Boolean(
    groupedWorkspaces &&
    groupedWorkspaces.length > 0 &&
    onSelectWorkspace
  );

  // 项目搜索过滤
  const trimmedProjectQuery = projectQuery.trim();
  const lowercaseProjectQuery = trimmedProjectQuery.toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!groupedWorkspaces) {
      return [];
    }
    if (trimmedProjectQuery.length === 0) {
      return groupedWorkspaces;
    }
    return groupedWorkspaces
      .map((group) => ({
        ...group,
        workspaces: group.workspaces.filter((ws) =>
          ws.name.toLowerCase().includes(lowercaseProjectQuery)
        ),
      }))
      .filter((group) => group.workspaces.length > 0);
  }, [groupedWorkspaces, lowercaseProjectQuery, trimmedProjectQuery]);

  // 处理项目选择
  const handleSelectProject = (workspaceId: string) => {
    if (onSelectWorkspace) {
      onSelectWorkspace(workspaceId);
      setProjectMenuOpen(false);
      setProjectQuery("");
    }
  };

  // 外部点击关闭
  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const projectMenuContains = projectMenuRef.current?.contains(target) ?? false;
      if (!projectMenuContains) {
        setProjectMenuOpen(false);
        setProjectQuery("");
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [projectMenuOpen]);

  return (
    <div className="kanban-board-header">
      <div className="kanban-board-header-left">
        <KanbanModeToggle appMode="kanban" onAppModeChange={onAppModeChange} />
        <button
          className="kanban-icon-btn"
          onClick={onBack}
          aria-label={t("kanban.board.back")}
        >
          <ArrowLeft size={18} />
        </button>
        {showProjectMenu ? (
          <div className="kanban-project-menu" ref={projectMenuRef}>
            <button
              type="button"
              className="kanban-project-button"
              onClick={() => setProjectMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
            >
              <h2 className="kanban-board-title">{workspace.name}</h2>
              <span className="kanban-project-caret" aria-hidden>
                ›
              </span>
            </button>
            {projectMenuOpen && (
              <div
                className="kanban-project-dropdown popover-surface"
                role="menu"
              >
                <div className="project-search">
                  <input
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder={t("workspace.searchProjects")}
                    className="branch-input"
                    autoFocus
                    aria-label={t("workspace.searchProjects")}
                  />
                </div>
                <div className="project-list" role="none">
                  {filteredGroups.map((group) => (
                    <div key={group.id ?? "ungrouped"}>
                      {group.name && (
                        <div className="project-group-label">{group.name}</div>
                      )}
                      {group.workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          className={`project-item${
                            ws.id === activeWorkspaceId ? " is-active" : ""
                          }`}
                          onClick={() => handleSelectProject(ws.id)}
                          role="menuitem"
                        >
                          {ws.name}
                        </button>
                      ))}
                    </div>
                  ))}
                  {filteredGroups.length === 0 && (
                    <div className="project-empty">
                      {t("workspace.noProjectsFound")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <h2 className="kanban-board-title">{workspace.name}</h2>
        )}
      </div>
    </div>
  );
}
