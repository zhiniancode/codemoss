import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

type OpenCodeAdvancedSectionProps = {
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
};

export function OpenCodeAdvancedSection({
  advancedOpen,
  onAdvancedOpenChange,
}: OpenCodeAdvancedSectionProps) {
  return (
    <div className="opencode-panel-advanced">
      <button
        type="button"
        className="opencode-advanced-toggle"
        onClick={() => onAdvancedOpenChange(!advancedOpen)}
      >
        <ChevronDown size={12} aria-hidden className={advancedOpen ? "is-open" : ""} />
        <span>Advanced</span>
      </button>
      {advancedOpen && (
        <div className="opencode-advanced-content">
          <div>Debug / Console / Heap 入口已下沉到 Advanced。</div>
          <div>主对话区只保留核心工作流，避免噪音。</div>
        </div>
      )}
    </div>
  );
}
