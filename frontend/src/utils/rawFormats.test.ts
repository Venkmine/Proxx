/**
 * Unit Tests: RAW Format Definitions
 * 
 * Tests the RAW format identification utilities.
 * 
 * Run with: npm test -- rawFormats.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  RAW_EXTENSIONS,
  isRawExtension,
  looksLikeRawFile,
  AMBIGUOUS_CONTAINERS,
  isAmbiguousContainer,
} from './rawFormats'

describe('rawFormats', () => {
  // =========================================================================
  // RAW_EXTENSIONS constant
  // =========================================================================
  
  describe('RAW_EXTENSIONS', () => {
    it('should be a readonly array', () => {
      expect(Array.isArray(RAW_EXTENSIONS)).toBe(true)
      expect(RAW_EXTENSIONS.length).toBeGreaterThan(0)
    })
    
    it('should contain known RAW formats', () => {
      expect(RAW_EXTENSIONS).toContain('r3d')
      expect(RAW_EXTENSIONS).toContain('braw')
      expect(RAW_EXTENSIONS).toContain('ari')
      expect(RAW_EXTENSIONS).toContain('arx')
    })
  })
  
  // =========================================================================
  // isRawExtension()
  // =========================================================================
  
  describe('isRawExtension', () => {
    it('should identify RED R3D as RAW', () => {
      expect(isRawExtension('r3d')).toBe(true)
      expect(isRawExtension('.r3d')).toBe(true)
      expect(isRawExtension('R3D')).toBe(true)
      expect(isRawExtension('.R3D')).toBe(true)
    })
    
    it('should identify Blackmagic BRAW as RAW', () => {
      expect(isRawExtension('braw')).toBe(true)
      expect(isRawExtension('.braw')).toBe(true)
      expect(isRawExtension('BRAW')).toBe(true)
    })
    
    it('should identify ARRI formats as RAW', () => {
      expect(isRawExtension('ari')).toBe(true)
      expect(isRawExtension('arx')).toBe(true)
    })
    
    it('should NOT identify MP4 as RAW', () => {
      expect(isRawExtension('mp4')).toBe(false)
      expect(isRawExtension('.mp4')).toBe(false)
      expect(isRawExtension('MP4')).toBe(false)
    })
    
    it('should NOT identify MOV as RAW (ambiguous)', () => {
      expect(isRawExtension('mov')).toBe(false)
      expect(isRawExtension('.mov')).toBe(false)
    })
    
    it('should handle empty string', () => {
      expect(isRawExtension('')).toBe(false)
    })
  })
  
  // =========================================================================
  // looksLikeRawFile()
  // =========================================================================
  
  describe('looksLikeRawFile', () => {
    it('should identify RAW files by path', () => {
      expect(looksLikeRawFile('clip.r3d')).toBe(true)
      expect(looksLikeRawFile('footage.braw')).toBe(true)
      expect(looksLikeRawFile('scene.ari')).toBe(true)
    })
    
    it('should identify RAW files in full paths', () => {
      expect(looksLikeRawFile('/Media/Project/Day1/A001.r3d')).toBe(true)
      expect(looksLikeRawFile('/path/to/footage.braw')).toBe(true)
    })
    
    it('should be case insensitive', () => {
      expect(looksLikeRawFile('CLIP.R3D')).toBe(true)
      expect(looksLikeRawFile('footage.BRAW')).toBe(true)
    })
    
    it('should NOT identify standard formats as RAW', () => {
      expect(looksLikeRawFile('clip.mp4')).toBe(false)
      expect(looksLikeRawFile('video.avi')).toBe(false)
      expect(looksLikeRawFile('file.mkv')).toBe(false)
    })
    
    it('should handle paths with no extension', () => {
      expect(looksLikeRawFile('filename')).toBe(false)
      expect(looksLikeRawFile('/path/to/file')).toBe(false)
    })
    
    it('should handle dots in directory names', () => {
      expect(looksLikeRawFile('/Project.2024/Footage.RAW/clip.r3d')).toBe(true)
      expect(looksLikeRawFile('/Project.2024/Standard/clip.mp4')).toBe(false)
    })
  })
  
  // =========================================================================
  // AMBIGUOUS_CONTAINERS constant
  // =========================================================================
  
  describe('AMBIGUOUS_CONTAINERS', () => {
    it('should be a readonly array', () => {
      expect(Array.isArray(AMBIGUOUS_CONTAINERS)).toBe(true)
      expect(AMBIGUOUS_CONTAINERS.length).toBeGreaterThan(0)
    })
    
    it('should contain MOV and MXF', () => {
      expect(AMBIGUOUS_CONTAINERS).toContain('mov')
      expect(AMBIGUOUS_CONTAINERS).toContain('mxf')
    })
  })
  
  // =========================================================================
  // isAmbiguousContainer()
  // =========================================================================
  
  describe('isAmbiguousContainer', () => {
    it('should identify MOV as ambiguous', () => {
      expect(isAmbiguousContainer('mov')).toBe(true)
      expect(isAmbiguousContainer('.mov')).toBe(true)
      expect(isAmbiguousContainer('MOV')).toBe(true)
    })
    
    it('should identify MXF as ambiguous', () => {
      expect(isAmbiguousContainer('mxf')).toBe(true)
      expect(isAmbiguousContainer('.mxf')).toBe(true)
      expect(isAmbiguousContainer('MXF')).toBe(true)
    })
    
    it('should NOT identify unambiguous formats', () => {
      expect(isAmbiguousContainer('mp4')).toBe(false)
      expect(isAmbiguousContainer('r3d')).toBe(false)
      expect(isAmbiguousContainer('braw')).toBe(false)
    })
    
    it('should handle empty string', () => {
      expect(isAmbiguousContainer('')).toBe(false)
    })
  })
})
