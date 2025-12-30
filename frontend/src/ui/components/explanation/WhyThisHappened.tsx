/**
 * Why This Happened Component
 * 
 * Explains job execution decisions in plain language.
 * Shows why engine was selected, why alternatives weren't used,
 * and why job failed or was skipped if applicable.
 * 
 * CONSTRAINTS:
 * - Read-only display
 * - No derived logic
 * - Uses existing backend fields only
 * - No execution imports
 */

import type { WhyThisHappenedProps } from "./WhyThisHappened.types";
import "./WhyThisHappened.css";

/**
 * Generate explanation for engine selection.
 */
function getEngineExplanation(
  engineUsed: string | null,
  sourceExtensions: string[]
): { selected: string; reason: string; alternatives: string[] } {
  if (engineUsed === "resolve") {
    const rawFormats = sourceExtensions
      .map(ext => ext.toUpperCase().replace(".", ""))
      .filter(ext => ["BRAW", "R3D", "ARI", "ARRIRAW"].includes(ext));

    return {
      selected: "DaVinci Resolve",
      reason: `Job contains camera RAW formats (${rawFormats.join(", ")}) which require proprietary decode. FFmpeg cannot process these formats.`,
      alternatives: [
        "FFmpeg — Not used because it cannot decode proprietary camera RAW formats",
      ]
    };
  }

  if (engineUsed === "ffmpeg") {
    return {
      selected: "FFmpeg",
      reason: "Job contains standard video codecs (H.264, ProRes, DNxHD, etc.) which FFmpeg can decode reliably.",
      alternatives: [
        "DaVinci Resolve — Not needed for standard codecs",
      ]
    };
  }

  return {
    selected: "(none)",
    reason: "Engine selection could not be determined from available metadata.",
    alternatives: []
  };
}

/**
 * Generate explanation for job failure or skip.
 */
function getFailureExplanation(
  finalStatus: string,
  validationError: string | null,
  resolveEdition: string | null,
  resolveVersion: string | null
): string | null {
  const status = finalStatus.toUpperCase();

  if (status === "FAILED" && validationError) {
    return validationError;
  }

  if (status === "SKIPPED") {
    if (!resolveEdition || !resolveVersion) {
      return "Job requires DaVinci Resolve but no installation was detected on this system.";
    }

    if (resolveEdition === "free") {
      return "Job contains ARRIRAW media which requires DaVinci Resolve Studio. Free edition was detected.";
    }

    // Check version requirements
    const versionParts = resolveVersion.split(".").map(Number);
    const major = versionParts[0] || 0;
    const minor = versionParts[1] || 0;
    const patch = versionParts[2] || 0;

    if (major < 20 || (major === 20 && minor < 3) || (major === 20 && minor === 3 && patch < 1)) {
      return `ARRIRAW requires DaVinci Resolve Studio 20.3.1 or later. Detected version: ${resolveVersion}`;
    }

    return "Job was skipped due to environment constraints.";
  }

  return null;
}

/**
 * Why This Happened component.
 */
export function WhyThisHappened({
  finalStatus,
  engineUsed,
  resolveEdition,
  resolveVersion,
  sourceExtensions,
  validationError,
  className = ""
}: WhyThisHappenedProps) {
  const engineExplanation = getEngineExplanation(engineUsed, sourceExtensions);
  const failureExplanation = getFailureExplanation(
    finalStatus,
    validationError,
    resolveEdition,
    resolveVersion
  );

  return (
    <div className={`why-this-happened ${className}`}>
      <h3 className="why-this-happened__title">Why This Happened</h3>

      <section className="why-this-happened__section">
        <h4 className="why-this-happened__subtitle">Engine Selection</h4>
        <div className="why-this-happened__explanation">
          <p>
            <strong>Selected Engine:</strong> {engineExplanation.selected}
          </p>
          <p className="why-this-happened__reason">
            {engineExplanation.reason}
          </p>
        </div>

        {engineExplanation.alternatives.length > 0 && (
          <div className="why-this-happened__alternatives">
            <p className="why-this-happened__alternatives-title">
              <strong>Why alternatives were not used:</strong>
            </p>
            <ul className="why-this-happened__alternatives-list">
              {engineExplanation.alternatives.map((alt, index) => (
                <li key={index}>{alt}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {failureExplanation && (
        <section className="why-this-happened__section why-this-happened__section--failure">
          <h4 className="why-this-happened__subtitle">
            {finalStatus.toUpperCase() === "FAILED" ? "Why Job Failed" : "Why Job Was Skipped"}
          </h4>
          <div className="why-this-happened__explanation">
            <p className="why-this-happened__reason">
              {failureExplanation}
            </p>
          </div>
        </section>
      )}

      <section className="why-this-happened__section why-this-happened__section--note">
        <p className="why-this-happened__note">
          <em>
            This information is read from execution metadata captured during job processing.
            No derivation or interpretation is performed by the UI.
          </em>
        </p>
      </section>
    </div>
  );
}

export default WhyThisHappened;
