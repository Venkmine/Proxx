/**
 * Unit Tests: JobSpec Builder with Execution Engine Derivation
 * 
 * Tests the pure JobSpec construction logic including engine requirement derivation.
 * 
 * Run with: npm test -- buildJobSpec.test.ts
 */

import { describe, it, expect } from 'vitest'
import { buildJobSpec, jobSpecToJson, JobSpecBuildError, type OutputState } from './buildJobSpec'

describe('buildJobSpec', () => {
  // =========================================================================
  // Required Field Validation
  // =========================================================================
  
  describe('required field validation', () => {
    it('should throw error for empty sources', () => {
      const outputState: OutputState = {
        sources: [],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      expect(() => buildJobSpec(outputState)).toThrow(JobSpecBuildError)
      expect(() => buildJobSpec(outputState)).toThrow('sources')
    })
    
    it('should throw error for missing outputPath', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      expect(() => buildJobSpec(outputState)).toThrow(JobSpecBuildError)
      expect(() => buildJobSpec(outputState)).toThrow('outputPath')
    })
    
    it('should throw error for missing containerFormat', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: '',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      expect(() => buildJobSpec(outputState)).toThrow(JobSpecBuildError)
      expect(() => buildJobSpec(outputState)).toThrow('containerFormat')
    })
    
    it('should throw error for missing filenameTemplate', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '',
        deliveryType: 'proxy',
      }
      
      expect(() => buildJobSpec(outputState)).toThrow(JobSpecBuildError)
      expect(() => buildJobSpec(outputState)).toThrow('filenameTemplate')
    })
  })
  
  // =========================================================================
  // Execution Engine Derivation - All Non-RAW
  // =========================================================================
  
  describe('execution engine derivation - non-RAW sources', () => {
    it('should derive FFmpeg-only for MP4 sources', () => {
      const outputState: OutputState = {
        sources: ['/media/clip1.mp4', '/media/clip2.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(true)
      expect(jobSpec.execution_engines.use_resolve).toBe(false)
    })
    
    it('should derive FFmpeg-only for single MP4 source', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(true)
      expect(jobSpec.execution_engines.use_resolve).toBe(false)
    })
  })
  
  // =========================================================================
  // Execution Engine Derivation - All RAW
  // =========================================================================
  
  describe('execution engine derivation - RAW sources', () => {
    it('should derive Resolve-only for R3D sources', () => {
      const outputState: OutputState = {
        sources: ['/media/A001.r3d', '/media/A002.r3d'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(false)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
    
    it('should derive Resolve-only for BRAW sources', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.braw'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(false)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
    
    it('should derive Resolve-only for ARRI sources', () => {
      const outputState: OutputState = {
        sources: ['/media/scene.ari', '/media/take.arx'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(false)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
  })
  
  // =========================================================================
  // Execution Engine Derivation - Mixed Sources
  // =========================================================================
  
  describe('execution engine derivation - mixed sources', () => {
    it('should derive both engines for RAW + MP4', () => {
      const outputState: OutputState = {
        sources: ['/media/raw.r3d', '/media/standard.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(true)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
    
    it('should derive both engines for BRAW + MP4', () => {
      const outputState: OutputState = {
        sources: ['/media/footage.braw', '/media/proxy.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(true)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
    
    it('should derive both engines for complex mixed job', () => {
      const outputState: OutputState = {
        sources: [
          '/media/A001.r3d',
          '/media/B002.braw',
          '/media/C003.mp4',
          '/media/D004.ari',
        ],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.execution_engines.use_ffmpeg).toBe(true)
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
  })
  
  // =========================================================================
  // Ambiguous Containers (Conservative RAW Assumption)
  // =========================================================================
  
  describe('ambiguous containers', () => {
    it('should conservatively derive Resolve for MOV without codec metadata', () => {
      const outputState: OutputState = {
        sources: ['/media/unknown.mov'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      // Conservative: assume RAW until codec inspection proves otherwise
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
    
    it('should conservatively derive Resolve for MXF without codec metadata', () => {
      const outputState: OutputState = {
        sources: ['/media/unknown.mxf'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      // Conservative: assume RAW until codec inspection proves otherwise
      expect(jobSpec.execution_engines.use_resolve).toBe(true)
    })
  })
  
  // =========================================================================
  // JobSpec Structure Validation
  // =========================================================================
  
  describe('jobspec structure', () => {
    it('should generate valid JobSpec with all required fields', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      // Required fields
      expect(jobSpec.jobspec_version).toBe('2.1')
      expect(jobSpec.job_id).toMatch(/^[a-f0-9]{8}$/)
      expect(jobSpec.sources).toEqual(['/media/clip.mp4'])
      expect(jobSpec.output_directory).toBe('/output')
      expect(jobSpec.container).toBe('mov')
      expect(jobSpec.naming_template).toBe('{source_name}_proxy')
      
      // Defaults for proxy
      expect(jobSpec.codec).toBe('prores_proxy')
      expect(jobSpec.resolution).toBe('half')
      expect(jobSpec.fps_mode).toBe('same-as-source')
      expect(jobSpec.fps_explicit).toBeNull()
      
      // Timestamp
      expect(jobSpec.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      
      // Future fields
      expect(jobSpec.resolve_preset).toBeNull()
      expect(jobSpec.proxy_profile).toBeNull()
      expect(jobSpec.requires_resolve_edition).toBe('either')
      expect(jobSpec.resolved_tokens).toEqual({})
      expect(jobSpec.lut_id).toBeNull()
      expect(jobSpec.lut_applied).toBe(false)
      expect(jobSpec.lut_engine).toBeNull()
      
      // Execution engines
      expect(jobSpec.execution_engines).toBeDefined()
      expect(typeof jobSpec.execution_engines.use_ffmpeg).toBe('boolean')
      expect(typeof jobSpec.execution_engines.use_resolve).toBe('boolean')
    })
    
    it('should use delivery defaults when deliveryType is delivery', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_delivery',
        deliveryType: 'delivery',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.codec).toBe('prores_hq')
      expect(jobSpec.resolution).toBe('same')
    })
    
    it('should use codec override when provided', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
        codec: 'prores_422',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.codec).toBe('prores_422')
    })
    
    it('should use resolution override when provided', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
        resolution: 'quarter',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.resolution).toBe('quarter')
    })
    
    it('should handle explicit FPS mode', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
        fpsMode: 'explicit',
        fpsExplicit: 24,
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.fps_mode).toBe('explicit')
      expect(jobSpec.fps_explicit).toBe(24)
    })
    
    it('should generate unique job IDs', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec1 = buildJobSpec(outputState)
      const jobSpec2 = buildJobSpec(outputState)
      
      expect(jobSpec1.job_id).not.toBe(jobSpec2.job_id)
    })
    
    it('should preserve source order', () => {
      const outputState: OutputState = {
        sources: ['/media/clip3.mp4', '/media/clip1.mp4', '/media/clip2.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      
      expect(jobSpec.sources).toEqual([
        '/media/clip3.mp4',
        '/media/clip1.mp4',
        '/media/clip2.mp4',
      ])
    })
  })
  
  // =========================================================================
  // JSON Serialization
  // =========================================================================
  
  describe('jobSpecToJson', () => {
    it('should serialize JobSpec to JSON string', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      const json = jobSpecToJson(jobSpec)
      
      expect(json).toContain('"jobspec_version": "2.1"')
      expect(json).toContain('"sources"')
      expect(json).toContain('"execution_engines"')
      
      // Verify it's valid JSON
      const parsed = JSON.parse(json)
      expect(parsed.jobspec_version).toBe('2.1')
    })
    
    it('should support custom indentation', () => {
      const outputState: OutputState = {
        sources: ['/media/clip.mp4'],
        outputPath: '/output',
        containerFormat: 'mov',
        filenameTemplate: '{source_name}_proxy',
        deliveryType: 'proxy',
      }
      
      const jobSpec = buildJobSpec(outputState)
      const json = jobSpecToJson(jobSpec, 4)
      
      // With 4-space indent, should have more whitespace
      expect(json.length).toBeGreaterThan(jobSpecToJson(jobSpec, 0).length)
    })
  })
})
