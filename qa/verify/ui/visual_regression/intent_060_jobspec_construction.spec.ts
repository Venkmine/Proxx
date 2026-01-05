/**
 * INTENT_060: Job Spec Construction
 * 
 * SCOPE:
 * - buildJobSpec() creates valid JobSpec JSON from Output state
 * - Deterministic output for same inputs
 * - Fail-fast on missing required fields
 * - No side effects, no backend calls
 * 
 * PASS CRITERIA:
 * 1. Minimal valid output state produces valid JobSpec
 * 2. JobSpec includes all required fields
 * 3. JobSpec version is "2.1"
 * 4. job_id is generated (8-char hex)
 * 5. created_at is valid ISO 8601 timestamp
 * 6. Sources array is preserved (order + content)
 * 7. Codec defaults based on delivery type
 * 8. Resolution defaults based on delivery type
 * 9. Missing sources throws JobSpecBuildError
 * 10. Missing outputPath throws JobSpecBuildError
 * 11. Missing containerFormat throws JobSpecBuildError
 * 12. Missing filenameTemplate throws JobSpecBuildError
 * 13. JobSpec structure matches backend contract
 * 14. Deterministic output (same inputs → same structure, different IDs/timestamps)
 * 
 * REGRESSION INSURANCE:
 * - Guards against breaking backend JobSpec contract
 * - Ensures UI → backend mapping is correct
 * - Validates fail-fast behavior on invalid inputs
 */

import { test, expect } from '@playwright/test'
import { buildJobSpec, jobSpecToJson, JobSpecBuildError, type OutputState, type JobSpec } from '../../../../frontend/src/utils/buildJobSpec'

test.describe('INTENT_060: Job Spec Construction', () => {
  
  const MINIMAL_OUTPUT_STATE: OutputState = {
    sources: ['/path/to/source.mov'],
    outputPath: '/path/to/output',
    containerFormat: 'mov',
    filenameTemplate: '{source_name}_proxy',
    deliveryType: 'proxy',
  }
  
  test('1. Minimal valid output state produces valid JobSpec', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    expect(jobSpec).toBeDefined()
    expect(typeof jobSpec).toBe('object')
  })
  
  test('2. JobSpec includes all required fields', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // Contract-required fields
    expect(jobSpec.jobspec_version).toBeDefined()
    expect(jobSpec.job_id).toBeDefined()
    expect(jobSpec.sources).toBeDefined()
    expect(jobSpec.output_directory).toBeDefined()
    expect(jobSpec.codec).toBeDefined()
    expect(jobSpec.container).toBeDefined()
    expect(jobSpec.resolution).toBeDefined()
    expect(jobSpec.fps_mode).toBeDefined()
    expect(jobSpec.naming_template).toBeDefined()
    expect(jobSpec.created_at).toBeDefined()
    
    // Ensure no undefined values
    expect(Object.values(jobSpec).some(v => v === undefined)).toBe(false)
  })
  
  test('3. JobSpec version is "2.1"', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    expect(jobSpec.jobspec_version).toBe('2.1')
  })
  
  test('4. job_id is generated (8-char hex)', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    expect(jobSpec.job_id).toMatch(/^[0-9a-f]{8}$/)
  })
  
  test('5. created_at is valid ISO 8601 timestamp', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // Should be valid ISO 8601 format
    const date = new Date(jobSpec.created_at)
    expect(date.toISOString()).toBe(jobSpec.created_at)
    
    // Should be recent (within last 5 seconds)
    const now = Date.now()
    const timestamp = date.getTime()
    expect(now - timestamp).toBeLessThan(5000)
  })
  
  test('6. Sources array is preserved (order + content)', () => {
    const multiSourceState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      sources: [
        '/first/source.mov',
        '/second/source.mp4',
        '/third/source.mxf',
      ],
    }
    
    const jobSpec = buildJobSpec(multiSourceState)
    
    expect(jobSpec.sources).toHaveLength(3)
    expect(jobSpec.sources[0]).toBe('/first/source.mov')
    expect(jobSpec.sources[1]).toBe('/second/source.mp4')
    expect(jobSpec.sources[2]).toBe('/third/source.mxf')
  })
  
  test('7. Codec defaults based on delivery type (proxy)', () => {
    const proxyState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      deliveryType: 'proxy',
    }
    
    const jobSpec = buildJobSpec(proxyState)
    
    expect(jobSpec.codec).toBe('prores_proxy')
  })
  
  test('8. Codec defaults based on delivery type (delivery)', () => {
    const deliveryState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      deliveryType: 'delivery',
    }
    
    const jobSpec = buildJobSpec(deliveryState)
    
    expect(jobSpec.codec).toBe('prores_hq')
  })
  
  test('9. Resolution defaults based on delivery type (proxy)', () => {
    const proxyState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      deliveryType: 'proxy',
    }
    
    const jobSpec = buildJobSpec(proxyState)
    
    expect(jobSpec.resolution).toBe('half')
  })
  
  test('10. Resolution defaults based on delivery type (delivery)', () => {
    const deliveryState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      deliveryType: 'delivery',
    }
    
    const jobSpec = buildJobSpec(deliveryState)
    
    expect(jobSpec.resolution).toBe('same')
  })
  
  test('11. Missing sources throws JobSpecBuildError', () => {
    const invalidState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      sources: [],
    }
    
    expect(() => buildJobSpec(invalidState)).toThrow(JobSpecBuildError)
    expect(() => buildJobSpec(invalidState)).toThrow(/sources/)
  })
  
  test('12. Missing outputPath throws JobSpecBuildError', () => {
    const invalidState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      outputPath: '',
    }
    
    expect(() => buildJobSpec(invalidState)).toThrow(JobSpecBuildError)
    expect(() => buildJobSpec(invalidState)).toThrow(/outputPath/)
  })
  
  test('13. Missing containerFormat throws JobSpecBuildError', () => {
    const invalidState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      containerFormat: '',
    }
    
    expect(() => buildJobSpec(invalidState)).toThrow(JobSpecBuildError)
    expect(() => buildJobSpec(invalidState)).toThrow(/containerFormat/)
  })
  
  test('14. Missing filenameTemplate throws JobSpecBuildError', () => {
    const invalidState: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      filenameTemplate: '',
    }
    
    expect(() => buildJobSpec(invalidState)).toThrow(JobSpecBuildError)
    expect(() => buildJobSpec(invalidState)).toThrow(/filenameTemplate/)
  })
  
  test('15. JobSpec structure matches backend contract', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // Expected keys from backend contract
    const expectedKeys = [
      'jobspec_version',
      'job_id',
      'sources',
      'output_directory',
      'codec',
      'container',
      'resolution',
      'fps_mode',
      'fps_explicit',
      'resolve_preset',
      'proxy_profile',
      'requires_resolve_edition',
      'naming_template',
      'resolved_tokens',
      'created_at',
      'lut_id',
      'lut_applied',
      'lut_engine',
    ]
    
    const actualKeys = Object.keys(jobSpec)
    
    // Check all expected keys are present
    expectedKeys.forEach(key => {
      expect(actualKeys).toContain(key)
    })
    
    // Check no extra keys
    expect(actualKeys.sort()).toEqual(expectedKeys.sort())
  })
  
  test('16. Deterministic output (same structure for same inputs)', () => {
    const jobSpec1 = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // Small delay to ensure different timestamps
    const start = Date.now()
    while (Date.now() - start < 2) {
      // busy wait for 2ms
    }
    
    const jobSpec2 = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // job_id and created_at will differ, but structure should be identical
    expect(jobSpec1.sources).toEqual(jobSpec2.sources)
    expect(jobSpec1.output_directory).toBe(jobSpec2.output_directory)
    expect(jobSpec1.codec).toBe(jobSpec2.codec)
    expect(jobSpec1.container).toBe(jobSpec2.container)
    expect(jobSpec1.resolution).toBe(jobSpec2.resolution)
    expect(jobSpec1.fps_mode).toBe(jobSpec2.fps_mode)
    expect(jobSpec1.naming_template).toBe(jobSpec2.naming_template)
    
    // IDs should differ
    expect(jobSpec1.job_id).not.toBe(jobSpec2.job_id)
    
    // Timestamps should differ (or be very close if same millisecond)
    // This is more of a sanity check - same millisecond is acceptable
  })
  
  test('17. Codec override works', () => {
    const stateWithOverride: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      codec: 'h264',
    }
    
    const jobSpec = buildJobSpec(stateWithOverride)
    
    expect(jobSpec.codec).toBe('h264')
  })
  
  test('18. Resolution override works', () => {
    const stateWithOverride: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      resolution: '1920x1080',
    }
    
    const jobSpec = buildJobSpec(stateWithOverride)
    
    expect(jobSpec.resolution).toBe('1920x1080')
  })
  
  test('19. Frame rate mode explicit works', () => {
    const stateWithExplicitFps: OutputState = {
      ...MINIMAL_OUTPUT_STATE,
      fpsMode: 'explicit',
      fpsExplicit: 24,
    }
    
    const jobSpec = buildJobSpec(stateWithExplicitFps)
    
    expect(jobSpec.fps_mode).toBe('explicit')
    expect(jobSpec.fps_explicit).toBe(24)
  })
  
  test('20. jobSpecToJson produces valid JSON', () => {
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    const json = jobSpecToJson(jobSpec)
    
    // Should be valid JSON
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(jobSpec)
    
    // Should be formatted with indentation
    expect(json).toContain('\n')
    expect(json).toContain('  ')
  })
  
  test('21. JobSpec structure validation', () => {
    // Mock deterministic values for snapshot testing
    const jobSpec = buildJobSpec(MINIMAL_OUTPUT_STATE)
    
    // Replace non-deterministic values
    jobSpec.job_id = 'MOCK_ID'
    jobSpec.created_at = 'MOCK_TIMESTAMP'
    
    // Validate structure
    const expected = {
      jobspec_version: '2.1',
      job_id: 'MOCK_ID',
      sources: ['/path/to/source.mov'],
      output_directory: '/path/to/output',
      codec: 'prores_proxy',
      container: 'mov',
      resolution: 'half',
      fps_mode: 'same-as-source',
      fps_explicit: null,
      resolve_preset: null,
      proxy_profile: null,
      requires_resolve_edition: 'either',
      naming_template: '{source_name}_proxy',
      resolved_tokens: {},
      created_at: 'MOCK_TIMESTAMP',
      lut_id: null,
      lut_applied: false,
      lut_engine: null,
    }
    
    expect(jobSpec).toEqual(expected)
  })
})
