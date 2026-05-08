import { useState, useEffect, useCallback } from 'react';
import { Card } from '../types';

export const UNGROUPED_ID = '__ungrouped__';

export interface CardGroup {
  id: string;
  name: string;
  cardIds: string[];
}

export function useHandGroups(storageKey: string | null, myCards: Card[]) {
  const [groups, setGroupsRaw] = useState<CardGroup[]>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [{ id: UNGROUPED_ID, name: '', cardIds: [] }];
  });

  const setGroups = useCallback((updater: CardGroup[] | ((prev: CardGroup[]) => CardGroup[])) => {
    setGroupsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  // Sync: add new cards to ungrouped; remove cards that left the hand
  useEffect(() => {
    const cardIdSet = new Set(myCards.map(c => c.id));
    const allGroupedIds = new Set(groups.flatMap(g => g.cardIds));
    const newCards = [...cardIdSet].filter(id => !allGroupedIds.has(id));
    const hasRemovals = groups.some(g => g.cardIds.some(id => !cardIdSet.has(id)));
    if (newCards.length === 0 && !hasRemovals) return;
    setGroups(prev => prev.map(g => ({
      ...g,
      cardIds: [
        ...g.cardIds.filter(id => cardIdSet.has(id)),
        ...(g.id === UNGROUPED_ID ? newCards : []),
      ],
    })));
  }, [myCards.map(c => c.id).join(',')]);

  const addGroup = useCallback(() => {
    setGroups(prev => {
      const n = prev.filter(g => g.id !== UNGROUPED_ID).length + 1;
      return [...prev, { id: crypto.randomUUID(), name: `Group ${n}`, cardIds: [] }];
    });
  }, [setGroups]);

  const removeGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (!group || group.id === UNGROUPED_ID) return prev;
      return prev
        .map(g => g.id === UNGROUPED_ID ? { ...g, cardIds: [...g.cardIds, ...group.cardIds] } : g)
        .filter(g => g.id !== groupId);
    });
  }, [setGroups]);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
  }, [setGroups]);

  const moveCardsToGroup = useCallback((cardIds: string[], targetGroupId: string) => {
    const toMove = new Set(cardIds);
    setGroups(prev => prev.map(g => ({
      ...g,
      cardIds: g.id === targetGroupId
        ? [...g.cardIds.filter(id => !toMove.has(id)), ...cardIds]
        : g.cardIds.filter(id => !toMove.has(id)),
    })));
  }, [setGroups]);

  const reorderWithinGroup = useCallback((groupId: string, newOrder: string[]) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, cardIds: newOrder } : g));
  }, [setGroups]);

  const findCardGroup = useCallback((cardId: string) => {
    return groups.find(g => g.cardIds.includes(cardId));
  }, [groups]);

  return { groups, addGroup, removeGroup, renameGroup, moveCardsToGroup, reorderWithinGroup, findCardGroup };
}
