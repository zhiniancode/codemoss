// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenCodeControlPanel } from "./OpenCodeControlPanel";
import { useOpenCodeControlPanel } from "../hooks/useOpenCodeControlPanel";

vi.mock("../hooks/useOpenCodeControlPanel", () => ({
  useOpenCodeControlPanel: vi.fn(),
}));

const mockUseOpenCodeControlPanel = vi.mocked(useOpenCodeControlPanel);

function buildHookState() {
  return {
    loading: false,
    error: null,
    snapshot: {
      sessionId: "ses_1234567890",
      model: "openai/gpt-5.3-codex",
      agent: "default",
      variant: "default",
      provider: "openai",
      providerHealth: {
        provider: "openai",
        connected: true,
        credentialCount: 1,
        matched: true,
        error: null,
      },
      mcpEnabled: true,
      mcpServers: [
        { name: "fs", enabled: true, status: "ok", permissionHint: "filesystem" },
      ],
      mcpRaw: "",
      managedToggles: true,
      tokenUsage: 100,
      contextWindow: 200000,
    },
    providerHealth: {
      provider: "openai",
      connected: true,
      credentialCount: 1,
      matched: true,
      error: null,
    },
    testingProvider: false,
    sessions: [
      { sessionId: "ses_1234567890", title: "First session", updatedLabel: "刚刚" },
      { sessionId: "ses_abc", title: "Second session", updatedLabel: "1m" },
    ],
    providerOptions: [
      { id: "opencode-zen", label: "OpenCode Zen", category: "popular" as const, recommended: true },
      { id: "openai", label: "OpenAI", category: "popular" as const, recommended: false },
      { id: "z-ai", label: "Z.AI", category: "other" as const, recommended: false },
    ],
    connectingProvider: false,
    favoriteSessionIds: {},
    refresh: vi.fn(async () => {}),
    testProvider: vi.fn(async () => null),
    connectProvider: vi.fn(async () => {}),
    toggleMcpGlobal: vi.fn(async () => {}),
    toggleMcpServer: vi.fn(async () => {}),
    toggleFavoriteSession: vi.fn(),
  };
}

describe("OpenCodeControlPanel", () => {
  beforeEach(() => {
    mockUseOpenCodeControlPanel.mockReset();
    mockUseOpenCodeControlPanel.mockReturnValue(buildHookState());
  });

  it("does not render when hidden", () => {
    const { container } = render(
      <OpenCodeControlPanel
        visible={false}
        workspaceId="ws-1"
        threadId="opencode:ses_1234567890"
        selectedModel="openai/gpt-5.3-codex"
        selectedAgent="default"
        selectedVariant="default"
      />,
    );

    expect(container.querySelector('[data-testid="opencode-control-panel"]')).toBeNull();
  });

  it("opens drawer and switches tabs", () => {
    render(
      <OpenCodeControlPanel
        visible
        workspaceId="ws-1"
        threadId="opencode:ses_1234567890"
        selectedModel="openai/gpt-5.3-codex"
        selectedAgent="default"
        selectedVariant="default"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开状态面板" }));
    expect(screen.getByRole("dialog", { name: "OpenCode 管理面板" })).toBeTruthy();
    expect(screen.getByText("连接引导")).toBeTruthy();
    expect(screen.getByText("Connect a provider")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "MCP" }));
    expect(screen.getByText("总开关")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(screen.getByPlaceholderText("搜索 session / title")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Advanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByText("Debug / Console / Heap 入口已下沉到 Advanced。")).toBeTruthy();
  });

  it("closes drawer on Escape", () => {
    render(
      <OpenCodeControlPanel
        visible
        workspaceId="ws-1"
        threadId="opencode:ses_1234567890"
        selectedModel="openai/gpt-5.3-codex"
        selectedAgent="default"
        selectedVariant="default"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开状态面板" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "OpenCode 管理面板" })).toBeNull();
  });
});
