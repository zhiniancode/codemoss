import { useCallback, useEffect, useState } from "react";
import type { OpenAIProviderConfig } from "../types";
import {
  addOpenAIProvider,
  deleteOpenAIProvider,
  getOpenAIProviders,
  switchOpenAIProvider,
  updateOpenAIProvider,
} from "../../../services/tauri";

export interface OpenAIProviderDialogState {
  isOpen: boolean;
  provider: OpenAIProviderConfig | null;
}

export interface DeleteOpenAIConfirmState {
  isOpen: boolean;
  provider: OpenAIProviderConfig | null;
}

export function useOpenAIProviderManagement() {
  const [providers, setProviders] = useState<OpenAIProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const [providerDialog, setProviderDialog] = useState<OpenAIProviderDialogState>({
    isOpen: false,
    provider: null,
  });

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteOpenAIConfirmState>({
    isOpen: false,
    provider: null,
  });

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getOpenAIProviders();
      setProviders(list as OpenAIProviderConfig[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const notifyEngineConfigChanged = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("engineConfigChanged"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleAddProvider = useCallback(() => {
    setProviderDialog({ isOpen: true, provider: null });
  }, []);

  const handleEditProvider = useCallback((provider: OpenAIProviderConfig) => {
    setProviderDialog({ isOpen: true, provider });
  }, []);

  const handleCloseProviderDialog = useCallback(() => {
    setProviderDialog({ isOpen: false, provider: null });
  }, []);

  const handleSaveProvider = useCallback(
    async (providerData: OpenAIProviderConfig) => {
      const isAdding = !providerDialog.provider;
      try {
        if (isAdding) {
          await addOpenAIProvider(providerData);
        } else {
          await updateOpenAIProvider(providerData.id, providerData);
        }
        setProviderDialog({ isOpen: false, provider: null });
        await loadProviders();
        notifyEngineConfigChanged();
      } catch {
        // ignore
      }
    },
    [loadProviders, notifyEngineConfigChanged, providerDialog.provider],
  );

  const handleSwitchProvider = useCallback(
    async (id: string) => {
      try {
        await switchOpenAIProvider(id);
        await loadProviders();
        notifyEngineConfigChanged();
      } catch {
        // ignore
      }
    },
    [loadProviders, notifyEngineConfigChanged],
  );

  const handleDeleteProvider = useCallback((provider: OpenAIProviderConfig) => {
    setDeleteConfirm({ isOpen: true, provider });
  }, []);

  const confirmDeleteProvider = useCallback(async () => {
    const provider = deleteConfirm.provider;
    if (!provider) return;
    try {
      await deleteOpenAIProvider(provider.id);
      await loadProviders();
      notifyEngineConfigChanged();
    } catch {
      // ignore
    }
    setDeleteConfirm({ isOpen: false, provider: null });
  }, [deleteConfirm.provider, loadProviders, notifyEngineConfigChanged]);

  const cancelDeleteProvider = useCallback(() => {
    setDeleteConfirm({ isOpen: false, provider: null });
  }, []);

  return {
    providers,
    loading,
    providerDialog,
    deleteConfirm,
    loadProviders,
    handleAddProvider,
    handleEditProvider,
    handleCloseProviderDialog,
    handleSaveProvider,
    handleSwitchProvider,
    handleDeleteProvider,
    confirmDeleteProvider,
    cancelDeleteProvider,
  };
}

export type UseOpenAIProviderManagementReturn = ReturnType<
  typeof useOpenAIProviderManagement
>;
