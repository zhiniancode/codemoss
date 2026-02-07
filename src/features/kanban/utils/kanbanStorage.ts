import type { KanbanStoreData } from "../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

const EMPTY_STORE: KanbanStoreData = { tasks: [] };

export function loadKanbanData(): KanbanStoreData {
  const stored = getClientStoreSync<KanbanStoreData>("app", "kanban");
  if (!stored || !Array.isArray(stored.tasks)) {
    return EMPTY_STORE;
  }
  return { tasks: stored.tasks };
}

export function saveKanbanData(data: KanbanStoreData): void {
  writeClientStoreValue("app", "kanban", data);
}
