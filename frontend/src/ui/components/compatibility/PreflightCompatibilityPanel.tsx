/**
 * Pre-flight Compatibility Panel
 * 
 * Displays detected Resolve version + edition and RAW format compatibility.
 * Shows which formats will RUN, SKIP, or BLOCK with human-readable reasons.
 * 
 * CONSTRAINTS:
 * - Read-only display
 * - No execution logic
 * - No environment mutation
 * - Data from existing backend metadata only
 * - Renders BEFORE job execution
 */

import type { PreflightCompatibilityPanelProps, FormatCompatibilityStatus } from "./PreflightCompatibilityPanel.types";
import "./PreflightCompatibilityPanel.css";

/**
 * Determine compatibility status based on format and Resolve metadata.
 * This is UI logic only - no backend execution decisions.
 */
function getFormatStatus(
  format: string,
  resolveEdition: string | null,
  resolveVersion: string | null
): FormatCompatibilityStatus {
  // If no Resolve detected, all RAW formats are blocked
  if (!resolveEdition || !resolveVersion) {
    return {
      status: "BLOCK",
      reason: "DaVinci Resolve is not installed on this system."
    };
  }

  // ARRIRAW requires Studio 20.3.1+
  if (format.toLowerCase().includes("arriraw") || format.toLowerCase().includes("arri_raw")) {
    const isFree = resolveEdition === "free";
    const versionParts = resolveVersion.split(".").map(Number);
    const major = versionParts[0] || 0;
    const minor = versionParts[1] || 0;
    const patch = versionParts[2] || 0;

    if (isFree) {
      return {
        status: "SKIP",
        reason: "ARRIRAW requires DaVinci Resolve Studio. Free edition detected."
      };
    }

    // Check version 20.3.1+
    if (major < 20 || (major === 20 && minor < 3) || (major === 20 && minor === 3 && patch < 1)) {
      return {
        status: "SKIP",
        reason: `ARRIRAW requires Resolve Studio 20.3.1 or later. Detected version: ${resolveVersion}`
      };
    }

    return {
      status: "RUN",
      reason: `ARRIRAW will be processed by Resolve Studio ${resolveVersion}.`
    };
  }

  // Other RAW formats work with any Resolve edition
  return {
    status: "RUN",
    reason: `This format will be processed by DaVinci Resolve ${resolveEdition} ${resolveVersion}.`
  };
}

/**
 * Group formats by codec for cleaner display.
 */
function groupFormatsByCodec(sourceExtensions: string[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  
  sourceExtensions.forEach(ext => {
    const normalized = ext.toLowerCase().replace(".", "");
    grouped[normalized] = (grouped[normalized] || 0) + 1;
  });

  return grouped;
}

/**
 * Pre-flight Compatibility Panel component.
 */
export function PreflightCompatibilityPanel({
  resolveEdition,
  resolveVersion,
  sourceExtensions,
  engineUsed,
  className = ""
}: PreflightCompatibilityPanelProps) {
  // Only show panel if engine is Resolve (RAW formats present)
  if (engineUsed !== "resolve") {
    return null;
  }

  // Group formats
  const formatGroups = groupFormatsByCodec(sourceExtensions);
  const formatEntries = Object.entries(formatGroups);

  return (
    <div className={`preflight-compatibility-panel ${className}`}>
      <h3 className="preflight-compatibility-panel__title">
        Pre-flight Compatibility Check
      </h3>

      <section className="preflight-compatibility-panel__section">
        <h4 className="preflight-compatibility-panel__subtitle">Detected Environment</h4>
        <dl className="preflight-compatibility-panel__info">
          <dt>DaVinci Resolve Edition</dt>
          <dd className={resolveEdition ? "" : "preflight-compatibility-panel__missing"}>
            {resolveEdition || "(not detected)"}
          </dd>

          <dt>DaVinci Resolve Version</dt>
          <dd className={resolveVersion ? "" : "preflight-compatibility-panel__missing"}>
            {resolveVersion || "(not detected)"}
          </dd>
        </dl>
      </section>

      <section className="preflight-compatibility-panel__section">
        <h4 className="preflight-compatibility-panel__subtitle">
          RAW Format Summary ({formatEntries.length} format{formatEntries.length !== 1 ? 's' : ''})
        </h4>
        <div className="preflight-compatibility-panel__formats">
          {formatEntries.map(([format, count]) => {
            const status = getFormatStatus(format, resolveEdition, resolveVersion);
            return (
              <div
                key={format}
                className={`preflight-compatibility-panel__format preflight-compatibility-panel__format--${status.status.toLowerCase()}`}
              >
                <div className="preflight-compatibility-panel__format-header">
                  <span className="preflight-compatibility-panel__format-name">
                    {format.toUpperCase()}
                  </span>
                  <span className="preflight-compatibility-panel__format-count">
                    {count} file{count !== 1 ? 's' : ''}
                  </span>
                  <span className={`preflight-compatibility-panel__status-badge preflight-compatibility-panel__status-badge--${status.status.toLowerCase()}`}>
                    {status.status}
                  </span>
                </div>
                <p className="preflight-compatibility-panel__format-reason">
                  {status.reason}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="preflight-compatibility-panel__section">
        <h4 className="preflight-compatibility-panel__subtitle">What This Means</h4>
        <ul className="preflight-compatibility-panel__legend">
          <li>
            <span className="preflight-compatibility-panel__legend-badge preflight-compatibility-panel__legend-badge--run">
              RUN
            </span>
            Format will be processed successfully
          </li>
          <li>
            <span className="preflight-compatibility-panel__legend-badge preflight-compatibility-panel__legend-badge--skip">
              SKIP
            </span>
            Format will be skipped due to environment constraints
          </li>
          <li>
            <span className="preflight-compatibility-panel__legend-badge preflight-compatibility-panel__legend-badge--block">
              BLOCK
            </span>
            Job cannot proceed without required software
          </li>
        </ul>
      </section>
    </div>
  );
}

export default PreflightCompatibilityPanel;
