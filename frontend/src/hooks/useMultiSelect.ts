/**
 * useMultiSelect - Phase 9A
 * 
 * Hook for multi-selection support in the job queue.
 * 
 * Supports:
 * - Single click to select
 * - Shift+click for range selection
 * - Cmd/Ctrl+click for toggle selection
 * - Select all / deselect all
 * 
 * This is table-stakes for a professional render queue.
 */

import { useState, useCallback, useMemo } from 'react'

export interface UseMultiSelectOptions<T> {
  /** Array of items that can be selected */
  items: T[]
  
  /** Function to get unique ID from an item */
  getItemId: (item: T) => string
  
  /** Initial selected IDs */
  initialSelected?: string[]
}

export interface UseMultiSelectReturn {
  /** Set of currently selected item IDs */
  selectedIds: Set<string>
  
  /** Number of selected items */
  selectedCount: number
  
  /** Check if an item is selected */
  isSelected: (id: string) => boolean
  
  /** Handle click on an item (supports shift/cmd modifiers) */
  handleClick: (id: string, event: React.MouseEvent) => void
  
  /** Select a single item (replaces selection) */
  selectSingle: (id: string) => void
  
  /** Toggle selection of an item */
  toggleSelect: (id: string) => void
  
  /** Select a range of items (from last selected to target) */
  selectRange: (toId: string) => void
  
  /** Select all items */
  selectAll: () => void
  
  /** Deselect all items */
  deselectAll: () => void
  
  /** Get array of selected IDs */
  getSelectedIds: () => string[]
  
  /** Check if any items are selected */
  hasSelection: boolean
  
  /** Check if all items are selected */
  allSelected: boolean
}

export function useMultiSelect<T>({
  items,
  getItemId,
  initialSelected = [],
}: UseMultiSelectOptions<T>): UseMultiSelectReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelected)
  )
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  
  // Build ID to index map for range selection
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((item, index) => {
      map.set(getItemId(item), index)
    })
    return map
  }, [items, getItemId])
  
  // Get all item IDs
  const allIds = useMemo(() => items.map(getItemId), [items, getItemId])
  
  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  )
  
  const selectSingle = useCallback((id: string) => {
    setSelectedIds(new Set([id]))
    setLastSelectedId(id)
  }, [])
  
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setLastSelectedId(id)
  }, [])
  
  const selectRange = useCallback((toId: string) => {
    if (!lastSelectedId) {
      // No previous selection - just select single
      selectSingle(toId)
      return
    }
    
    const fromIndex = idToIndex.get(lastSelectedId)
    const toIndex = idToIndex.get(toId)
    
    if (fromIndex === undefined || toIndex === undefined) {
      // Invalid range - just select single
      selectSingle(toId)
      return
    }
    
    // Select all items in range
    const startIndex = Math.min(fromIndex, toIndex)
    const endIndex = Math.max(fromIndex, toIndex)
    
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (let i = startIndex; i <= endIndex; i++) {
        const id = allIds[i]
        if (id) next.add(id)
      }
      return next
    })
    setLastSelectedId(toId)
  }, [lastSelectedId, idToIndex, allIds, selectSingle])
  
  const handleClick = useCallback((id: string, event: React.MouseEvent) => {
    // Shift+click: range selection
    if (event.shiftKey) {
      selectRange(id)
      return
    }
    
    // Cmd/Ctrl+click: toggle selection
    if (event.metaKey || event.ctrlKey) {
      toggleSelect(id)
      return
    }
    
    // Plain click: single selection
    selectSingle(id)
  }, [selectRange, toggleSelect, selectSingle])
  
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds))
    if (allIds.length > 0) {
      setLastSelectedId(allIds[allIds.length - 1])
    }
  }, [allIds])
  
  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
    setLastSelectedId(null)
  }, [])
  
  const getSelectedIds = useCallback(() => {
    return Array.from(selectedIds)
  }, [selectedIds])
  
  const selectedCount = selectedIds.size
  const hasSelection = selectedCount > 0
  const allSelected = selectedCount === items.length && items.length > 0
  
  return {
    selectedIds,
    selectedCount,
    isSelected,
    handleClick,
    selectSingle,
    toggleSelect,
    selectRange,
    selectAll,
    deselectAll,
    getSelectedIds,
    hasSelection,
    allSelected,
  }
}

export default useMultiSelect
