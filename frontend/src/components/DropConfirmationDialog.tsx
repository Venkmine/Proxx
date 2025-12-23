import React from 'react';

interface DropConfirmationDialogProps {
  isOpen: boolean;
  paths: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const DropConfirmationDialog: React.FC<DropConfirmationDialogProps> = ({
  isOpen,
  paths,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>
          Confirm File Drop
        </h2>
        
        <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
          You are about to ingest the following {paths.length === 1 ? 'item' : `${paths.length} items`}:
        </p>
        
        <div
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '24px',
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          {paths.map((path, index) => (
            <div
              key={index}
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                padding: '4px 0',
                wordBreak: 'break-all',
              }}
            >
              {path}
            </div>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#4a9eff',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Confirm & Ingest
          </button>
        </div>
      </div>
    </div>
  );
};
