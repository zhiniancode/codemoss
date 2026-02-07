import { useCallback, useEffect, useState } from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

const DEFAULT_HEIGHT = 80;

export function useComposerEditorState() {
  const [textareaHeight, setTextareaHeight] = useState(() => {
    const stored = getClientStoreSync<number>("composer", "textareaHeight");
    if (stored !== undefined && Number.isFinite(stored) && stored >= 60 && stored <= 400) {
      return stored;
    }
    return DEFAULT_HEIGHT;
  });

  useEffect(() => {
    writeClientStoreValue("composer", "textareaHeight", textareaHeight);
  }, [textareaHeight]);

  const handleHeightChange = useCallback((height: number) => {
    setTextareaHeight(height);
  }, []);

  return { textareaHeight, onTextareaHeightChange: handleHeightChange };
}
