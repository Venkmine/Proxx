/**
 * Unit Tests: Deterministic Execution Engine Derivation
 * 
 * Tests the pure engine derivation logic without UI, Electron, or filesystem.
 * 
 * Run with: npm test -- deriveExecutionEngines.test.ts
 */

import { describe, it, expect } from 'vitest'
import { deriveExecutionEngines, type SourceMetadata } from './deriveExecutionEngines'

describe('deriveExecutionEngines', () => {
  // =========================================================================
  // Edge Cases
  // =========================================================================
  
  describe('edge cases', () => {
    it('should throw error for empty source list', () => {
      expect(() => deriveExecutionEngines([])).toThrow('sources array is empty')
    })
    
    it('should throw error for null/undefined sources', () => {
      expect(() => deriveExecutionEngines(null as any)).toThrow()
      expect(() => deriveExecutionEngines(undefined as any)).toThrow()
    })
  })
  
  // =========================================================================
  // All-RAW Sources → Resolve Only
  // =========================================================================
  
  describe('all-RAW sources', () => {
    it('should require Resolve only for RED R3D files', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip1.r3d' },
        { path: 'clip2.R3D' },  // Case insensitive
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
      expect(result.reason).toContain('RAW')
    })
    
    it('should require Resolve only for Blackmagic BRAW files', () => {
      const sources: SourceMetadata[] = [
        { path: '/path/to/clip.braw' },
        { path: 'another_clip.BRAW' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
      expect(result.reason).toContain('All sources are RAW')
    })
    
    it('should require Resolve only for ARRI files', () => {
      const sources: SourceMetadata[] = [
        { path: 'footage.ari' },
        { path: 'scene.arx' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
    })
    
    it('should require Resolve only for mixed RAW formats', () => {
      const sources: SourceMetadata[] = [
        { path: 'red_clip.r3d' },
        { path: 'braw_clip.braw' },
        { path: 'arri_clip.ari' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
    })
    
    it('should require Resolve for single RAW file', () => {
      const sources: SourceMetadata[] = [
        { path: 'single_raw.r3d' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
    })
  })
  
  // =========================================================================
  // All Non-RAW Sources → FFmpeg Only
  // =========================================================================
  
  describe('all non-RAW sources', () => {
    it('should require FFmpeg only for MP4 files', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip1.mp4' },
        { path: 'clip2.MP4' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
      expect(result.reason).toContain('non-RAW')
    })
    
    it('should require FFmpeg only for standard ProRes MOV', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip.mov', codec: 'prores' },
        { path: 'clip2.mov', codec: 'prores_422' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
      expect(result.reason).toContain('All sources are non-RAW')
    })
    
    it('should require FFmpeg only for H.264', () => {
      const sources: SourceMetadata[] = [
        { path: 'footage.mp4', codec: 'h264' },
        { path: 'clip.mov', codec: 'h264' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
    })
    
    it('should require FFmpeg only for single non-RAW file', () => {
      const sources: SourceMetadata[] = [
        { path: 'single.mp4' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
    })
    
    it('should require FFmpeg only for DNxHD MXF', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip.mxf', codec: 'dnxhd' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
    })
  })
  
  // =========================================================================
  // Mixed Sources → FFmpeg + Resolve
  // =========================================================================
  
  describe('mixed RAW and non-RAW sources', () => {
    it('should require both engines for RAW + MP4', () => {
      const sources: SourceMetadata[] = [
        { path: 'raw_footage.r3d' },
        { path: 'standard_clip.mp4' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(true)
      expect(result.reason).toContain('Mixed')
    })
    
    it('should require both engines for BRAW + ProRes', () => {
      const sources: SourceMetadata[] = [
        { path: 'raw.braw' },
        { path: 'proxy.mov', codec: 'prores' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(true)
      expect(result.reason).toContain('Mixed RAW and non-RAW')
    })
    
    it('should require both engines for mixed job with multiple formats', () => {
      const sources: SourceMetadata[] = [
        { path: 'A001.r3d' },
        { path: 'B002.braw' },
        { path: 'C003.mp4' },
        { path: 'D004.mov', codec: 'h264' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(true)
    })
  })
  
  // =========================================================================
  // Ambiguous Containers
  // =========================================================================
  
  describe('ambiguous containers', () => {
    it('should conservatively treat MOV without codec as RAW', () => {
      const sources: SourceMetadata[] = [
        { path: 'unknown.mov' },  // No codec metadata
      ]
      
      const result = deriveExecutionEngines(sources)
      
      // Conservative: assume RAW until codec inspection proves otherwise
      expect(result.useResolve).toBe(true)
    })
    
    it('should conservatively treat MXF without codec as RAW', () => {
      const sources: SourceMetadata[] = [
        { path: 'unknown.mxf' },  // No codec metadata
      ]
      
      const result = deriveExecutionEngines(sources)
      
      // Conservative: assume RAW until codec inspection proves otherwise
      expect(result.useResolve).toBe(true)
    })
    
    it('should use codec metadata to override MOV classification', () => {
      const sources: SourceMetadata[] = [
        { path: 'confirmed_standard.mov', codec: 'prores' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
    })
    
    it('should detect ProRes RAW even in MOV container', () => {
      const sources: SourceMetadata[] = [
        { path: 'prores_raw.mov', codec: 'prores_raw' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
    })
  })
  
  // =========================================================================
  // Codec Metadata Override
  // =========================================================================
  
  describe('codec metadata priority', () => {
    it('should use codec metadata over extension when available', () => {
      const sources: SourceMetadata[] = [
        { path: 'file.mov', codec: 'h264' },  // Codec says non-RAW
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
      expect(result.useResolve).toBe(false)
    })
    
    it('should detect RAW codec even if extension is ambiguous', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip.mov', codec: 'proresraw' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(false)
      expect(result.useResolve).toBe(true)
    })
  })
  
  // =========================================================================
  // Case Insensitivity
  // =========================================================================
  
  describe('case insensitivity', () => {
    it('should handle uppercase extensions', () => {
      const sources: SourceMetadata[] = [
        { path: 'CLIP.R3D' },
        { path: 'FOOTAGE.BRAW' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useResolve).toBe(true)
    })
    
    it('should handle mixed case extensions', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip.Mp4' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
    })
  })
  
  // =========================================================================
  // Path Variations
  // =========================================================================
  
  describe('path variations', () => {
    it('should extract extension from full path', () => {
      const sources: SourceMetadata[] = [
        { path: '/Users/operator/Media/ProjectA/Day1/A001.r3d' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useResolve).toBe(true)
    })
    
    it('should handle filenames without path', () => {
      const sources: SourceMetadata[] = [
        { path: 'clip.mp4' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useFFmpeg).toBe(true)
    })
    
    it('should handle paths with dots in directory names', () => {
      const sources: SourceMetadata[] = [
        { path: '/Media/Project.2024/Footage.RAW/clip.r3d' },
      ]
      
      const result = deriveExecutionEngines(sources)
      
      expect(result.useResolve).toBe(true)
    })
  })
})
