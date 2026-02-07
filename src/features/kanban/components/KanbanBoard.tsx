import { useCallback, useMemo, useState, type ReactNode, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { DragDropContext } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { X } from "lucide-react";
import type { AppMode, EngineStatus, EngineType, WorkspaceInfo } from "../../../types";
import type {
  KanbanColumnDef,
  KanbanTask,
  KanbanTaskStatus,
} from "../types";
import { KanbanBoardHeader } from "./KanbanBoardHeader";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCreateModal } from "./TaskCreateModal";

type CreateTaskInput = {
  workspaceId: string;
  title: string;
  description: string;
  engineType: EngineType;
  modelId: string | null;
  branchName: string;
  images: string[];
  autoStart: boolean;
};

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type KanbanBoardProps = {
  workspace: WorkspaceInfo;
  tasks: KanbanTask[];
  columns: KanbanColumnDef[];
  onBack: () => void;
  onCreateTask: (input: CreateTaskInput) => KanbanTask;
  onUpdateTask: (taskId: string, changes: Partial<KanbanTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTask: (
    taskId: string,
    newStatus: KanbanTaskStatus,
    newSortOrder: number
  ) => void;
  onAppModeChange: (mode: AppMode) => void;
  engineStatuses: EngineStatus[];
  conversationNode: ReactNode | null;
  selectedTaskId: string | null;
  taskProcessingMap: Record<string, boolean>;
  onSelectTask: (task: KanbanTask) => void;
  onCloseConversation: () => void;
  onDragToInProgress: (task: KanbanTask) => void;
  groupedWorkspaces?: WorkspaceGroupSection[];
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void;
  kanbanConversationWidth?: number;
  onKanbanConversationResizeStart?: (event: MouseEvent<HTMLDivElement>) => void;
};

export function KanbanBoard({
  workspace,
  tasks,
  columns,
  onBack,
  onCreateTask,
  onDeleteTask,
  onReorderTask,
  onAppModeChange,
  engineStatuses,
  conversationNode,
  selectedTaskId,
  taskProcessingMap,
  onSelectTask,
  onCloseConversation,
  onDragToInProgress,
  groupedWorkspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  kanbanConversationWidth,
  onKanbanConversationResizeStart,
}: KanbanBoardProps) {
  const { t } = useTranslation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] =
    useState<KanbanTaskStatus>("todo");

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const tasksByColumn = useMemo(() => {
    const map: Record<KanbanTaskStatus, KanbanTask[]> = {
      todo: [],
      inprogress: [],
      testing: [],
      done: [],
      cancelled: [],
    };
    for (const task of tasks) {
      if (map[task.status]) {
        map[task.status].push(task);
      }
    }
    for (const key of Object.keys(map) as KanbanTaskStatus[]) {
      map[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [tasks]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const sourceStatus = source.droppableId as KanbanTaskStatus;
      const destStatus = destination.droppableId as KanbanTaskStatus;
      const destTasks = [...tasksByColumn[destStatus]];

      if (source.droppableId !== destination.droppableId) {
        const task = tasks.find((t) => t.id === draggableId);
        if (task) {
          destTasks.splice(destination.index, 0, task);
        }
      } else {
        const [moved] = destTasks.splice(source.index, 1);
        if (moved) {
          destTasks.splice(destination.index, 0, moved);
        }
      }

      destTasks.forEach((task, idx) => {
        const newSortOrder = (idx + 1) * 1000;
        if (task.id === draggableId) {
          onReorderTask(task.id, destStatus, newSortOrder);
        } else if (task.sortOrder !== newSortOrder) {
          onReorderTask(task.id, task.status, newSortOrder);
        }
      });

      // Auto-execute when dragging to "inprogress" from another column
      if (destStatus === "inprogress" && sourceStatus !== "inprogress") {
        const draggedTask = tasks.find((t) => t.id === draggableId);
        if (draggedTask) {
          onDragToInProgress(draggedTask);
        }
      }
    },
    [tasksByColumn, tasks, onReorderTask, onDragToInProgress]
  );

  const handleOpenCreate = (status: KanbanTaskStatus = "todo") => {
    setCreateDefaultStatus(status);
    setCreateModalOpen(true);
  };

  const handleCreateTask = (input: CreateTaskInput) => {
    onCreateTask(input);
    setCreateModalOpen(false);
  };

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (taskId === selectedTaskId) {
        onCloseConversation();
      }
      onDeleteTask(taskId);
    },
    [selectedTaskId, onCloseConversation, onDeleteTask]
  );

  return (
    <div className="kanban-board">
      <KanbanBoardHeader
        workspace={workspace}
        onBack={onBack}
        onAppModeChange={onAppModeChange}
        groupedWorkspaces={groupedWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={onSelectWorkspace}
      />
      <div className="kanban-board-body">
        <div className="kanban-board-columns-area">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="kanban-columns">
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={tasksByColumn[col.id]}
                  selectedTaskId={selectedTaskId}
                  taskProcessingMap={taskProcessingMap}
                  onAddTask={() => handleOpenCreate(col.id)}
                  onEditTask={() => {}}
                  onDeleteTask={handleDeleteTask}
                  onSelectTask={onSelectTask}
                />
              ))}
            </div>
          </DragDropContext>
        </div>

        {selectedTask && conversationNode && (
          <div
            className="kanban-conversation-panel"
            style={{ width: kanbanConversationWidth ? `${kanbanConversationWidth}px` : undefined }}
          >
            {onKanbanConversationResizeStart && (
              <div
                className="kanban-conversation-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize conversation panel"
                onMouseDown={onKanbanConversationResizeStart}
              />
            )}
            <div className="kanban-conversation-header">
              <span className="kanban-conversation-title">
                {selectedTask.title}
              </span>
              <button
                className="kanban-icon-btn"
                onClick={onCloseConversation}
                aria-label={t("kanban.conversation.close")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="kanban-conversation-body">
              {conversationNode}
            </div>
          </div>
        )}
      </div>

      <TaskCreateModal
        isOpen={createModalOpen}
        workspaceId={workspace.id}
        defaultStatus={createDefaultStatus}
        engineStatuses={engineStatuses}
        onSubmit={handleCreateTask}
        onCancel={() => setCreateModalOpen(false)}
      />
    </div>
  );
}
