import { useEffect, useMemo, useState } from "react";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Search from "lucide-react/dist/esm/icons/search";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import type { OpenCodeProviderHealth, OpenCodeProviderOption } from "../types";

type OpenCodeProviderSectionProps = {
  providerHealth: OpenCodeProviderHealth;
  providerStatusTone: "is-ok" | "is-runtime" | "is-fail";
  providerStatusLabel: string;
  providerOptions: OpenCodeProviderOption[];
  selectedProviderId: string;
  onSelectedProviderIdChange: (providerId: string) => void;
  providerQuery: string;
  onProviderQueryChange: (query: string) => void;
  providerPickerOpen: boolean;
  onProviderPickerOpenChange: (open: boolean) => void;
  connectingProvider: boolean;
  testingProvider: boolean;
  onConnectProvider: (providerId: string) => Promise<void>;
  onTestProvider: (providerId?: string | null) => Promise<OpenCodeProviderHealth | null>;
};

export function OpenCodeProviderSection({
  providerHealth,
  providerStatusTone,
  providerStatusLabel,
  providerOptions,
  selectedProviderId,
  onSelectedProviderIdChange,
  providerQuery,
  onProviderQueryChange,
  providerPickerOpen,
  onProviderPickerOpenChange,
  connectingProvider,
  testingProvider,
  onConnectProvider,
  onTestProvider,
}: OpenCodeProviderSectionProps) {
  const [providerCheckFeedback, setProviderCheckFeedback] = useState<string | null>(null);

  useEffect(() => {
    setProviderCheckFeedback(null);
  }, [selectedProviderId]);

  const filteredProviderOptions = useMemo(() => {
    const keyword = providerQuery.trim().toLowerCase();
    if (!keyword) {
      return providerOptions;
    }
    return providerOptions.filter((item) => {
      const searchable = `${item.label} ${item.id} ${item.description ?? ""}`.toLowerCase();
      return searchable.includes(keyword);
    });
  }, [providerOptions, providerQuery]);

  const selectedProvider = useMemo(
    () => providerOptions.find((item) => item.id === selectedProviderId) ?? null,
    [providerOptions, selectedProviderId],
  );

  return (
    <div className="opencode-panel-provider">
      <div className="opencode-provider-head">
        <div className="opencode-provider-title">
          <ShieldCheck size={13} aria-hidden />
          <span>Provider</span>
        </div>
        <span
          className={`opencode-provider-status ${providerStatusTone}`}
          title={providerHealth.error ?? ""}
        >
          {providerStatusLabel}
        </span>
      </div>
      <div className="opencode-provider-meta">
        <span>{providerHealth.provider}</span>
        <span>{providerHealth.credentialCount} credential(s)</span>
      </div>
      <div className="opencode-provider-connect">
        <div className="opencode-provider-select-wrap">
          <span>Connect a provider</span>
          <button
            type="button"
            className="opencode-provider-picker-trigger"
            onClick={() => {
              onProviderQueryChange("");
              onProviderPickerOpenChange(true);
            }}
          >
            <span>
              {selectedProvider?.recommended
                ? `${selectedProvider.label} (recommended)`
                : selectedProvider?.label ?? selectedProviderId}
            </span>
            <span className="opencode-provider-picker-caret">▾</span>
          </button>
        </div>
        <button
          type="button"
          className="opencode-provider-connect-btn"
          onClick={async () => {
            await onConnectProvider(selectedProviderId);
            setProviderCheckFeedback("已拉起 Provider 认证流程，请在终端完成认证。");
          }}
          disabled={connectingProvider}
          title="在系统终端中打开 OpenCode Provider 登录流程"
        >
          <Link2 size={12} aria-hidden />
          <span>{connectingProvider ? "启动中..." : "连接 Provider"}</span>
        </button>
        <button
          type="button"
          className="opencode-provider-test"
          onClick={async () => {
            try {
              const result = await onTestProvider(selectedProviderId);
              if (!result) {
                setProviderCheckFeedback("未执行检查（工作区不可用）");
                return;
              }
              setProviderCheckFeedback(
                result.connected
                  ? `凭据检查通过（${result.provider}）`
                  : `凭据未就绪（${result.provider}）`,
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              setProviderCheckFeedback(`检查失败：${message}`);
            }
          }}
          disabled={testingProvider}
          title="重新检查 OpenCode auth 凭据状态"
        >
          <Search size={12} aria-hidden />
          <span>{testingProvider ? "检查中..." : "检查凭据"}</span>
        </button>
      </div>
      <div className="opencode-provider-hint">
        会在系统终端打开 OpenCode 原生认证流程，完成后回到当前会话继续使用即可。
      </div>
      {providerPickerOpen && (
        <div
          className="opencode-provider-modal-backdrop"
          onClick={() => onProviderPickerOpenChange(false)}
        >
          <div
            className="opencode-provider-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Connect a provider"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="opencode-provider-modal-header">
              <strong>Connect a provider</strong>
              <button
                type="button"
                className="opencode-provider-modal-close"
                onClick={() => onProviderPickerOpenChange(false)}
              >
                esc
              </button>
            </div>
            <input
              className="opencode-provider-search"
              placeholder="Search"
              value={providerQuery}
              onChange={(event) => onProviderQueryChange(event.target.value)}
              autoFocus
            />
            <div className="opencode-provider-modal-list">
              {filteredProviderOptions.filter((item) => item.category === "popular").length > 0 && (
                <>
                  <div className="opencode-provider-modal-group-title">Popular</div>
                  {filteredProviderOptions
                    .filter((item) => item.category === "popular")
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`opencode-provider-option${selectedProviderId === item.id ? " is-selected" : ""}`}
                        onClick={() => {
                          onSelectedProviderIdChange(item.id);
                          onProviderPickerOpenChange(false);
                        }}
                      >
                        {item.recommended ? `${item.label} (recommended)` : item.label}
                      </button>
                    ))}
                </>
              )}
              {filteredProviderOptions.filter((item) => item.category === "other").length > 0 && (
                <>
                  <div className="opencode-provider-modal-group-title">Other</div>
                  {filteredProviderOptions
                    .filter((item) => item.category === "other")
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`opencode-provider-option${selectedProviderId === item.id ? " is-selected" : ""}`}
                        onClick={() => {
                          onSelectedProviderIdChange(item.id);
                          onProviderPickerOpenChange(false);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {providerCheckFeedback && (
        <div className="opencode-provider-feedback" role="status">
          {providerCheckFeedback}
        </div>
      )}
    </div>
  );
}
