/**
 * OutputTab — Controlled Component (State Lifted to Parent)
 * 
 * ⚠️ FULLY CONTROLLED — NO LOCAL STATE, NO VALIDATION, NO SIDE EFFECTS
 * 
 * All state managed by parent (MediaWorkspace).
 * Props drive UI, callbacks notify parent of changes.
 * 
 * INTERACTION SCOPE:
 * - ✓ Click output directory button (callback only)
 * - ✓ Type into filename input (controlled via props)
 * - ✓ Toggle delivery options (controlled via props)
 * - ❌ NO validation
 * - ❌ NO backend calls
 * - ❌ NO filesystem operations
 * - ❌ NO auto-folder creation
 * - ❌ NO filename templating
 * 
 * LAYOUT INVARIANTS (enforced by INTENT_010 + INTENT_050):
 * - No horizontal scrollbars at 1440×900
 * - No clipped buttons
 * - All three columns visible without scrolling
 * - Preview row always visible
 * 
 * STRUCTURE:
 * ┌────────────────────────────────────────────┐
 * │ OUTPUT                                     │
 * ├────────────────────────────────────────────┤
 * │                                            │
 * │ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
 * │ │ Destination│ │ File Identity│ │ Delivery │ │
 * │ └────────────┘ └────────────┘ └──────────┘ │
 * │                                            │
 * │ ────────────────────────────────────────── │
 * │                                            │
 * │ Filename Preview                            │
 * │                                            │
 * └────────────────────────────────────────────┘
 */

export interface OutputTabProps {
  /** Current output path value (controlled) */
  outputPath: string
  /** Output path change handler */
  onOutputPathChange: (path: string) => void
  /** Container format value (controlled) */
  containerFormat: string
  /** Container format change handler */
  onContainerFormatChange: (format: string) => void
  /** Filename template value (controlled) */
  filenameTemplate: string
  /** Filename template change handler */
  onFilenameTemplateChange: (template: string) => void
  /** Delivery type value (controlled) */
  deliveryType: 'proxy' | 'delivery'
  /** Delivery type change handler */
  onDeliveryTypeChange: (type: 'proxy' | 'delivery') => void
  /** Browse button click handler */
  onBrowseClick: () => void
  /** Active preset name (display only) */
  presetName?: string
  /** Compatibility warning message (display only) */
  compatWarning?: string
}

export function OutputTab({
  outputPath,
  onOutputPathChange,
  containerFormat,
  onContainerFormatChange,
  filenameTemplate,
  onFilenameTemplateChange,
  deliveryType,
  onDeliveryTypeChange,
  onBrowseClick,
  presetName = 'No preset selected',
  compatWarning,
}: OutputTabProps) {
  // Fully controlled component - all state managed by parent
  return (
    <div
      data-testid="output-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'rgba(20, 24, 32, 0.6)',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          Output
        </h2>
      </div>

      {/* Three Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '1rem',
          padding: '1rem',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        {/* Column 1: Destination */}
        <section data-testid="output-destination">
          <h3
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Destination
          </h3>

          <button
            data-testid="output-browse-button"
            onClick={onBrowseClick}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background 0.15s',
              marginBottom: '0.5rem',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
            }}
          >
            Select Output Folder
          </button>

          <input
            data-testid="output-path-input"
            type="text"
            value={outputPath}
            onChange={(e) => onOutputPathChange(e.target.value)}
            placeholder="/path/to/output"
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '0.6875rem',
              color: 'var(--text-primary)',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              marginBottom: '0.5rem',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-primary)'
            }}
          />

          <div data-testid="output-path-status">
            {/* Placeholder for validation state */}
          </div>
        </section>

        {/* Column 2: File Identity */}
        <section data-testid="output-identity">
          <h3
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            File
          </h3>

          <div
            data-testid="output-container-select"
            style={{
              marginBottom: '0.75rem',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}
            >
              Container
            </label>
            <select
              value={containerFormat}
              onChange={(e) => onContainerFormatChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--text-primary)',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)'
              }}
            >
              <option value="mov">MOV</option>
              <option value="mp4">MP4</option>
              <option value="mxf">MXF</option>
            </select>
          </div>

          <div data-testid="output-filename-template">
            <label
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}
            >
              Filename Template
            </label>
            <input
              type="text"
              value={filenameTemplate}
              onChange={(e) => onFilenameTemplateChange(e.target.value)}
              placeholder="{source_name}_proxy"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--text-primary)',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)'
              }}
            />
          </div>
        </section>

        {/* Column 3: Delivery Summary */}
        <section data-testid="output-delivery">
          <h3
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Delivery
          </h3>

          <div
            data-testid="output-type"
            style={{
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-dim)',
                marginBottom: '0.5rem',
              }}
            >
              Type
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="radio"
                  name="delivery-type"
                  value="proxy"
                  checked={deliveryType === 'proxy'}
                  onChange={(e) => onDeliveryTypeChange(e.target.value as 'proxy' | 'delivery')}
                  style={{ cursor: 'pointer' }}
                />
                Proxy
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="radio"
                  name="delivery-type"
                  value="delivery"
                  checked={deliveryType === 'delivery'}
                  onChange={(e) => onDeliveryTypeChange(e.target.value as 'proxy' | 'delivery')}
                  style={{ cursor: 'pointer' }}
                />
                Delivery
              </label>
            </div>
          </div>

          <div
            data-testid="output-preset-summary"
            style={{
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}
            >
              Preset
            </div>
            <div
              style={{
                padding: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
              }}
            >
              {presetName}
            </div>
          </div>

          <div data-testid="output-compat-warning">
            {compatWarning && (
              <div
                style={{
                  padding: '0.5rem',
                  fontSize: '0.6875rem',
                  color: 'var(--status-warning-fg)',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid var(--status-warning-fg)',
                  borderRadius: '4px',
                }}
              >
                {compatWarning}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Filename Preview Row (Full Width) */}
      <section
        data-testid="output-filename-preview"
        style={{
          padding: '1rem',
          background: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <h4
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Filename Preview
        </h4>

        <code
          data-testid="output-preview-text"
          style={{
            display: 'block',
            padding: '0.75rem',
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            wordBreak: 'break-all',
          }}
        >
          {/* Simple preview: template + container (NO real templating logic) */}
          {filenameTemplate}.{containerFormat}
        </code>
      </section>
    </div>
  )
}
