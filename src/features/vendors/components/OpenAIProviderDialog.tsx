import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProtocolDetectionResponse,
  ProtocolType,
  OpenAIProviderConfig,
  OpenAIProviderModel,
  VendorTab,
} from "../types";
import { detectProtocol } from "../../../services/tauri";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OpenAIProviderDialogProps = {
  isOpen: boolean;
  provider: OpenAIProviderConfig | null;
  onClose: () => void;
  onSave: (provider: OpenAIProviderConfig) => void;
  onSwitchVendorTab?: (tab: VendorTab) => void;
};

function normalizeBaseUrlForDetect(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizeBaseUrlForSave(input: string): string {
  const trimmed = normalizeBaseUrlForDetect(input);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // For stored config we must have a scheme so the engine can call it.
  return `https://${trimmed}`;
}

export function OpenAIProviderDialog({
  isOpen,
  provider,
  onClose,
  onSave,
  onSwitchVendorTab,
}: OpenAIProviderDialogProps) {
  const { t } = useTranslation();
  const isAdding = !provider;

  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [providerModels, setProviderModels] = useState<OpenAIProviderModel[]>([]);
  const [manualModelEntryEnabled, setManualModelEntryEnabled] = useState(false);

  const [detectResult, setDetectResult] = useState<ProtocolDetectionResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const probeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeVersionRef = useRef(0);
  const lastDetectInputRef = useRef<{ baseUrl: string; apiKey: string } | null>(null);

  useEffect(() => {
    return () => {
      // Prevent async probe results from trying to update state after unmount.
      probeVersionRef.current++;
      if (probeDebounceRef.current) {
        clearTimeout(probeDebounceRef.current);
        probeDebounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (provider) {
      setProviderName(provider.name || "");
      setBaseUrl(provider.baseUrl || "");
      setApiKey(provider.apiKey || "");
      setDefaultModel(provider.defaultModel || "");
      setProviderModels(provider.models || []);
    } else {
      setProviderName("");
      setBaseUrl("https://api.openai.com/v1");
      setApiKey("");
      setDefaultModel("");
      setProviderModels([]);
    }
    setDetectResult(null);
    setIsDetecting(false);
    setManualModelEntryEnabled(false);
    probeVersionRef.current++;
    lastDetectInputRef.current = null;
    if (probeDebounceRef.current) {
      clearTimeout(probeDebounceRef.current);
      probeDebounceRef.current = null;
    }
  }, [isOpen, provider]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const normalizedBaseUrlForDetect = useMemo(
    () => normalizeBaseUrlForDetect(baseUrl),
    [baseUrl],
  );
  const normalizedBaseUrlForSave = useMemo(
    () => normalizeBaseUrlForSave(baseUrl),
    [baseUrl],
  );
  const detectedModelIds = useMemo(() => {
    const saved = providerModels.map((m) => m.id).filter(Boolean);
    const fromDetect =
      detectResult?.success && detectResult.protocol === "openai"
        ? detectResult.models ?? []
        : [];
    const merged = [...fromDetect, ...saved];
    return Array.from(new Set(merged)).filter(Boolean).sort();
  }, [detectResult, providerModels]);

  const runDetect = async (base: string, key: string) => {
    const currentVersion = ++probeVersionRef.current;
    setIsDetecting(true);
    try {
      const result = (await detectProtocol(base, key, 10_000, "openai")) as ProtocolDetectionResponse;
      if (currentVersion !== probeVersionRef.current) return;
      setDetectResult(result);

      // Persist detected model list into local state so it remains selectable even after closing/reopening.
      if (result.success && result.protocol === "openai" && result.models?.length) {
        setProviderModels(result.models.map((id) => ({ id, label: id })));
      }

      lastDetectInputRef.current = { baseUrl: base.trim(), apiKey: key.trim() };
    } catch (e) {
      if (currentVersion !== probeVersionRef.current) return;
      setDetectResult({
        success: false,
        protocol: "unknown",
        confidence: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (currentVersion === probeVersionRef.current) {
        setIsDetecting(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // When baseUrl/apiKey changes, invalidate any previous detection result to avoid stale UI.
    const last = lastDetectInputRef.current;
    const currentBase = normalizedBaseUrlForDetect.trim();
    const currentKey = apiKey.trim();
    if (!last) {
      if (detectResult) setDetectResult(null);
      return;
    }
    if (last.baseUrl !== currentBase || last.apiKey !== currentKey) {
      setDetectResult(null);
      lastDetectInputRef.current = null;
    }
  }, [apiKey, detectResult, isOpen, normalizedBaseUrlForDetect]);

  const handleSave = () => {
    if (!providerName.trim()) return;
    if (!normalizedBaseUrlForSave) return;
    if (!apiKey.trim()) return;
    if (!defaultModel.trim()) return;

    const providerData: OpenAIProviderConfig = {
      id:
        provider?.id ||
        (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      name: providerName.trim(),
      createdAt: provider?.createdAt,
      remark: provider?.remark,
      baseUrl: normalizedBaseUrlForSave,
      apiKey: apiKey.trim(),
      defaultModel: defaultModel.trim(),
      models: providerModels.length > 0 ? providerModels : undefined,
    };

    onSave(providerData);
  };

  if (!isOpen) return null;

  const detectedProtocol: ProtocolType | null = detectResult?.protocol ?? null;
  const fixedBaseUrl =
    detectResult?.fixedBaseUrl && detectResult.fixedBaseUrl !== normalizedBaseUrlForSave
      ? detectResult.fixedBaseUrl
      : null;

  const isProtocolMismatch =
    Boolean(detectedProtocol) &&
    detectedProtocol !== "unknown" &&
    detectedProtocol !== "openai";

  const shouldAutoDetectOnModelOpen = () => {
    if (isDetecting) return false;
    if (!normalizedBaseUrlForDetect.trim() || !apiKey.trim()) return false;
    if (isProtocolMismatch) return false;
    // If we already have models, no need to probe again.
    if (detectedModelIds.length > 0) return false;
    return true;
  };

  return (
    <div
      className="vendor-dialog-overlay"
      onMouseDown={(e) => {
        // Only close when the press starts on the overlay itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vendor-dialog vendor-dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-dialog-header">
          <h3>
            {isAdding
              ? t("settings.vendor.openaiDialog.addTitle")
              : t("settings.vendor.openaiDialog.editTitle")}
          </h3>
          <button type="button" className="vendor-dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="vendor-dialog-body">
          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.providerName")} *</label>
            <input
              type="text"
              className="vendor-input"
              placeholder={t("settings.vendor.openaiDialog.namePlaceholder")}
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.openaiDialog.baseUrl")} *</label>
            <input
              type="text"
              className="vendor-input"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <small className="vendor-hint">{t("settings.vendor.openaiDialog.baseUrlHint")}</small>
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.openaiDialog.apiKey")} *</label>
            <input
              type="password"
              className="vendor-input"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.openaiDialog.defaultModel")} *</label>
            <Select
              value={defaultModel || ""}
              onValueChange={(value) => {
                if (!value) return;
                if (value === "__manual__") {
                  setManualModelEntryEnabled(true);
                  return;
                }
                setManualModelEntryEnabled(false);
                setDefaultModel(value);
              }}
              onOpenChange={(open) => {
                if (!open) return;
                if (!shouldAutoDetectOnModelOpen()) return;
                void runDetect(normalizedBaseUrlForDetect, apiKey.trim());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings.vendor.openaiDialog.defaultModelPickPlaceholder")} />
              </SelectTrigger>
              <SelectContent
                popupRootClassName="vendor-openai-model-popup-vars"
                popupClassName="vendor-openai-model-popup"
              >
                {isDetecting ? (
                  <SelectItem value="__detecting__" disabled>
                    {t("settings.vendor.openaiDialog.detecting")}
                  </SelectItem>
                ) : detectedModelIds.length > 0 ? (
                  detectedModelIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__no_models__" disabled>
                    {t("settings.vendor.openaiDialog.defaultModelNoModels")}
                  </SelectItem>
                )}
                <SelectItem value="__manual__">
                  {t("settings.vendor.openaiDialog.defaultModelManual")}
                </SelectItem>
              </SelectContent>
            </Select>

            {manualModelEntryEnabled ? (
              <input
                type="text"
                className="vendor-input"
                placeholder={t("settings.vendor.openaiDialog.defaultModelManualPlaceholder")}
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
            ) : null}

            <small className="vendor-hint">{t("settings.vendor.openaiDialog.defaultModelHint")}</small>

            <div className="vendor-detect-row">
              {detectResult?.success && detectResult.protocol === "openai" ? (
                <span className="vendor-hint vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.detectOk", {
                    count: detectResult.models?.length ?? detectedModelIds.length,
                    latency: detectResult.latencyMs ?? 0,
                  })}
                </span>
              ) : isProtocolMismatch ? (
                <span className="vendor-hint vendor-hint-error vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.protocolMismatch", {
                    protocol: detectResult?.protocol ?? "unknown",
                  })}
                </span>
              ) : detectResult?.error ? (
                <span className="vendor-hint vendor-hint-error vendor-hint-inline">
                  {detectResult.error}
                </span>
              ) : (
                <span className="vendor-hint vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.detectHintClickModel")}
                </span>
              )}
            </div>

            {fixedBaseUrl ? (
              <div className="vendor-detect-row">
                <span className="vendor-hint vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.fixedBaseUrlFound", {
                    baseUrl: fixedBaseUrl,
                  })}
                </span>
                <button
                  type="button"
                  className="vendor-btn-cancel vendor-btn-inline"
                  onClick={() => setBaseUrl(fixedBaseUrl)}
                >
                  {t("settings.vendor.openaiDialog.applyFixedBaseUrl")}
                </button>
              </div>
            ) : null}

            {isProtocolMismatch && detectResult?.protocol === "anthropic" && onSwitchVendorTab ? (
              <div className="vendor-detect-row">
                <button
                  type="button"
                  className="vendor-btn-cancel vendor-btn-inline"
                  onClick={() => onSwitchVendorTab("claude")}
                >
                  {t("settings.vendor.openaiDialog.goToClaude")}
                </button>
                <span className="vendor-hint vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.goToClaudeHint")}
                </span>
              </div>
            ) : null}

            {isProtocolMismatch && detectResult?.protocol === "gemini" ? (
              <div className="vendor-detect-row">
                <span className="vendor-hint vendor-hint-inline">
                  {t("settings.vendor.openaiDialog.geminiNotSupported")}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="vendor-dialog-footer">
          <button type="button" className="vendor-btn-cancel" onClick={onClose}>
            {t("settings.vendor.cancel")}
          </button>
          <button
            type="button"
            className="vendor-btn-save"
            onClick={handleSave}
            disabled={!providerName.trim() || !normalizedBaseUrlForSave || !apiKey.trim() || !defaultModel.trim()}
          >
            {t("settings.vendor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
