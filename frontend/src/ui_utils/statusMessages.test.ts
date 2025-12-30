/**
 * Status Message Utilities Tests
 * 
 * Tests verify:
 * - Correct sentence-based status formatting
 * - Proper context integration
 * - Deterministic output
 * - No execution logic
 */

import {
  formatJobStatus,
  formatClipStatus,
  getStatusIcon,
} from "./statusMessages";

describe("formatJobStatus", () => {
  describe("COMPLETED status", () => {
    it("formats completed with Resolve", () => {
      expect(
        formatJobStatus("COMPLETED", { engineUsed: "resolve" })
      ).toBe("COMPLETED — Rendered successfully by DaVinci Resolve");
    });

    it("formats completed with FFmpeg", () => {
      expect(
        formatJobStatus("COMPLETED", { engineUsed: "ffmpeg" })
      ).toBe("COMPLETED — All clips rendered successfully");
    });

    it("formats completed without engine info", () => {
      expect(formatJobStatus("COMPLETED")).toBe(
        "COMPLETED — All clips rendered successfully"
      );
    });
  });

  describe("FAILED status", () => {
    it("formats failed with validation error", () => {
      expect(
        formatJobStatus("FAILED", {
          validationError: "Source file not found: test.mp4",
        })
      ).toBe("FAILED — Source file not found: test.mp4");
    });

    it("formats failed without error details", () => {
      expect(formatJobStatus("FAILED")).toBe(
        "FAILED — One or more clips failed to render"
      );
    });
  });

  describe("SKIPPED status", () => {
    it("formats skip for free edition", () => {
      expect(
        formatJobStatus("SKIPPED", {
          resolveEdition: "free",
          resolveVersion: "20.3.1",
        })
      ).toBe("SKIPPED — Requires DaVinci Resolve Studio");
    });

    it("formats skip for missing Resolve", () => {
      expect(
        formatJobStatus("SKIPPED", {
          resolveEdition: null,
          resolveVersion: null,
        })
      ).toBe("SKIPPED — DaVinci Resolve is not installed");
    });

    it("formats skip for version requirement", () => {
      expect(
        formatJobStatus("SKIPPED", {
          resolveEdition: "studio",
          resolveVersion: "19.0.3",
        })
      ).toBe("SKIPPED — Requires Resolve Studio 20.3.1+ (detected: 19.0.3)");
    });

    it("formats generic skip", () => {
      expect(formatJobStatus("SKIPPED")).toBe(
        "SKIPPED — Environment requirements not met"
      );
    });
  });

  describe("RUNNING status", () => {
    it("formats running with Resolve", () => {
      expect(
        formatJobStatus("RUNNING", { engineUsed: "resolve" })
      ).toBe("RUNNING — DaVinci Resolve is rendering");
    });

    it("formats running without engine", () => {
      expect(formatJobStatus("RUNNING")).toBe("RUNNING — Job is being processed");
    });
  });

  describe("Other statuses", () => {
    it("formats PENDING", () => {
      expect(formatJobStatus("PENDING")).toBe("PENDING — Waiting to start");
    });

    it("formats QUEUED", () => {
      expect(formatJobStatus("QUEUED")).toBe("QUEUED — In processing queue");
    });

    it("formats PARTIAL", () => {
      expect(formatJobStatus("PARTIAL")).toBe(
        "PARTIAL — Some clips completed before job stopped"
      );
    });

    it("returns unknown status as-is", () => {
      expect(formatJobStatus("UNKNOWN_STATUS")).toBe("UNKNOWN_STATUS");
    });
  });

  describe("Case insensitivity", () => {
    it("handles lowercase status", () => {
      expect(formatJobStatus("completed")).toBe(
        "COMPLETED — All clips rendered successfully"
      );
    });

    it("handles mixed case status", () => {
      expect(formatJobStatus("Failed")).toBe(
        "FAILED — One or more clips failed to render"
      );
    });
  });
});

describe("formatClipStatus", () => {
  describe("COMPLETED status", () => {
    it("formats completed with Resolve", () => {
      expect(
        formatClipStatus("COMPLETED", { engineUsed: "resolve" })
      ).toBe("COMPLETED — Rendered by Resolve");
    });

    it("formats completed without engine", () => {
      expect(formatClipStatus("COMPLETED")).toBe(
        "COMPLETED — Rendered successfully"
      );
    });
  });

  describe("FAILED status", () => {
    it("formats failed with reason", () => {
      expect(
        formatClipStatus("FAILED", {
          failureReason: "Codec not supported",
        })
      ).toBe("FAILED — Codec not supported");
    });

    it("formats failed without reason", () => {
      expect(formatClipStatus("FAILED")).toBe("FAILED — Render failed");
    });
  });

  describe("Other statuses", () => {
    it("formats SKIPPED", () => {
      expect(formatClipStatus("SKIPPED")).toBe("SKIPPED — Not processed");
    });

    it("formats RUNNING", () => {
      expect(formatClipStatus("RUNNING")).toBe("RUNNING — Rendering in progress");
    });

    it("formats QUEUED", () => {
      expect(formatClipStatus("QUEUED")).toBe("QUEUED — Waiting to render");
    });

    it("returns unknown status as-is", () => {
      expect(formatClipStatus("UNKNOWN")).toBe("UNKNOWN");
    });
  });
});

describe("getStatusIcon", () => {
  it("returns correct icons for each status", () => {
    expect(getStatusIcon("COMPLETED")).toBe("✓");
    expect(getStatusIcon("FAILED")).toBe("✗");
    expect(getStatusIcon("SKIPPED")).toBe("⊘");
    expect(getStatusIcon("RUNNING")).toBe("▶");
    expect(getStatusIcon("PENDING")).toBe("○");
    expect(getStatusIcon("QUEUED")).toBe("⋯");
    expect(getStatusIcon("PARTIAL")).toBe("◐");
  });

  it("returns question mark for unknown status", () => {
    expect(getStatusIcon("UNKNOWN")).toBe("?");
  });

  it("handles case insensitivity", () => {
    expect(getStatusIcon("completed")).toBe("✓");
    expect(getStatusIcon("Failed")).toBe("✗");
  });
});

describe("Determinism", () => {
  it("produces identical output for same inputs", () => {
    const result1 = formatJobStatus("COMPLETED", { engineUsed: "resolve" });
    const result2 = formatJobStatus("COMPLETED", { engineUsed: "resolve" });
    expect(result1).toBe(result2);
  });

  it("produces identical icons for same inputs", () => {
    const icon1 = getStatusIcon("COMPLETED");
    const icon2 = getStatusIcon("COMPLETED");
    expect(icon1).toBe(icon2);
  });
});

describe("No side effects", () => {
  it("does not mutate metadata objects", () => {
    const metadata = {
      engineUsed: "resolve" as const,
      resolveEdition: "studio" as const,
      resolveVersion: "20.3.1",
    };

    const metadataCopy = { ...metadata };

    formatJobStatus("COMPLETED", metadata);

    expect(metadata).toEqual(metadataCopy);
  });

  it("does not perform any I/O operations", () => {
    // These functions should be pure with no side effects
    const consoleSpy = jest.spyOn(console, "log");
    const consoleErrorSpy = jest.spyOn(console, "error");

    formatJobStatus("COMPLETED");
    formatClipStatus("COMPLETED");
    getStatusIcon("COMPLETED");

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
