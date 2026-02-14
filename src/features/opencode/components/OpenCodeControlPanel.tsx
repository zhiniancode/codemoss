import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
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
  const [authExpanded, setAuthExpanded] = useState(false);
  const panelRootRef = useRef<HTMLElement | null>(null);
  const panelToggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const [drawerStyle, setDrawerStyle] = useState<CSSProperties | undefined>(undefined);

  const shouldLoadProviderCatalog = visible && detailOpen && activeTab === "provider";
  const {
    error,
    snapshot,
    providerHealth,
    testingProvider,
    sessions,
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

  const normalizeDisplayValue = (value?: string | null) => {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }
    const lower = normalized.toLowerCase();
    if (
      normalized === "-" ||
      lower === "unknown" ||
      lower === "none" ||
      lower === "null" ||
      lower === "undefined"
    ) {
      return null;
    }
    return normalized;
  };
  const snapshotProviderValue = normalizeDisplayValue(snapshot?.provider);
  const snapshotModelValue = normalizeDisplayValue(snapshot?.model);
  const selectedModelValue = normalizeDisplayValue(selectedModel);
  const resolvedModelValue = snapshotModelValue ?? selectedModelValue;
  const resolvedProviderValue =
    snapshotProviderValue ?? normalizeDisplayValue(providerHealth.provider);
  const providerConnectedFromSession = Boolean(
    snapshot?.sessionId && (snapshotProviderValue || snapshotModelValue),
  );
  const providerStatusTone = providerHealth.connected
    ? "is-ok"
    : providerConnectedFromSession
      ? "is-runtime"
      : "is-fail";
  const providerStatusLabel = providerHealth.connected
    ? "Auth Ready"
    : providerConnectedFromSession
      ? "Session Active"
      : "Disconnected";
  const completedAuthSummary =
    (providerHealth.authenticatedProviders?.length ?? providerHealth.credentialCount) > 0
      ? `${providerHealth.authenticatedProviders?.length ?? providerHealth.credentialCount} 项`
      : "0 项";
  const onboardingNextStep = providerHealth.connected
    ? "认证可用。发送时会尝试网络连通性探测（不阻断发送）。"
    : "请先选择 Provider 并完成认证，再开始发送消息。";
  const authExpandRows = useMemo(() => {
    const providerName = resolvedProviderValue;
    const authenticatedProviders = providerHealth.authenticatedProviders ?? [];
    const rows: string[] = [];
    if (providerName) {
      rows.push(`当前 Provider：${providerName}${providerHealth.connected ? "（已连接）" : "（未连接）"}`);
    }
    if (authenticatedProviders.length > 0) {
      rows.push(`已认证 Provider：${authenticatedProviders.join("、")}`);
    } else {
      rows.push("已认证 Provider：无");
    }
    if (providerName) {
      rows.push(
        providerHealth.matched
          ? `模型/Provider 匹配：是（${providerName}）`
          : `模型/Provider 匹配：否（当前模型可能不是 ${providerName}）`,
      );
    }
    return rows;
  }, [
    providerHealth.connected,
    providerHealth.credentialCount,
    providerHealth.authenticatedProviders,
    providerHealth.matched,
    resolvedProviderValue,
  ]);
  const formatOpenCodeModelName = (value: string) => value.split("/").pop() || value;
  const inferModelProvider = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return "unknown";
    }
    if (normalized.includes("/")) {
      return normalized.split("/")[0] || "unknown";
    }
    if (normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
      return "openai";
    }
    if (normalized.startsWith("claude-")) {
      return "anthropic";
    }
    if (normalized.startsWith("gemini-")) {
      return "google";
    }
    if (normalized.startsWith("mistral-") || normalized.startsWith("ministral-") || normalized.startsWith("codestral-")) {
      return "mistral";
    }
    if (normalized.startsWith("deepseek-")) {
      return "deepseek";
    }
    if (normalized.startsWith("qwen-")) {
      return "qwen";
    }
    if (normalized.startsWith("llama-") || normalized.startsWith("meta-llama-")) {
      return "meta";
    }
    if (normalized.startsWith("phi-")) {
      return "microsoft";
    }
    if (normalized.startsWith("cohere-")) {
      return "cohere";
    }
    if (normalized.startsWith("jais-")) {
      return "jais";
    }
    return "unknown";
  };
  const formatModelOptionLabel = (value: string) => {
    const provider = inferModelProvider(value);
    const model = formatOpenCodeModelName(value);
    return provider === "unknown" ? model : `[${provider}] ${model}`;
  };

  useEffect(() => {
    onProviderStatusToneChange?.(providerStatusTone);
  }, [onProviderStatusToneChange, providerStatusTone]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
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
  }, [detailOpen, visible]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const updateDrawerPlacement = () => {
      const toggleRect = panelToggleRef.current?.getBoundingClientRect();
      if (!toggleRect) {
        setDrawerStyle(undefined);
        return;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edge = 8;
      const width = Math.max(360, Math.min(460, viewportWidth - edge * 2));
      const left = Math.min(
        Math.max(toggleRect.right - width, edge),
        Math.max(edge, viewportWidth - width - edge),
      );
      const preferredTop = toggleRect.top - edge;
      const estimatedDrawerHeight = 520;
      const hasSpaceAbove = preferredTop - estimatedDrawerHeight >= edge;
      let top: number;
      let maxHeight: number;
      if (hasSpaceAbove) {
        top = Math.max(edge, preferredTop - estimatedDrawerHeight);
        maxHeight = Math.max(320, Math.min(820, preferredTop - edge));
      } else {
        const belowTop = toggleRect.bottom + edge;
        const maxHeightBelow = Math.max(320, Math.min(820, viewportHeight - belowTop - edge));
        top = belowTop;
        maxHeight = maxHeightBelow;
      }
      setDrawerStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight,
      });
    };
    updateDrawerPlacement();
    window.addEventListener("resize", updateDrawerPlacement);
    window.addEventListener("scroll", updateDrawerPlacement, true);
    return () => {
      window.removeEventListener("resize", updateDrawerPlacement);
      window.removeEventListener("scroll", updateDrawerPlacement, true);
    };
  }, [detailOpen, visible]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (drawerRef.current?.contains(target)) {
        return;
      }
      if (panelRootRef.current?.contains(target)) {
        return;
      }
      setDetailOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [detailOpen, visible]);

  if (!visible) {
    return null;
  }

  return (
    <section
      ref={panelRootRef}
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
            ref={panelToggleRef}
            type="button"
            className="opencode-panel-toggle"
            onClick={() => setDetailOpen((prev) => !prev)}
            title={detailOpen ? "关闭状态面板" : "打开状态面板"}
            aria-label={detailOpen ? "关闭状态面板" : "打开状态面板"}
          >
            <SlidersHorizontal size={13} aria-hidden />
          </button>
        </div>
      </header>

      {detailOpen && (
        <div className="opencode-drawer-layer" onClick={() => setDetailOpen(false)}>
          <aside
            ref={drawerRef}
            className="opencode-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="OpenCode 管理面板"
            style={drawerStyle}
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
      <section className="opencode-onboarding-card" aria-label="OpenCode 连接引导">
        <h4>连接引导</h4>
        <p>默认不预选连接。请先确认状态，再选择 Provider 进行认证。</p>
        <div className="opencode-onboarding-metrics">
          <span>认证状态：{providerStatusLabel}</span>
          <button
            type="button"
            className={`opencode-onboarding-chip${authExpanded ? " is-open" : ""}`}
            onClick={() => setAuthExpanded((prev) => !prev)}
            aria-expanded={authExpanded}
            aria-label="展开已完成认证详情"
          >
            已完成认证：{completedAuthSummary}
          </button>
        </div>
        {authExpanded && (
          <div className="opencode-auth-expand">
            {authExpandRows.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <p className="opencode-onboarding-next-step">{onboardingNextStep}</p>
      </section>
      <section className="opencode-overview-layout">
        {hasSessionValue && (
          <div className="opencode-panel-item is-session is-hero" title={sessionIdValue ?? "-"}>
            <span>Session</span>
            <strong>{sessionLabel}</strong>
          </div>
        )}
        <div className="opencode-panel-grid">
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
          <div className="opencode-panel-item is-control" title={resolvedModelValue ?? "未选择模型"}>
            <span>Model</span>
            {onSelectModel ? (
              <select
                className="opencode-panel-select"
                value={selectedModelId ?? ""}
                onChange={(event) => onSelectModel(event.target.value)}
              >
                {modelOptions.length === 0 && (
                  <option value={selectedModelId ?? ""}>
                    {resolvedModelValue ? formatModelOptionLabel(resolvedModelValue) : "无可用模型"}
                  </option>
                )}
                {modelOptions.map((item) => {
                  const fullLabel = item.displayName || item.model || item.id;
                  return (
                    <option key={item.id} value={item.id} title={fullLabel}>
                      {formatModelOptionLabel(fullLabel)}
                    </option>
                  );
                })}
              </select>
            ) : (
              <strong>{resolvedModelValue ?? "未选择模型"}</strong>
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
      </section>

      {activeTab === "provider" && (
      <OpenCodeProviderSection
        providerHealth={providerHealth}
        providerStatusTone={providerStatusTone}
        providerStatusLabel={providerStatusLabel}
        showHeader={false}
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
