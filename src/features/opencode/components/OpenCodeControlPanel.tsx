import { useEffect, useMemo, useState } from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import { useOpenCodeControlPanel } from "../hooks/useOpenCodeControlPanel";
import { OpenCodeProviderSection } from "./OpenCodeProviderSection";
import { OpenCodeMcpSection } from "./OpenCodeMcpSection";
import { OpenCodeSessionsSection } from "./OpenCodeSessionsSection";
import { OpenCodeAdvancedSection } from "./OpenCodeAdvancedSection";

type OpenCodeControlPanelProps = {
  workspaceId: string | null;
  threadId: string | null;
  selectedModel: string | null;
  selectedAgent: string | null;
  selectedVariant: string | null;
  visible: boolean;
  embedded?: boolean;
  dock?: boolean;
  selectedModelId?: string | null;
  modelOptions?: Array<{ id: string; displayName: string; model: string }>;
  onSelectModel?: (id: string) => void;
  agentOptions?: Array<{ id: string; isPrimary?: boolean }>;
  onSelectAgent?: (agentId: string | null) => void;
  variantOptions?: string[];
  onSelectVariant?: (variant: string | null) => void;
  onProviderStatusToneChange?: (tone: "is-ok" | "is-runtime" | "is-fail") => void;
};

export function OpenCodeControlPanel({
  workspaceId,
  threadId,
  selectedModel,
  selectedAgent,
  selectedVariant,
  visible,
  embedded = false,
  dock = false,
  selectedModelId = null,
  modelOptions = [],
  onSelectModel,
  agentOptions = [],
  onSelectAgent,
  variantOptions = [],
  onSelectVariant,
  onProviderStatusToneChange,
}: OpenCodeControlPanelProps) {
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"recent" | "favorites">("recent");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"provider" | "mcp" | "sessions" | "advanced">(
    "provider",
  );
  const [selectedProviderId, setSelectedProviderId] = useState<string>("openai");
  const [providerQuery, setProviderQuery] = useState("");
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  const shouldLoadProviderCatalog =
    visible && detailOpen && (activeTab === "provider" || providerPickerOpen);
  const {
    error,
    snapshot,
    providerHealth,
    testingProvider,
    sessions,
    providerOptions,
    connectingProvider,
    favoriteSessionIds,
    testProvider,
    connectProvider,
    toggleMcpGlobal,
    toggleMcpServer,
    toggleFavoriteSession,
  } = useOpenCodeControlPanel({
    workspaceId,
    threadId,
    selectedModel,
    selectedAgent,
    selectedVariant,
    enabled: visible && detailOpen,
    loadProviderCatalog: shouldLoadProviderCatalog,
  });

  const sessionIdValue = useMemo(() => {
    const snapshotSessionId = snapshot?.sessionId?.trim();
    if (snapshotSessionId) {
      return snapshotSessionId;
    }
    const activeThreadId = threadId?.trim() ?? "";
    if (activeThreadId.startsWith("opencode:")) {
      return activeThreadId.slice("opencode:".length);
    }
    return null;
  }, [snapshot?.sessionId, threadId]);
  const sessionLabel = useMemo(() => {
    if (!sessionIdValue) return "-";
    return sessionIdValue.length > 24 ? `${sessionIdValue.slice(0, 24)}...` : sessionIdValue;
  }, [sessionIdValue]);
  const hasSessionValue = Boolean(sessionIdValue && sessionIdValue !== "-");
  const sortedAgentOptions = useMemo(() => {
    const primary = agentOptions.filter((agent) => agent.isPrimary);
    const others = agentOptions.filter((agent) => !agent.isPrimary);
    return [...primary, ...others];
  }, [agentOptions]);
  const visibleSessions = useMemo(() => {
    const keyword = sessionQuery.trim().toLowerCase();
    const filtered = sessions.filter((item) => {
      if (sessionFilter === "favorites" && !favoriteSessionIds[item.sessionId]) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.sessionId.toLowerCase().includes(keyword) ||
        item.title.toLowerCase().includes(keyword)
      );
    });
    return filtered.slice(0, 8);
  }, [favoriteSessionIds, sessionFilter, sessionQuery, sessions]);

  useEffect(() => {
    if (providerOptions.length === 0) {
      return;
    }
    if (providerOptions.some((item) => item.id === selectedProviderId)) {
      return;
    }
    setSelectedProviderId(providerOptions[0].id);
  }, [providerOptions, selectedProviderId]);
  const providerConnectedFromSession = Boolean(
    snapshot?.sessionId && (snapshot?.provider || snapshot?.model),
  );
  const providerStatusTone = providerHealth.connected
    ? "is-ok"
    : providerConnectedFromSession
      ? "is-runtime"
      : "is-fail";
  const providerStatusLabel = providerHealth.connected
    ? "Connected"
    : providerConnectedFromSession
      ? "Session Active"
      : "Disconnected";
  const formatOpenCodeModelName = (value: string) => value.split("/").pop() || value;

  useEffect(() => {
    onProviderStatusToneChange?.(providerStatusTone);
  }, [onProviderStatusToneChange, providerStatusTone]);

  useEffect(() => {
    if (!visible || (!detailOpen && !providerPickerOpen)) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (providerPickerOpen) {
        setProviderPickerOpen(false);
        return;
      }
      if (detailOpen) {
        setDetailOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailOpen, providerPickerOpen, visible]);

  if (!visible) {
    return null;
  }

  return (
    <section
      className={`opencode-panel${embedded ? " is-embedded" : ""}${dock ? " is-dock" : ""}`}
      data-testid="opencode-control-panel"
    >
      <header className="opencode-panel-header">
        {!dock && (
          <div className="opencode-panel-title">
            <Activity size={13} aria-hidden />
            <span>OpenCode 状态中心</span>
          </div>
        )}
        {!dock && (
          <div className="opencode-panel-summary">
            <span className="opencode-summary-pill" title={sessionIdValue ?? "-"}>
              Session: {sessionLabel}
            </span>
            <span
              className={`opencode-connection-indicator ${providerStatusTone}`}
              title={providerHealth.error ?? providerStatusLabel}
            >
              <span
                className={`opencode-connection-dot ${providerStatusTone === "is-ok" ? "is-ok" : providerStatusTone === "is-runtime" ? "is-runtime" : "is-fail"}`}
                aria-hidden
              />
              <span>{providerStatusLabel}</span>
            </span>
          </div>
        )}
        <div className="opencode-panel-actions">
          <button
            type="button"
            className="opencode-panel-toggle"
            onClick={() => setDetailOpen((prev) => !prev)}
            title={detailOpen ? "关闭状态面板" : "打开状态面板"}
            aria-label={detailOpen ? "关闭状态面板" : "打开状态面板"}
          >
            <PanelRightOpen size={12} aria-hidden />
          </button>
        </div>
      </header>

      {detailOpen && (
        <div className="opencode-drawer-backdrop" onClick={() => setDetailOpen(false)}>
          <aside
            className="opencode-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="OpenCode 管理面板"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="opencode-drawer-header">
              <div className="opencode-drawer-title">
                <Activity size={13} aria-hidden />
                <span>OpenCode 管理面板</span>
              </div>
              <div className="opencode-panel-actions">
                <button
                  type="button"
                  className="opencode-drawer-close"
                  onClick={() => setDetailOpen(false)}
                  aria-label="关闭面板"
                  title="关闭面板"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="opencode-drawer-tabs" role="tablist" aria-label="OpenCode tabs">
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "provider" ? " is-active" : ""}`}
                onClick={() => setActiveTab("provider")}
              >
                Provider
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "mcp" ? " is-active" : ""}`}
                onClick={() => setActiveTab("mcp")}
              >
                MCP
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "sessions" ? " is-active" : ""}`}
                onClick={() => setActiveTab("sessions")}
              >
                Sessions
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "advanced" ? " is-active" : ""}`}
                onClick={() => setActiveTab("advanced")}
              >
                Advanced
              </button>
            </div>
            <div className="opencode-drawer-content">
      <div className="opencode-panel-grid">
        {hasSessionValue && (
          <div className="opencode-panel-item is-session" title={sessionIdValue ?? "-"}>
            <span>Session</span>
            <strong>{sessionLabel}</strong>
          </div>
        )}
        <div className="opencode-panel-item is-control" title={snapshot?.agent ?? selectedAgent ?? "default"}>
          <span>Agent</span>
          {onSelectAgent ? (
            <select
              className="opencode-panel-select"
              value={selectedAgent ?? ""}
              onChange={(event) => onSelectAgent(event.target.value || null)}
            >
              <option value="">default</option>
              {sortedAgentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.isPrimary ? `🔥 ${agent.id}` : agent.id}
                </option>
              ))}
            </select>
          ) : (
            <strong>{snapshot?.agent ?? selectedAgent ?? "default"}</strong>
          )}
        </div>
        <div className="opencode-panel-item is-control" title={snapshot?.model ?? selectedModel ?? "-"}>
          <span>Model</span>
          {onSelectModel ? (
            <select
              className="opencode-panel-select"
              value={selectedModelId ?? ""}
              onChange={(event) => onSelectModel(event.target.value)}
            >
              {modelOptions.length === 0 && (
                <option value={selectedModelId ?? ""}>
                  {formatOpenCodeModelName(snapshot?.model ?? selectedModel ?? "-")}
                </option>
              )}
              {modelOptions.map((item) => {
                const fullLabel = item.displayName || item.model || item.id;
                return (
                  <option key={item.id} value={item.id} title={fullLabel}>
                    {formatOpenCodeModelName(fullLabel)}
                  </option>
                );
              })}
            </select>
          ) : (
            <strong>{snapshot?.model ?? selectedModel ?? "-"}</strong>
          )}
        </div>
        <div className="opencode-panel-item is-control" title={snapshot?.variant ?? selectedVariant ?? "default"}>
          <span>Variant</span>
          {onSelectVariant ? (
            <select
              className="opencode-panel-select"
              value={selectedVariant ?? ""}
              onChange={(event) => onSelectVariant(event.target.value || null)}
            >
              <option value="">default</option>
              {variantOptions.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
          ) : (
            <strong>{snapshot?.variant ?? selectedVariant ?? "default"}</strong>
          )}
        </div>
      </div>

      {activeTab === "provider" && (
      <OpenCodeProviderSection
        providerHealth={providerHealth}
        providerStatusTone={providerStatusTone}
        providerStatusLabel={providerStatusLabel}
        providerOptions={providerOptions}
        selectedProviderId={selectedProviderId}
        onSelectedProviderIdChange={setSelectedProviderId}
        providerQuery={providerQuery}
        onProviderQueryChange={setProviderQuery}
        providerPickerOpen={providerPickerOpen}
        onProviderPickerOpenChange={setProviderPickerOpen}
        connectingProvider={connectingProvider}
        testingProvider={testingProvider}
        onConnectProvider={connectProvider}
        onTestProvider={testProvider}
      />
      )}

      {activeTab === "mcp" && (
      <OpenCodeMcpSection
        snapshot={snapshot}
        onToggleMcpGlobal={toggleMcpGlobal}
        onToggleMcpServer={toggleMcpServer}
      />
      )}

      {activeTab === "sessions" && (
      <OpenCodeSessionsSection
        sessionFilter={sessionFilter}
        onSessionFilterChange={setSessionFilter}
        sessionQuery={sessionQuery}
        onSessionQueryChange={setSessionQuery}
        visibleSessions={visibleSessions}
        favoriteSessionIds={favoriteSessionIds}
        onToggleFavoriteSession={toggleFavoriteSession}
      />
      )}

      {activeTab === "advanced" && (
      <OpenCodeAdvancedSection
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={setAdvancedOpen}
      />
      )}
            </div>
          </aside>
        </div>
      )}

      {error && <div className="opencode-panel-error">{error}</div>}
    </section>
  );
}
