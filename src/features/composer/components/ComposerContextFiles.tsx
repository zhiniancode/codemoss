import FileText from "lucide-react/dist/esm/icons/file-text";
import X from "lucide-react/dist/esm/icons/x";

type ComposerContextFilesProps = {
  files: string[];
  disabled: boolean;
  onRemoveFile?: (path: string) => void;
};

function fileTitle(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function ComposerContextFiles({
  files,
  disabled,
  onRemoveFile,
}: ComposerContextFilesProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachments">
      {files.map((path) => {
        const title = fileTitle(path);
        return (
          <div
            key={path}
            className="composer-attachment"
            title={path}
          >
            <span className="composer-icon" aria-hidden>
              <FileText size={14} />
            </span>
            <span className="composer-attachment-name">{title}</span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => onRemoveFile?.(path)}
              aria-label={`Remove ${title}`}
              disabled={disabled}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

