import { useState } from "react";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Search from "lucide-react/dist/esm/icons/search";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import type { OpenCodeProviderHealth } from "../types";

type OpenCodeProviderSectionProps = {
  providerHealth: OpenCodeProviderHealth;
  providerStatusTone: "is-ok" | "is-runtime" | "is-fail";
  providerStatusLabel: string;
  showHeader?: boolean;
  connectingProvider: boolean;
  testingProvider: boolean;
  onConnectProvider: (providerId: string | null) => Promise<void>;
  onTestProvider: (providerId?: string | null) => Promise<OpenCodeProviderHealth | null>;
};

export function OpenCodeProviderSection({
  providerHealth,
  providerStatusTone,
  providerStatusLabel,
  showHeader = true,
  connectingProvider,
  testingProvider,
  onConnectProvider,
  onTestProvider,
}: OpenCodeProviderSectionProps) {
  const [providerCheckFeedback, setProviderCheckFeedback] = useState<string | null>(null);

  return (
    <div className="opencode-panel-provider">
      {showHeader && (
        <>
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
        </>
      )}
      <div className="opencode-provider-connect">
        <div className="opencode-provider-select-wrap">
          <span>Connect a provider</span>
        </div>
        <button
          type="button"
          className="opencode-provider-connect-btn"
          onClick={async () => {
            await onConnectProvider(null);
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
              const result = await onTestProvider(null);
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
      {providerCheckFeedback && (
        <div className="opencode-provider-feedback" role="status">
          {providerCheckFeedback}
        </div>
      )}
    </div>
  );
}
