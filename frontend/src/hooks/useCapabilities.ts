/**
 * useCapabilities — Execution Engine Capability Detection
 * 
 * Phase 12: Restore Resolve RAW Routing
 * ============================================================================
 * This hook provides truthful capability status for:
 * - FFmpeg availability
 * - DaVinci Resolve availability (installation + runtime status)
 * - RAW file routing decisions
 * 
 * Usage:
 *   const { ffmpegAvailable, resolveAvailable, rawRouting, refresh } = useCapabilities()
 * 
 *   if (!resolveAvailable && hasRawFiles) {
 *     // Block RAW job creation with explicit message
 *   }
 * 
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface EngineStatus {
  available: boolean
  reason: string | null
  version: string | null
  path: string | null
}

export interface ResolveStatus extends EngineStatus {
  edition: 'free' | 'studio' | 'unknown' | null
  running: boolean
  scripting_available: boolean
}

export interface Capabilities {
  timestamp: string
  ffmpeg: EngineStatus
  resolve: ResolveStatus
  raw_routing: 'resolve' | 'blocked'
  raw_routing_reason: string
}

export interface UseCapabilitiesReturn {
  /** Whether capabilities have been loaded */
  loaded: boolean
  /** Whether a fetch is in progress */
  loading: boolean
  /** Error message if fetch failed */
  error: string | null
  
  /** FFmpeg availability status */
  ffmpegAvailable: boolean
  ffmpegVersion: string | null
  
  /** Resolve availability status */
  resolveAvailable: boolean
  resolveEdition: 'free' | 'studio' | 'unknown' | null
  resolveRunning: boolean
  resolveReason: string | null
  
  /** RAW file routing */
  rawRouting: 'resolve' | 'blocked'
  rawRoutingReason: string
  
  /** Full capabilities response */
  capabilities: Capabilities | null
  
  /** Refresh capabilities from backend */
  refresh: () => Promise<void>
  
  /**
   * Check if a file requires Resolve based on extension.
   * Returns { requiresResolve: boolean, canProcess: boolean, reason?: string }
   */
  checkFileRouting: (filePath: string) => {
    requiresResolve: boolean
    canProcess: boolean
    reason?: string
  }
}

// RAW file extensions that require Resolve
const RAW_EXTENSIONS = new Set([
  'braw',  // Blackmagic RAW
  'r3d',   // RED RAW
  'ari',   // ARRI RAW
  'arx',   // ARRI RAW
  'crm',   // Canon Cinema RAW
  'nev',   // Nikon N-RAW
])

// =============================================================================
// Hook
// =============================================================================

export function useCapabilities(
  backendUrl: string = 'http://localhost:8085'
): UseCapabilitiesReturn {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  
  const fetchCapabilities = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${backendUrl}/api/capabilities`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data: Capabilities = await response.json()
      setCapabilities(data)
      setLoaded(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch capabilities'
      setError(message)
      console.error('[useCapabilities] Fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [backendUrl])
  
  // Fetch on mount
  useEffect(() => {
    fetchCapabilities()
  }, [fetchCapabilities])
  
  // Check file routing
  const checkFileRouting = useCallback((filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const requiresResolve = RAW_EXTENSIONS.has(ext)
    
    if (!requiresResolve) {
      return { requiresResolve: false, canProcess: true }
    }
    
    const resolveAvailable = capabilities?.resolve?.available ?? false
    
    if (resolveAvailable) {
      return { 
        requiresResolve: true, 
        canProcess: true,
        reason: 'Will be processed by DaVinci Resolve'
      }
    }
    
    return {
      requiresResolve: true,
      canProcess: false,
      reason: capabilities?.resolve?.reason || 
        'DaVinci Resolve is required but not available'
    }
  }, [capabilities])
  
  return {
    loaded,
    loading,
    error,
    
    ffmpegAvailable: capabilities?.ffmpeg?.available ?? false,
    ffmpegVersion: capabilities?.ffmpeg?.version ?? null,
    
    resolveAvailable: capabilities?.resolve?.available ?? false,
    resolveEdition: capabilities?.resolve?.edition ?? null,
    resolveRunning: capabilities?.resolve?.running ?? false,
    resolveReason: capabilities?.resolve?.reason ?? null,
    
    rawRouting: capabilities?.raw_routing ?? 'blocked',
    rawRoutingReason: capabilities?.raw_routing_reason ?? 
      'Checking engine availability...',
    
    capabilities,
    
    refresh: fetchCapabilities,
    checkFileRouting,
  }
}

export default useCapabilities
