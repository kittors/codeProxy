/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";

const mocks = vi.hoisted(() => ({
  downloadFile: vi.fn(async () => undefined),
  downloadBlob: vi.fn(async () => new Blob(["{}"], { type: "application/json" })),
  notify: vi.fn(),
  createStoreZipBlob: vi.fn(() => new Blob(["zip"], { type: "application/zip" })),
  downloadBlobAsFile: vi.fn(),
  buildAuthFilesBatchZipName: vi.fn(() => "auth-files-2-test.zip"),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; defaultValue?: string; success?: number; failed?: number }) => {
      if (opts?.defaultValue) {
        return String(opts.defaultValue)
          .replace("{{count}}", String(opts.count ?? ""))
          .replace("{{success}}", String(opts.success ?? ""))
          .replace("{{failed}}", String(opts.failed ?? ""));
      }
      return key;
    },
  }),
}));

vi.mock("@code-proxy/ui", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock("@code-proxy/api-client", () => ({
  authFilesApi: {
    downloadFile: mocks.downloadFile,
    downloadBlob: mocks.downloadBlob,
    upload: vi.fn(),
    deleteFile: vi.fn(),
    setStatus: vi.fn(),
    patchFields: vi.fn(),
  },
}));

vi.mock("@features/model-availability", () => ({
  invalidateConfiguredModelAvailability: vi.fn(),
}));

vi.mock("@code-proxy/domain", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/domain")>("@code-proxy/domain");
  return {
    ...actual,
    createStoreZipBlob: mocks.createStoreZipBlob,
    downloadBlobAsFile: mocks.downloadBlobAsFile,
    buildAuthFilesBatchZipName: mocks.buildAuthFilesBatchZipName,
  };
});

import { useAuthFilesFileActions } from "../useAuthFilesFileActions";

describe("useAuthFilesFileActions handleDownloadSelection", () => {
  beforeEach(() => {
    mocks.downloadFile.mockReset();
    mocks.downloadBlob.mockReset();
    mocks.notify.mockReset();
    mocks.createStoreZipBlob.mockReset();
    mocks.downloadBlobAsFile.mockReset();
    mocks.buildAuthFilesBatchZipName.mockReset();
    mocks.downloadFile.mockResolvedValue(undefined);
    mocks.downloadBlob.mockImplementation(async (...args: unknown[]) => {
      const name = String(args[0] ?? "");
      return new Blob([`content:${name}`], { type: "application/json" });
    });
    mocks.createStoreZipBlob.mockReturnValue(new Blob(["zip"], { type: "application/zip" }));
    mocks.buildAuthFilesBatchZipName.mockReturnValue("auth-files-2-test.zip");
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  const setup = () =>
    renderHook(() =>
      useAuthFilesFileActions({
        loadAll: vi.fn(async () => []),
        fileInputRef: createRef<HTMLInputElement>(),
        detailFile: null,
        setDetailFile: vi.fn(),
        setDetailOpen: vi.fn(),
        setFiles: vi.fn(),
        setSelectedFileNames: vi.fn(),
      }),
    );

  it("downloads a single selected file without zipping", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleDownloadSelection(["one.json"]);
    });
    expect(mocks.downloadFile).toHaveBeenCalledWith("one.json");
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(mocks.createStoreZipBlob).not.toHaveBeenCalled();
    expect(mocks.downloadBlobAsFile).not.toHaveBeenCalled();
  });

  it("packs multiple selected files into one zip", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleDownloadSelection(["a.json", "b.json"]);
    });
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(2);
    expect(mocks.downloadBlob).toHaveBeenCalledWith("a.json");
    expect(mocks.downloadBlob).toHaveBeenCalledWith("b.json");
    expect(mocks.createStoreZipBlob).toHaveBeenCalledTimes(1);
    const zipCall = mocks.createStoreZipBlob.mock.calls[0] as unknown as [
      { name: string; data: Uint8Array }[],
    ];
    const entries = zipCall[0];
    expect(entries.map((e) => e.name)).toEqual(["a.json", "b.json"]);
    expect(mocks.downloadBlobAsFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "auth-files-2-test.zip",
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" }),
    );
  });

  it("does nothing when user cancels confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = setup();
    await act(async () => {
      await result.current.handleDownloadSelection(["a.json", "b.json"]);
    });
    expect(mocks.downloadFile).not.toHaveBeenCalled();
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });
});
