import React, { useState, useCallback } from 'react';

interface ExplicitDropZoneProps {
  onFilesDropped: (paths: string[]) => void;
  disabled?: boolean;
}

export const ExplicitDropZone: React.FC<ExplicitDropZoneProps> = ({
  onFilesDropped,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) {
      return;
    }

    const paths: string[] = [];
    
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && (file as any).path) {
            paths.push((file as any).path);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if ((file as any).path) {
          paths.push((file as any).path);
        }
      }
    }

    if (paths.length > 0) {
      onFilesDropped(paths);
    }
  }, [disabled, onFilesDropped]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: isDragging ? '2px dashed #4a9eff' : '2px dashed #ccc',
        borderRadius: '8px',
        padding: '32px',
        textAlign: 'center',
        backgroundColor: isDragging ? 'rgba(74, 158, 255, 0.1)' : 'transparent',
        transition: 'all 0.2s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: '14px', color: disabled ? '#999' : '#666' }}>
        {disabled ? (
          'Drop zone disabled'
        ) : (
          <>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>
              Drop files or folders here
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Supported formats: Images and Videos
            </div>
          </>
        )}
      </div>
    </div>
  );
};
