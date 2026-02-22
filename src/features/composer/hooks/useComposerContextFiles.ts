import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseComposerContextFilesArgs = {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
};

// Tracks "context file" attachments per thread (or per workspace draft when no thread exists yet).
// These are file paths relative to the workspace root.
export function useComposerContextFiles({
  activeThreadId,
  activeWorkspaceId,
}: UseComposerContextFilesArgs) {
  const [filesByThread, setFilesByThread] = useState<Record<string, string[]>>({});
  const prevThreadIdRef = useRef<string | null>(activeThreadId);

  const draftKey = useMemo(
    () => activeThreadId ?? `draft-${activeWorkspaceId ?? "none"}`,
    [activeThreadId, activeWorkspaceId],
  );

  const activeFiles = filesByThread[draftKey] ?? [];

  useEffect(() => {
    const prevThreadId = prevThreadIdRef.current;
    prevThreadIdRef.current = activeThreadId;
    // When the first send creates a new thread, migrate any draft attachments to that thread
    // so the attachments persist across subsequent messages in the same thread.
    if (!activeThreadId || prevThreadId === activeThreadId) {
      return;
    }
    if (prevThreadId) {
      return;
    }
    const prevKey = `draft-${activeWorkspaceId ?? "none"}`;
    setFilesByThread((prev) => {
      const draftFiles = prev[prevKey] ?? [];
      if (draftFiles.length === 0) {
        return prev;
      }
      const existing = prev[activeThreadId] ?? [];
      const merged = Array.from(new Set([...existing, ...draftFiles]));
      const { [prevKey]: _, ...rest } = prev;
      return { ...rest, [activeThreadId]: merged };
    });
  }, [activeThreadId, activeWorkspaceId]);

  const attachFiles = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      setFilesByThread((prev) => {
        const existing = prev[draftKey] ?? [];
        const merged = Array.from(new Set([...existing, ...paths]));
        return { ...prev, [draftKey]: merged };
      });
    },
    [draftKey],
  );

  const removeFile = useCallback(
    (path: string) => {
      setFilesByThread((prev) => {
        const existing = prev[draftKey] ?? [];
        const next = existing.filter((entry) => entry !== path);
        if (next.length === 0) {
          const { [draftKey]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [draftKey]: next };
      });
    },
    [draftKey],
  );

  const clearActiveFiles = useCallback(() => {
    setFilesByThread((prev) => {
      if (!(draftKey in prev)) {
        return prev;
      }
      const { [draftKey]: _, ...rest } = prev;
      return rest;
    });
  }, [draftKey]);

  const setFilesForThread = useCallback((threadId: string, files: string[]) => {
    setFilesByThread((prev) => ({ ...prev, [threadId]: files }));
  }, []);

  const removeFilesForThread = useCallback((threadId: string) => {
    setFilesByThread((prev) => {
      if (!(threadId in prev)) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    activeFiles,
    attachFiles,
    removeFile,
    clearActiveFiles,
    setFilesForThread,
    removeFilesForThread,
  };
}
