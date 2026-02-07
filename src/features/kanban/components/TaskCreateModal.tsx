import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ImagePlus } from "lucide-react";
import type { EngineStatus, EngineType } from "../../../types";
import type { KanbanTaskStatus } from "../types";
import { pickImageFiles } from "../../../services/tauri";
import { RichTextInput } from "../../../components/common/RichTextInput";

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

type TaskCreateModalProps = {
  isOpen: boolean;
  workspaceId: string;
  defaultStatus: KanbanTaskStatus;
  engineStatuses: EngineStatus[];
  onSubmit: (input: CreateTaskInput) => void;
  onCancel: () => void;
};

export function TaskCreateModal({
  isOpen,
  workspaceId,
  defaultStatus,
  engineStatuses,
  onSubmit,
  onCancel,
}: TaskCreateModalProps) {
  const { t } = useTranslation();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [engineType, setEngineType] = useState<EngineType>("claude");
  const [modelId, setModelId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [autoStart, setAutoStart] = useState(false);

  // branchName is always "main" - no UI control needed
  const branchName = "main";

  const availableEngines = engineStatuses.filter((e) => e.installed);
  const selectedEngine = engineStatuses.find(
    (e) => e.engineType === engineType
  );
  const availableModels = selectedEngine?.models ?? [];

  const formatEngineName = (type: EngineType): string => {
    switch (type) {
      case "claude":
        return "Claude Code";
      case "codex":
        return "Codex";
      default:
        return type;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setImages([]);
      setAutoStart(defaultStatus !== "todo");
      if (availableEngines.length > 0 && !availableEngines.find((e) => e.engineType === engineType)) {
        setEngineType(availableEngines[0].engineType);
      }
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const engine = engineStatuses.find((e) => e.engineType === engineType);
    if (engine?.models.length) {
      const defaultModel = engine.models.find((m) => m.isDefault);
      setModelId(defaultModel?.id ?? engine.models[0].id);
    } else {
      setModelId(null);
    }
  }, [engineType, engineStatuses]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onSubmit({
      workspaceId,
      title: trimmedTitle,
      description: description.trim(),
      engineType,
      modelId,
      branchName: branchName.trim() || "main",
      images,
      autoStart,
    });
  };

  const handlePickImages = async () => {
    try {
      const paths = await pickImageFiles();
      if (paths.length > 0) {
        setImages((prev) => [...prev, ...paths]);
      }
    } catch {
      // user cancelled
    }
  };

  const handleAttachImages = (paths: string[]) => {
    setImages((prev) => [...prev, ...paths]);
  };

  const handleRemoveImage = (path: string) => {
    setImages((prev) => prev.filter((p) => p !== path));
  };

  return (
    <div className="kanban-modal-overlay" onClick={onCancel}>
      <div
        className="kanban-modal kanban-task-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kanban-modal-header">
          <h2>{t("kanban.task.createTitle")}</h2>
          <button className="kanban-icon-btn" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="kanban-modal-body">
            <input
              ref={titleRef}
              className="kanban-input kanban-task-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("kanban.task.titlePlaceholder")}
            />

            <RichTextInput
              value={description}
              onChange={setDescription}
              placeholder={t("kanban.task.descPlaceholder")}
              attachments={images}
              onAddAttachment={handlePickImages}
              onAttachImages={handleAttachImages}
              onRemoveAttachment={handleRemoveImage}
              enableResize={true}
              initialHeight={120}
              minHeight={80}
              maxHeight={300}
              className="kanban-rich-input"
              footerLeft={
                <>
                  <button
                    type="button"
                    className="kanban-icon-btn kanban-rich-input-attach"
                    onClick={handlePickImages}
                    title={t("kanban.task.addImage")}
                  >
                    <ImagePlus size={16} />
                  </button>
                  <div className="kanban-task-selector">
                    <select
                      className="kanban-select"
                      value={engineType}
                      onChange={(e) =>
                        setEngineType(e.target.value as EngineType)
                      }
                    >
                      {engineStatuses.map((engine) => (
                        <option
                          key={engine.engineType}
                          value={engine.engineType}
                          disabled={!engine.installed}
                        >
                          {formatEngineName(engine.engineType)}
                          {!engine.installed ? ` (${t("kanban.task.notInstalled")})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="kanban-task-selector">
                    <select
                      className="kanban-select"
                      value={modelId ?? ""}
                      onChange={(e) => setModelId(e.target.value || null)}
                    >
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))}
                      {availableModels.length === 0 && (
                        <option value="">{t("kanban.task.noModels")}</option>
                      )}
                    </select>
                  </div>
                </>
              }
            />
          </div>

          <div className="kanban-modal-footer">
            <label className="kanban-toggle-label">
              <input
                type="checkbox"
                className="kanban-toggle-input"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              <span className="kanban-toggle-switch" />
              <span>{t("kanban.task.start")}</span>
            </label>
            <button
              type="submit"
              className="kanban-btn kanban-btn-primary"
              disabled={!title.trim()}
            >
              {t("kanban.task.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
