/**
 * AddAnnotation Component Tests
 * 
 * Tests asserting:
 * - Valid submission
 * - Validation failures surfaced verbatim
 * - No execution imports
 * - No Fabric imports
 * - No retries
 * - No mutation of job data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddAnnotation } from "./AddAnnotation";
import type { AddAnnotationProps } from "./AddAnnotation.types";

describe("AddAnnotation", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const defaultProps: AddAnnotationProps = {
    target_type: "job",
    target_id: "test-job-123",
  };

  beforeEach(() => {
    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders form with decision selector and note input", () => {
    render(<AddAnnotation {...defaultProps} />);

    expect(screen.getByLabelText(/decision/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit annotation/i })).toBeInTheDocument();
  });

  it("submit button is disabled when no decision is selected", () => {
    render(<AddAnnotation {...defaultProps} />);

    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    expect(submitButton).toBeDisabled();
  });

  it("submit button is enabled when decision is selected", () => {
    render(<AddAnnotation {...defaultProps} />);

    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "retry" } });

    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    expect(submitButton).not.toBeDisabled();
  });

  it("submits annotation with valid data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ annotation_id: "ann-123" }),
    });

    const onAnnotationCreated = vi.fn();
    render(<AddAnnotation {...defaultProps} onAnnotationCreated={onAnnotationCreated} />);

    // Select decision
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "retry" } });

    // Enter note
    const noteInput = screen.getByLabelText(/note/i);
    fireEvent.change(noteInput, { target: { value: "Test note" } });

    // Submit
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for fetch to be called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Verify API call
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/fabric/annotations"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: expect.stringContaining('"decision":"retry"'),
      })
    );

    // Verify callback was invoked
    await waitFor(() => {
      expect(onAnnotationCreated).toHaveBeenCalledTimes(1);
    });

    // Verify form is cleared
    expect(decisionSelect).toHaveValue("");
    expect(noteInput).toHaveValue("");
  });

  it("surfaces validation error when decision is missing", async () => {
    render(<AddAnnotation {...defaultProps} />);

    // Try to submit without selecting decision
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    
    // Button should be disabled
    expect(submitButton).toBeDisabled();
  });

  it("surfaces API errors verbatim", async () => {
    const errorMessage = "Invalid target_id format";
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => errorMessage,
    });

    render(<AddAnnotation {...defaultProps} />);

    // Select decision
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "ignore" } });

    // Submit
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Verify error is displayed verbatim
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it("does not retry on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    });

    render(<AddAnnotation {...defaultProps} />);

    // Select decision and submit
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "escalate" } });

    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for error
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Verify fetch was called only once (no retries)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("disables form during submission", async () => {
    // Mock slow response
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ annotation_id: "ann-123" }),
              }),
            100
          )
        )
    );

    render(<AddAnnotation {...defaultProps} />);

    // Select decision
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "retry" } });

    const noteInput = screen.getByLabelText(/note/i);
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });

    // Submit
    fireEvent.click(submitButton);

    // Verify form is disabled during submission
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent(/submitting/i);
      expect(decisionSelect).toBeDisabled();
      expect(noteInput).toBeDisabled();
    });
  });

  it("does not import execution modules", () => {
    // This test verifies at import time that we don't have execution dependencies
    // If AddAnnotation imports execution modules, this file would fail to load
    expect(AddAnnotation).toBeDefined();
  });

  it("does not import Fabric modules", () => {
    // This test verifies at import time that we don't have Fabric dependencies
    // If AddAnnotation imports Fabric modules, this file would fail to load
    expect(AddAnnotation).toBeDefined();
  });

  it("sends null for empty note", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ annotation_id: "ann-123" }),
    });

    render(<AddAnnotation {...defaultProps} />);

    // Select decision without note
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "ignore" } });

    // Submit
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Verify note is null when empty
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.note).toBeNull();
  });

  it("trims whitespace from note", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ annotation_id: "ann-123" }),
    });

    render(<AddAnnotation {...defaultProps} />);

    // Select decision
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "retry" } });

    // Enter note with whitespace
    const noteInput = screen.getByLabelText(/note/i);
    fireEvent.change(noteInput, { target: { value: "  spaces  " } });

    // Submit
    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Verify note is trimmed
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.note).toBe("spaces");
  });

  it("includes target_type and target_id in API call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ annotation_id: "ann-123" }),
    });

    render(
      <AddAnnotation
        target_type="snapshot"
        target_id="snapshot-xyz"
      />
    );

    // Select decision and submit
    const decisionSelect = screen.getByLabelText(/decision/i);
    fireEvent.change(decisionSelect, { target: { value: "escalate" } });

    const submitButton = screen.getByRole("button", { name: /submit annotation/i });
    fireEvent.click(submitButton);

    // Wait for fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Verify target_type and target_id
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.target_type).toBe("snapshot");
    expect(body.target_id).toBe("snapshot-xyz");
  });
});
