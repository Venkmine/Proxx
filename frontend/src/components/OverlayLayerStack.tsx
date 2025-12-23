/**
 * OverlayLayerStack — Phase 5A Overlay Layer Management
 * 
 * A vertical layer stack UI for managing overlays with:
 * - Drag-to-reorder functionality
 * - Visibility toggle (eye icon)
 * - Layer name + type display
 * - Scope badge (Project / Clip)
 * - Delete layer with confirmation
 * 
 * This component reflects backend-backed state only.
 * All layers must be visible, reorderable, and removable.
 */

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { OverlayLayer, OverlayLayerType, OverlayLayerScope } from './DeliverControlPanel'
import { Button } from './Button'

// ============================================================================
// TYPES
// ============================================================================

interface OverlayLayerStackProps {
  layers: OverlayLayer[]
  onLayersChange: (layers: OverlayLayer[]) => void
  selectedLayerId: string | null
  onLayerSelect: (layerId: string | null) => void
  isReadOnly?: boolean
  selectedClipId?: string | null
  onAddLayer?: (type: OverlayLayerType, scope: OverlayLayerScope) => void
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getLayerTypeIcon(type: OverlayLayerType): string {
  switch (type) {
    case 'text': return 'T'
    case 'image': return '🖼'
    case 'timecode': return '⏱'
    case 'metadata': return '📋'
    default: return '?'
  }
}

function getLayerTypeName(type: OverlayLayerType): string {
  switch (type) {
    case 'text': return 'Text'
    case 'image': return 'Image'
    case 'timecode': return 'Timecode'
    case 'metadata': return 'Metadata'
    default: return 'Unknown'
  }
}

function getLayerDisplayName(layer: OverlayLayer): string {
  if (layer.type === 'text') {
    return layer.settings.text?.slice(0, 20) || 'Text Layer'
  }
  if (layer.type === 'image') {
    return layer.settings.image_name || 'Image Layer'
  }
  if (layer.type === 'timecode') {
    return 'Timecode'
  }
  if (layer.type === 'metadata') {
    return layer.settings.metadata_field || 'Metadata'
  }
  return `Layer ${layer.id.slice(0, 6)}`
}

// ============================================================================
// SORTABLE LAYER ITEM
// ============================================================================

interface SortableLayerItemProps {
  layer: OverlayLayer
  isSelected: boolean
  isReadOnly: boolean
  onSelect: () => void
  onToggleVisibility: () => void
  onDelete: () => void
}

function SortableLayerItem({
  layer,
  isSelected,
  isReadOnly,
  onSelect,
  onToggleVisibility,
  onDelete,
}: SortableLayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id, disabled: isReadOnly })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`layer-item-${layer.id}`}
      onClick={onSelect}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem',
          background: isSelected 
            ? 'rgba(59, 130, 246, 0.2)' 
            : layer.enabled 
              ? 'rgba(51, 65, 85, 0.3)' 
              : 'rgba(51, 65, 85, 0.15)',
          border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.5)' : 'var(--border-secondary)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: isReadOnly ? 'default' : 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: isReadOnly ? 'not-allowed' : 'grab',
            color: 'var(--text-dim)',
            fontSize: '0.75rem',
            padding: '0.25rem',
            opacity: isReadOnly ? 0.4 : 0.7,
          }}
          title={isReadOnly ? 'Cannot reorder in read-only mode' : 'Drag to reorder'}
        >
          ⋮⋮
        </div>

        {/* Visibility Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          disabled={isReadOnly}
          style={{
            background: 'none',
            border: 'none',
            cursor: isReadOnly ? 'not-allowed' : 'pointer',
            padding: '0.25rem',
            fontSize: '0.875rem',
            opacity: isReadOnly ? 0.4 : 1,
            color: layer.enabled ? 'var(--text-primary)' : 'var(--text-dim)',
          }}
          title={layer.enabled ? 'Hide layer' : 'Show layer'}
          data-testid={`layer-visibility-${layer.id}`}
        >
          {layer.enabled ? '👁' : '👁‍🗨'}
        </button>

        {/* Type Icon */}
        <span
          style={{
            fontSize: '0.75rem',
            width: '1.5rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
          title={getLayerTypeName(layer.type)}
        >
          {getLayerTypeIcon(layer.type)}
        </span>

        {/* Layer Name */}
        <span
          style={{
            flex: 1,
            fontSize: '0.75rem',
            color: layer.enabled ? 'var(--text-primary)' : 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: layer.enabled ? 'none' : 'line-through',
          }}
        >
          {getLayerDisplayName(layer)}
        </span>

        {/* Scope Badge */}
        <span
          style={{
            padding: '0.125rem 0.375rem',
            fontSize: '0.5rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            color: layer.scope === 'project' ? 'rgb(251, 191, 36)' : 'rgb(59, 130, 246)',
            background: layer.scope === 'project' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            borderRadius: 'var(--radius-sm)',
          }}
          title={layer.scope === 'project' ? 'Applies to all clips' : 'Applies to selected clip only'}
        >
          {layer.scope === 'project' ? 'PRJ' : 'CLIP'}
        </span>

        {/* Delete Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={isReadOnly}
          style={{
            background: 'none',
            border: 'none',
            cursor: isReadOnly ? 'not-allowed' : 'pointer',
            padding: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            opacity: isReadOnly ? 0.4 : 1,
          }}
          title={isReadOnly ? 'Cannot delete in read-only mode' : 'Delete layer'}
          data-testid={`layer-delete-${layer.id}`}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// DELETE CONFIRMATION DIALOG
// ============================================================================

interface DeleteConfirmDialogProps {
  layerName: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmDialog({ layerName, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--card-bg-solid, rgba(26, 32, 44, 0.98))',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          maxWidth: '400px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ 
          margin: '0 0 1rem 0', 
          fontSize: '1rem', 
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          Delete Overlay Layer?
        </h3>
        <p style={{ 
          margin: '0 0 1.5rem 0', 
          fontSize: '0.875rem', 
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          Are you sure you want to delete <strong>"{layerName}"</strong>? 
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={onConfirm}
            style={{ background: 'rgb(239, 68, 68)' }}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ADD OVERLAY DROPDOWN
// ============================================================================

interface AddOverlayDropdownProps {
  onAdd: (type: OverlayLayerType, scope: OverlayLayerScope) => void
  isReadOnly: boolean
}

function AddOverlayDropdown({ onAdd, isReadOnly }: AddOverlayDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedScope, setSelectedScope] = useState<OverlayLayerScope>('project')

  const overlayTypes: { type: OverlayLayerType; label: string; icon: string }[] = [
    { type: 'text', label: 'Text', icon: 'T' },
    { type: 'image', label: 'Image', icon: '🖼' },
    { type: 'timecode', label: 'Timecode', icon: '⏱' },
    { type: 'metadata', label: 'Metadata', icon: '📋' },
  ]

  const handleAdd = useCallback((type: OverlayLayerType) => {
    onAdd(type, selectedScope)
    setIsOpen(false)
  }, [onAdd, selectedScope])

  return (
    <div style={{ position: 'relative' }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isReadOnly}
        fullWidth
        data-testid="add-overlay-btn"
      >
        + Add Overlay
      </Button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            background: 'var(--card-bg-solid, rgba(26, 32, 44, 0.98))',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 100,
          }}
        >
          {/* Scope Selector */}
          <div
            style={{
              padding: '0.5rem',
              borderBottom: '1px solid var(--border-secondary)',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button
              onClick={() => setSelectedScope('project')}
              style={{
                flex: 1,
                padding: '0.375rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                background: selectedScope === 'project' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(51, 65, 85, 0.3)',
                border: `1px solid ${selectedScope === 'project' ? 'rgba(251, 191, 36, 0.5)' : 'var(--border-secondary)'}`,
                borderRadius: 'var(--radius-sm)',
                color: selectedScope === 'project' ? 'rgb(251, 191, 36)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Project
            </button>
            <button
              onClick={() => setSelectedScope('clip')}
              style={{
                flex: 1,
                padding: '0.375rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                background: selectedScope === 'clip' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(51, 65, 85, 0.3)',
                border: `1px solid ${selectedScope === 'clip' ? 'rgba(59, 130, 246, 0.5)' : 'var(--border-secondary)'}`,
                borderRadius: 'var(--radius-sm)',
                color: selectedScope === 'clip' ? 'rgb(59, 130, 246)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Clip
            </button>
          </div>

          {/* Overlay Type Options */}
          <div style={{ padding: '0.25rem' }}>
            {overlayTypes.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => handleAdd(type)}
                data-testid={`add-overlay-${type}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(51, 65, 85, 0.4)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ width: '1.5rem', textAlign: 'center' }}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Cancel */}
          <div style={{ padding: '0.25rem 0.5rem 0.5rem', borderTop: '1px solid var(--border-secondary)', marginTop: '0.25rem' }}>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                width: '100%',
                padding: '0.375rem',
                fontSize: '0.6875rem',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OverlayLayerStack({
  layers,
  onLayersChange,
  selectedLayerId,
  onLayerSelect,
  isReadOnly = false,
  selectedClipId,
  onAddLayer,
}: OverlayLayerStackProps) {
  const [deleteTarget, setDeleteTarget] = useState<OverlayLayer | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Filter layers based on scope and selected clip
  const visibleLayers = layers.filter(layer => {
    if (layer.scope === 'project') return true
    if (layer.scope === 'clip' && layer.clipId === selectedClipId) return true
    return false
  })

  // Sort layers by order (higher = on top, so render first in list for visual consistency)
  const sortedLayers = [...visibleLayers].sort((a, b) => b.order - a.order)

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      const oldIndex = sortedLayers.findIndex(l => l.id === active.id)
      const newIndex = sortedLayers.findIndex(l => l.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sortedLayers, oldIndex, newIndex)
        
        // Update order values based on new positions (reverse index for z-order)
        const updatedLayers = reordered.map((layer, index) => ({
          ...layer,
          order: reordered.length - index,
        }))
        
        // Merge back with layers that weren't visible
        const otherLayers = layers.filter(l => !visibleLayers.includes(l))
        onLayersChange([...otherLayers, ...updatedLayers])
      }
    }
  }, [sortedLayers, layers, visibleLayers, onLayersChange])

  const handleToggleVisibility = useCallback((layerId: string) => {
    const updatedLayers = layers.map(l => 
      l.id === layerId ? { ...l, enabled: !l.enabled } : l
    )
    onLayersChange(updatedLayers)
  }, [layers, onLayersChange])

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      const updatedLayers = layers.filter(l => l.id !== deleteTarget.id)
      onLayersChange(updatedLayers)
      if (selectedLayerId === deleteTarget.id) {
        onLayerSelect(null)
      }
      setDeleteTarget(null)
    }
  }, [deleteTarget, layers, onLayersChange, selectedLayerId, onLayerSelect])

  const handleAddLayer = useCallback((type: OverlayLayerType, scope: OverlayLayerScope) => {
    if (onAddLayer) {
      onAddLayer(type, scope)
    }
  }, [onAddLayer])

  // Count active layers
  const activeCount = layers.filter(l => l.enabled).length
  const projectCount = layers.filter(l => l.scope === 'project').length
  const clipCount = layers.filter(l => l.scope === 'clip').length

  return (
    <div data-testid="overlay-layer-stack">
      {/* Header with counts */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
          }}
        >
          {layers.length} layer{layers.length !== 1 ? 's' : ''}
          {activeCount !== layers.length && ` (${activeCount} active)`}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {projectCount > 0 && (
            <span
              style={{
                padding: '0.125rem 0.375rem',
                fontSize: '0.5rem',
                fontWeight: 600,
                color: 'rgb(251, 191, 36)',
                background: 'rgba(251, 191, 36, 0.15)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {projectCount} PRJ
            </span>
          )}
          {clipCount > 0 && (
            <span
              style={{
                padding: '0.125rem 0.375rem',
                fontSize: '0.5rem',
                fontWeight: 600,
                color: 'rgb(59, 130, 246)',
                background: 'rgba(59, 130, 246, 0.15)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {clipCount} CLIP
            </span>
          )}
        </div>
      </div>

      {/* Add Overlay Button */}
      <div style={{ marginBottom: '0.75rem' }}>
        <AddOverlayDropdown onAdd={handleAddLayer} isReadOnly={isReadOnly} />
      </div>

      {/* Layer Stack */}
      {sortedLayers.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedLayers.map(l => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {sortedLayers.map(layer => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  isSelected={layer.id === selectedLayerId}
                  isReadOnly={isReadOnly}
                  onSelect={() => onLayerSelect(layer.id)}
                  onToggleVisibility={() => handleToggleVisibility(layer.id)}
                  onDelete={() => setDeleteTarget(layer)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.6875rem',
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            background: 'rgba(51, 65, 85, 0.1)',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-secondary)',
          }}
        >
          No overlay layers. Click "Add Overlay" to create one.
        </div>
      )}

      {/* Read-only indicator */}
      {isReadOnly && layers.length > 0 && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            fontSize: '0.625rem',
            color: 'var(--text-dim)',
            textAlign: 'center',
            fontStyle: 'italic',
            background: 'rgba(251, 191, 36, 0.1)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
          }}
        >
          Job is running or completed — overlays are read-only
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          layerName={getLayerDisplayName(deleteTarget)}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

export default OverlayLayerStack
