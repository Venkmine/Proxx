/**
 * Why This Happened Component Tests
 * 
 * Tests verify:
 * - Correct engine selection explanations
 * - Proper failure/skip reasoning
 * - Read-only display with no execution
 * - Deterministic output
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WhyThisHappened } from "./WhyThisHappened";

describe("WhyThisHappened", () => {
  describe("Engine selection explanations", () => {
    it("explains Resolve selection for RAW formats", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="resolve"
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw", ".r3d"]}
          validationError={null}
        />
      );

      expect(screen.getByText("DaVinci Resolve")).toBeInTheDocument();
      expect(
        screen.getByText(/Job contains camera RAW formats/)
      ).toBeInTheDocument();
      expect(screen.getByText(/BRAW, R3D/)).toBeInTheDocument();
      expect(
        screen.getByText(/FFmpeg cannot process these formats/)
      ).toBeInTheDocument();
    });

    it("explains FFmpeg selection for standard codecs", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="ffmpeg"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".mp4", ".mov"]}
          validationError={null}
        />
      );

      expect(screen.getByText("FFmpeg")).toBeInTheDocument();
      expect(
        screen.getByText(/standard video codecs/)
      ).toBeInTheDocument();
      expect(screen.getByText(/H.264, ProRes, DNxHD/)).toBeInTheDocument();
    });

    it("shows alternatives not used for Resolve", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="resolve"
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          validationError={null}
        />
      );

      expect(screen.getByText(/Why alternatives were not used:/)).toBeInTheDocument();
      expect(
        screen.getByText(/FFmpeg — Not used because it cannot decode/)
      ).toBeInTheDocument();
    });

    it("shows alternatives not used for FFmpeg", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="ffmpeg"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".mp4"]}
          validationError={null}
        />
      );

      expect(screen.getByText(/Why alternatives were not used:/)).toBeInTheDocument();
      expect(
        screen.getByText(/DaVinci Resolve — Not needed for standard codecs/)
      ).toBeInTheDocument();
    });
  });

  describe("Failure explanations", () => {
    it("shows validation error when job failed", () => {
      render(
        <WhyThisHappened
          finalStatus="failed"
          engineUsed="ffmpeg"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".mp4"]}
          validationError="Source file not found: test.mp4"
        />
      );

      expect(screen.getByText("Why Job Failed")).toBeInTheDocument();
      expect(
        screen.getByText("Source file not found: test.mp4")
      ).toBeInTheDocument();
    });

    it("explains skip when Resolve not installed", () => {
      render(
        <WhyThisHappened
          finalStatus="skipped"
          engineUsed="resolve"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".braw"]}
          validationError={null}
        />
      );

      expect(screen.getByText("Why Job Was Skipped")).toBeInTheDocument();
      expect(
        screen.getByText(/Job requires DaVinci Resolve but no installation was detected/)
      ).toBeInTheDocument();
    });

    it("explains skip when Free edition detected for ARRIRAW", () => {
      render(
        <WhyThisHappened
          finalStatus="skipped"
          engineUsed="resolve"
          resolveEdition="free"
          resolveVersion="20.3.1"
          sourceExtensions={[".arriraw"]}
          validationError={null}
        />
      );

      expect(screen.getByText("Why Job Was Skipped")).toBeInTheDocument();
      expect(
        screen.getByText(/ARRIRAW media which requires DaVinci Resolve Studio/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Free edition was detected/)).toBeInTheDocument();
    });

    it("explains skip when version too old for ARRIRAW", () => {
      render(
        <WhyThisHappened
          finalStatus="skipped"
          engineUsed="resolve"
          resolveEdition="studio"
          resolveVersion="19.0.3"
          sourceExtensions={[".arriraw"]}
          validationError={null}
        />
      );

      expect(screen.getByText("Why Job Was Skipped")).toBeInTheDocument();
      expect(
        screen.getByText(/ARRIRAW requires DaVinci Resolve Studio 20.3.1 or later/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Detected version: 19.0.3/)).toBeInTheDocument();
    });

    it("does not show failure section for completed jobs", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="ffmpeg"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".mp4"]}
          validationError={null}
        />
      );

      expect(screen.queryByText("Why Job Failed")).not.toBeInTheDocument();
      expect(screen.queryByText("Why Job Was Skipped")).not.toBeInTheDocument();
    });
  });

  describe("Read-only display disclaimer", () => {
    it("shows metadata disclaimer note", () => {
      render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="ffmpeg"
          resolveEdition={null}
          resolveVersion={null}
          sourceExtensions={[".mp4"]}
          validationError={null}
        />
      );

      expect(
        screen.getByText(/This information is read from execution metadata/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No derivation or interpretation is performed by the UI/)
      ).toBeInTheDocument();
    });
  });

  describe("Deterministic rendering", () => {
    it("renders identical output for same props", () => {
      const props = {
        finalStatus: "completed",
        engineUsed: "resolve" as const,
        resolveEdition: "studio" as const,
        resolveVersion: "20.3.1",
        sourceExtensions: [".braw"],
        validationError: null,
      };

      const { container: container1 } = render(<WhyThisHappened {...props} />);
      const { container: container2 } = render(<WhyThisHappened {...props} />);

      expect(container1.innerHTML).toBe(container2.innerHTML);
    });

    it("orders format names consistently", () => {
      const props1 = {
        finalStatus: "completed",
        engineUsed: "resolve" as const,
        resolveEdition: "studio" as const,
        resolveVersion: "20.3.1",
        sourceExtensions: [".braw", ".r3d", ".arriraw"],
        validationError: null,
      };

      const props2 = {
        ...props1,
        sourceExtensions: [".arriraw", ".r3d", ".braw"],
      };

      const { container: container1 } = render(<WhyThisHappened {...props1} />);
      const { container: container2 } = render(<WhyThisHappened {...props2} />);

      // Should render formats in a consistent order
      const text1 = container1.textContent;
      const text2 = container2.textContent;

      expect(text1).toBe(text2);
    });
  });

  describe("No execution logic", () => {
    it("is a pure display component with no side effects", () => {
      const consoleSpy = jest.spyOn(console, "error");
      const consoleWarnSpy = jest.spyOn(console, "warn");

      const { rerender } = render(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="resolve"
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          validationError={null}
        />
      );

      // Re-render should not cause side effects
      rerender(
        <WhyThisHappened
          finalStatus="completed"
          engineUsed="resolve"
          resolveEdition="studio"
          resolveVersion="20.3.1"
          sourceExtensions={[".braw"]}
          validationError={null}
        />
      );

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});
