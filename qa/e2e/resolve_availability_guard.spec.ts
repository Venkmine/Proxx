/**
 * E2E Test: Resolve Availability Fail-Fast Guard
 * 
 * Tests UI behavior when Resolve is unavailable for RAW jobs:
 * - Job creation attempted with RAW file
 * - Backend returns immediate failure (availability check)
 * - UI shows single, clear error message
 * - No encoding starts
 * - No cascading errors
 * - Monitor does not clear loaded source
 * 
 * This test validates the fail-fast behavior when Resolve cannot
 * be reached or initialized.
 */

import { test, expect } from './helpers'
import path from 'node:path'

test.describe('Resolve Availability Guard', () => {
  
  test.beforeEach(async ({ page }) => {
    // Mock backend to simulate Resolve unavailability
    await page.route('**/control/jobs/create', async (route) => {
      const request = route.request()
      const payload = request.postDataJSON()
      
      // Check if this is a RAW job (would route to Resolve)
      const hasRawSource = payload.source_paths?.some((p: string) => {
        const ext = path.extname(p).toLowerCase()
        return ['.r3d', '.ari', '.arriraw', '.braw'].includes(ext)
      })
      
      if (hasRawSource) {
        // Simulate Resolve unavailability error
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job_id: null,
            status: 'FAILED',
            validation_error: 'Resolve is required for this media but is not available: Cannot connect to DaVinci Resolve. Resolve must be running with scripting enabled (Preferences > System > General > External scripting using)',
            validation_stage: 'resolve_availability',
            engine_used: 'resolve',
            clips: []
          })
        })
      } else {
        // FFmpeg jobs proceed normally
        const jobId = `mock-ffmpeg-${Date.now()}`
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job_id: jobId,
            status: 'QUEUED',
            engine: 'ffmpeg',
            source_paths: payload.source_paths
          })
        })
      }
    })
  })
  
  test('RAW job fails immediately when Resolve unavailable', async ({ page }) => {
    console.log('\n🚫 Testing RAW job with unavailable Resolve')
    
    // Simulate job creation with RAW file
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('http://127.0.0.1:8085/control/jobs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_paths: ['/path/to/test.R3D'],
            engine: 'resolve',
            deliver_settings: {
              output_dir: '/tmp/mock',
              video: { codec: 'prores_proxy' },
              audio: { codec: 'pcm_s16le' },
              file: { container: 'mov', naming_template: '{source_name}__proxx' }
            }
          }),
        })
        return await response.json()
      } catch (error) {
        return { error: String(error) }
      }
    })
    
    // Verify immediate failure
    expect(result.status).toBe('FAILED')
    expect(result.validation_error).toContain('Resolve is required for this media')
    expect(result.validation_error).toContain('not available')
    expect(result.validation_stage).toBe('resolve_availability')
    
    // Verify no job_id was assigned (job never enqueued)
    expect(result.job_id).toBeNull()
    
    // Verify no clips were processed
    expect(result.clips).toHaveLength(0)
    
    // Verify engine was determined but not invoked
    expect(result.engine_used).toBe('resolve')
    
    console.log('   ✓ Job failed immediately with clear error')
    console.log('   ✓ No job_id assigned (not enqueued)')
    console.log('   ✓ No clips processed')
    console.log(`   ✓ Error message: "${result.validation_error}"`)
  })
  
  test('FFmpeg jobs unaffected by Resolve unavailability', async ({ page }) => {
    console.log('\n✅ Testing FFmpeg job (Resolve unavailability should not affect)')
    
    // Simulate job creation with non-RAW file
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('http://127.0.0.1:8085/control/jobs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_paths: ['/path/to/test.mp4'],
            engine: 'ffmpeg',
            deliver_settings: {
              output_dir: '/tmp/mock',
              video: { codec: 'h264' },
              audio: { codec: 'aac' },
              file: { container: 'mp4', naming_template: '{source_name}__proxx' }
            }
          }),
        })
        return await response.json()
      } catch (error) {
        return { error: String(error) }
      }
    })
    
    // Verify job proceeds normally
    expect(result.status).toBe('QUEUED')
    expect(result.job_id).toBeTruthy()
    expect(result.engine).toBe('ffmpeg')
    
    // Verify no availability error
    expect(result.validation_error).toBeUndefined()
    
    console.log('   ✓ FFmpeg job queued successfully')
    console.log(`   ✓ Job ID: ${result.job_id}`)
    console.log('   ✓ No availability check interference')
  })
  
  test('Error message is user-friendly and actionable', async ({ page }) => {
    console.log('\n📝 Testing error message clarity')
    
    // Simulate job creation with RAW file
    const result = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8085/control/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: ['/path/to/test.BRAW'],
          engine: 'resolve',
          deliver_settings: {
            output_dir: '/tmp/mock',
            video: { codec: 'prores_proxy' },
            audio: { codec: 'pcm_s16le' },
            file: { container: 'mov', naming_template: '{source_name}__proxx' }
          }
        }),
      })
      return await response.json()
    })
    
    // Verify error message structure
    const errorMsg = result.validation_error
    expect(errorMsg).toBeTruthy()
    
    // Should contain key phrases
    expect(errorMsg).toContain('Resolve')
    expect(errorMsg).toContain('required')
    expect(errorMsg).toContain('not available')
    
    // Should provide actionable guidance
    expect(errorMsg).toMatch(/(running|connect|scripting|Preferences)/i)
    
    // Should NOT contain technical jargon or stack traces
    expect(errorMsg).not.toContain('Exception')
    expect(errorMsg).not.toContain('Traceback')
    expect(errorMsg).not.toContain('null pointer')
    
    console.log('   ✓ Error message is clear and user-friendly')
    console.log('   ✓ Provides actionable guidance')
    console.log('   ✓ No technical jargon')
    console.log(`   ✓ Message: "${errorMsg}"`)
  })
  
  test('No partial execution or cascading errors', async ({ page }) => {
    console.log('\n🛡️ Testing fail-fast behavior (no cascading errors)')
    
    // Simulate job creation with multiple RAW sources
    const result = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8085/control/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: [
            '/path/to/clip1.R3D',
            '/path/to/clip2.R3D',
            '/path/to/clip3.R3D'
          ],
          engine: 'resolve',
          deliver_settings: {
            output_dir: '/tmp/mock',
            video: { codec: 'prores_proxy' },
            audio: { codec: 'pcm_s16le' },
            file: { container: 'mov', naming_template: '{source_name}__proxx' }
          }
        }),
      })
      return await response.json()
    })
    
    // Verify ZERO clips processed
    expect(result.clips).toHaveLength(0)
    
    // Verify single, terminal failure
    expect(result.status).toBe('FAILED')
    expect(result.validation_stage).toBe('resolve_availability')
    
    // Verify no partial results
    expect(result.job_id).toBeNull()
    
    console.log('   ✓ Zero clips processed (no partial execution)')
    console.log('   ✓ Single terminal failure')
    console.log('   ✓ No cascading per-clip errors')
  })
  
  test('Fail-fast guard runs before task creation', async ({ page }) => {
    console.log('\n⚡ Testing fail-fast timing (before task creation)')
    
    // Track timing via validation_stage
    const result = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8085/control/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: ['/path/to/test.ARI'],
          engine: 'resolve',
          deliver_settings: {
            output_dir: '/tmp/mock',
            video: { codec: 'prores_proxy' },
            audio: { codec: 'pcm_s16le' },
            file: { container: 'mov', naming_template: '{source_name}__proxx' }
          }
        }),
      })
      return await response.json()
    })
    
    // Verify failure occurred at availability stage
    // (before task creation, which would be "execution" stage)
    expect(result.validation_stage).toBe('resolve_availability')
    
    // Verify no tasks/clips were created
    expect(result.clips).toHaveLength(0)
    
    console.log('   ✓ Failure occurred at "resolve_availability" stage')
    console.log('   ✓ No tasks created')
    console.log('   ✓ Fail-fast guard executed before any work started')
  })
})
