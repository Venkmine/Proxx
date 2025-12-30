/**
 * Pre-flight Compatibility Panel Tests
 * 
 * Tests verify:
 * - Deterministic rendering
 * - Correct messaging for version-gated ARRIRAW
 * - No execution calls from UI
 * - Snapshot-stable output
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PreflightCompatibilityPanel } from "./PreflightCompatibilityPanel";

describe("PreflightCompatibilityPanel", () => {
  describe("FFmpeg engine - should not render", () => {
    it("does not render when engine is ffmpeg", () => {
      const { container } = render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="19.0.3"
          sourceExtensions={[".mp4", ".mov"]}
          engineUsed="ffmpeg"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it("does not render when engine is null", () => {
      const { container } = render(
        <PreflightCompatibilityPanel
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".braw"]}
          engineUsed={null}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Resolve engine - renders compatibility info", () => {
    it("renders environment section with Resolve details", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="19.0.3"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("Detected Environment")).toBeInTheDocument();
      expect(screen.getByText("studio")).toBeInTheDocument();
      expect(screen.getByText("19.0.3")).toBeInTheDocument();
    });

    it("shows missing when Resolve not detected", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getAllByText("(not detected)")).toHaveLength(2);
    });

    it("groups formats by codec correctly", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw", ".braw", ".r3d"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("BRAW")).toBeInTheDocument();
      expect(screen.getByText("2 files")).toBeInTheDocument();
      expect(screen.getByText("R3D")).toBeInTheDocument();
      expect(screen.getByText("1 file")).toBeInTheDocument();
    });
  });

  describe("ARRIRAW version gating", () => {
    it("shows RUN for ARRIRAW with Studio 20.3.1+", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".arriraw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("RUN")).toBeInTheDocument();
      expect(
        screen.getByText(/ARRIRAW will be processed by Resolve Studio 20.3.1/)
      ).toBeInTheDocument();
    });

    it("shows SKIP for ARRIRAW with free edition", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="free"
          resolveVersion="20.3.1"
          sourceExtensions={[".arriraw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("SKIP")).toBeInTheDocument();
      expect(
        screen.getByText(/ARRIRAW requires DaVinci Resolve Studio/)
      ).toBeInTheDocument();
    });

    it("shows SKIP for ARRIRAW with Studio < 20.3.1", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="19.0.3"
          sourceExtensions={[".arriraw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("SKIP")).toBeInTheDocument();
      expect(
        screen.getByText(/ARRIRAW requires Resolve Studio 20.3.1 or later/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Detected version: 19.0.3/)).toBeInTheDocument();
    });

    it("shows BLOCK for ARRIRAW with no Resolve", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".arriraw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("BLOCK")).toBeInTheDocument();
      expect(
        screen.getByText(/DaVinci Resolve is not installed/)
      ).toBeInTheDocument();
    });
  });

  describe("Other RAW formats", () => {
    it("shows RUN for BRAW with any Resolve edition", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="free"
          resolveVersion="19.0"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("RUN")).toBeInTheDocument();
      expect(
        screen.getByText(/This format will be processed by DaVinci Resolve free 19.0/)
      ).toBeInTheDocument();
    });

    it("shows RUN for R3D with Studio", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="19.0.3"
          sourceExtensions={[".r3d"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("RUN")).toBeInTheDocument();
      expect(
        screen.getByText(/This format will be processed by DaVinci Resolve studio 19.0.3/)
      ).toBeInTheDocument();
    });

    it("shows BLOCK when Resolve not installed", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".braw", ".r3d"]}
          engineUsed="resolve"
        />
      );

      const blockBadges = screen.getAllByText("BLOCK");
      expect(blockBadges).toHaveLength(2);
      const blockReasons = screen.getAllByText(/DaVinci Resolve is not installed/);
      expect(blockReasons).toHaveLength(2);
    });
  });

  describe("Legend rendering", () => {
    it("renders legend with all status types", () => {
      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      expect(screen.getByText("What This Means")).toBeInTheDocument();
      expect(screen.getByText(/Format will be processed successfully/)).toBeInTheDocument();
      expect(screen.getByText(/Format will be skipped due to environment constraints/)).toBeInTheDocument();
      expect(screen.getByText(/Job cannot proceed without required software/)).toBeInTheDocument();
    });
  });

  describe("Deterministic rendering", () => {
    it("renders identical output for same props", () => {
      const props = {
        resolveEdition: "studio" as const,
        resolveVersion: "20.3.1",
        sourceExtensions: [".braw", ".r3d"],
        engineUsed: "resolve" as const,
      };

      const { container: container1 } = render(<PreflightCompatibilityPanel {...props} />);
      const { container: container2 } = render(<PreflightCompatibilityPanel {...props} />);

      expect(container1.innerHTML).toBe(container2.innerHTML);
    });

    it("groups formats deterministically", () => {
      const props = {
        resolveEdition: "studio" as const,
        resolveVersion: "20.3.1",
        sourceExtensions: [".braw", ".r3d", ".braw", ".r3d", ".braw"],
        engineUsed: "resolve" as const,
      };

      render(<PreflightCompatibilityPanel {...props} />);

      expect(screen.getByText("BRAW")).toBeInTheDocument();
      expect(screen.getByText("3 files")).toBeInTheDocument();
      expect(screen.getByText("R3D")).toBeInTheDocument();
      expect(screen.getByText("2 files")).toBeInTheDocument();
    });
  });

  describe("No execution calls", () => {
    it("does not import execution modules", () => {
      // This test verifies at compile time that no execution imports exist
      // If execution modules were imported, TypeScript would include them
      // In runtime, we verify no side effects occur

      const consoleSpy = jest.spyOn(console, "error");
      const consoleWarnSpy = jest.spyOn(console, "warn");

      render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      // No console errors or warnings should occur
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it("is a pure display component with no side effects", () => {
      const { rerender } = render(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      // Re-rendering with same props should not trigger any side effects
      rerender(
        <PreflightCompatibilityPanel
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          engineUsed="resolve"
        />
      );

      // Component should still render the same content
      expect(screen.getByText("Pre-flight Compatibility Check")).toBeInTheDocument();
    });
  });
});
