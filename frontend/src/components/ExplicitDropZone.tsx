import React, { useState, useCallback } from 'react';

/**
 * ExplicitDropZone — DEPRECATED (not used in UI)
 * 
 * @deprecated Drag & drop completely removed from UI for honesty.
 * Use explicit "Select Files" and "Select Folder" buttons instead.
 * 
 * This component is kept for reference but is disabled via feature flag.
 */

// ============================================================================
// FILE EXTENSIONS
// ============================================================================

// Supported video file extensions
const VIDEO_EXTENSIONS = new Set([
  '.mov', '.mp4', '.mxf', '.avi', '.mkv', '.webm', '.m4v', '.mpg', '.mpeg',
  '.wmv', '.flv', '.3gp', '.ts', '.m2ts', '.vob', '.ogv', '.dv', '.r3d',
  '.braw', '.ari', '.arri', '.cine', '.dpx', '.exr', '.cin'
]);

// Supported image sequence extensions
const IMAGE_EXTENSIONS = new Set([
  '.dpx', '.exr', '.tif', '.tiff', '.png', '.jpg', '.jpeg', '.tga',
  '.cin', '.ari', '.arri', '.bmp', '.psd', '.raw', '.cr2', '.nef'
]);

// Supported audio extensions (for accompanying audio detection)
const AUDIO_EXTENSIONS = new Set([
  '.wav', '.aif', '.aiff', '.mp3', '.aac', '.m4a', '.flac', '.ogg'
]);

function isSupportedMediaFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext);
}

// ============================================================================
// WEBKITENTRY TYPES (for recursive folder walking)
// ============================================================================

interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file: (successCallback: (file: File) => void, errorCallback?: (error: Error) => void) => void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader: () => FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries: (
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ) => void;
}

// ============================================================================
// RECURSIVE FOLDER WALKER
// ============================================================================

/**
 * Recursively reads all files from a FileSystemDirectoryEntry.
 * Returns an array of File objects.
 */
async function readDirectoryRecursive(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = [];
  const reader = entry.createReader();
  
  // readEntries may return results in chunks, so we need to call it repeatedly
  const readAllEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      const allEntries: FileSystemEntry[] = [];
      
      const readBatch = () => {
        reader.readEntries(
          (entries) => {
            if (entries.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          },
          reject
        );
      };
      
      readBatch();
    });
  };
  
  const entries = await readAllEntries();
  
  for (const childEntry of entries) {
    if (childEntry.isFile) {
      const fileEntry = childEntry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      files.push(file);
    } else if (childEntry.isDirectory) {
      const subFiles = await readDirectoryRecursive(childEntry as FileSystemDirectoryEntry);
      files.push(...subFiles);
    }
  }
  
  return files;
}

/**
 * Gets file path from File object (Electron) or builds path from entry (Web)
 */
function getFilePath(file: File, basePath?: string): string | null {
  // Electron provides .path property
  if ((file as any).path) {
    return (file as any).path;
  }
  // In web context, we can construct path from webkitRelativePath or basePath
  if ((file as any).webkitRelativePath) {
    return `${basePath || ''}/${(file as any).webkitRelativePath}`;
  }
  return null;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ExplicitDropZoneProps {
  onFilesDropped: (paths: string[]) => void;
  disabled?: boolean;
}

export const ExplicitDropZone: React.FC<ExplicitDropZoneProps> = ({
  onFilesDropped,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  }, [disabled, isProcessing]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Dev logging: confirm drop handler execution
    console.log('[ExplicitDropZone] Drop event triggered');
    console.log('[ExplicitDropZone] Items:', e.dataTransfer.items?.length || 0);
    console.log('[ExplicitDropZone] Files:', e.dataTransfer.files?.length || 0);

    if (disabled || isProcessing) {
      console.log('[ExplicitDropZone] Skipping: disabled=', disabled, 'isProcessing=', isProcessing);
      return;
    }

    setIsProcessing(true);
    const paths: string[] = [];
    
    try {
      // Check if webkitGetAsEntry is available (Chrome/Edge/Safari)
      const items = e.dataTransfer.items;
      const hasWebkitEntry = items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function';
      
      console.log('[ExplicitDropZone] hasWebkitEntry:', hasWebkitEntry);
      
      if (hasWebkitEntry) {
        // Use webkitGetAsEntry for folder support
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
            console.log('[ExplicitDropZone] Entry:', entry.name, entry.isDirectory ? '(directory)' : '(file)');
          }
        }
        
        for (const entry of entries) {
          if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((resolve, reject) => {
              fileEntry.file(resolve, reject);
            });
            
            // Get path from Electron's file.path or skip in web context
            const path = (file as any).path;
            console.log('[ExplicitDropZone] File path:', path, 'name:', file.name);
            if (path && isSupportedMediaFile(file.name)) {
              paths.push(path);
            }
          } else if (entry.isDirectory) {
            // Recursively walk the directory
            console.log('[ExplicitDropZone] Walking directory:', entry.name);
            const dirEntry = entry as FileSystemDirectoryEntry;
            const files = await readDirectoryRecursive(dirEntry);
            console.log('[ExplicitDropZone] Found', files.length, 'files in directory');
            
            for (const file of files) {
              const path = (file as any).path;
              if (path && isSupportedMediaFile(file.name)) {
                paths.push(path);
              }
            }
          }
        }
      } else {
        // Fallback: Use dataTransfer.files (no folder support in this path)
        if (e.dataTransfer.items) {
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file && (file as any).path && isSupportedMediaFile(file.name)) {
                paths.push((file as any).path);
              }
            }
          }
        } else if (e.dataTransfer.files) {
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];
            if ((file as any).path && isSupportedMediaFile(file.name)) {
              paths.push((file as any).path);
            }
          }
        }
      }
      
      // Deduplicate and sort paths
      const uniquePaths = [...new Set(paths)].sort();
      
      console.log('[ExplicitDropZone] Collected paths:', uniquePaths.length);
      uniquePaths.forEach(p => console.log('[ExplicitDropZone] Path:', p));
      
      if (uniquePaths.length > 0) {
        console.log('[ExplicitDropZone] Calling onFilesDropped with', uniquePaths.length, 'paths');
        onFilesDropped(uniquePaths);
      } else {
        console.log('[ExplicitDropZone] No valid paths found');
      }
    } catch (error) {
      console.error('[ExplicitDropZone] Error processing dropped files:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [disabled, isProcessing, onFilesDropped]);

  return (
    <div
      data-testid="explicit-drop-zone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: isDragging ? '2px dashed var(--button-primary-bg)' : '2px dashed var(--border-primary)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '1.5rem 1rem',
        textAlign: 'center',
        backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'rgba(51, 65, 85, 0.1)',
        transition: 'all 0.2s ease',
        cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        // Ensure drop zone receives pointer events
        pointerEvents: disabled ? 'none' : 'auto',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ fontSize: '0.8125rem', color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)' }}>
        {isProcessing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
            <span>Processing files...</span>
          </div>
        ) : disabled ? (
          'Drop zone disabled'
        ) : (
          <>
            <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              📁 Drop files or folders here
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              Videos, images, and image sequences
            </div>
          </>
        )}
      </div>
    </div>
  );
};
