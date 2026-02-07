import { useCallback, useState } from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

export function useCollapsedGroups(_storageKey: string) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const stored = getClientStoreSync<string[]>("layout", "collapsedGroups");
    if (Array.isArray(stored)) {
      return new Set(stored.filter((value) => typeof value === "string"));
    }
    return new Set();
  });

  const persistCollapsedGroups = useCallback(
    (next: Set<string>) => {
      writeClientStoreValue("layout", "collapsedGroups", Array.from(next));
    },
    [],
  );

  const toggleGroupCollapse = useCallback(
    (groupId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        persistCollapsedGroups(next);
        return next;
      });
    },
    [persistCollapsedGroups],
  );

  return { collapsedGroups, toggleGroupCollapse };
}
