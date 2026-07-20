/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { createRef, type Dispatch, type SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFileItem } from "@code-proxy/api-client";

const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn(async (_name: string): Promise<void> => undefined),
  setStatus: vi.fn(
    async (_name: string, disabled: boolean): Promise<{ status: string; disabled: boolean }> => ({
      status: "ok",
      disabled,
    }),
  ),
  notify: vi.fn(),
  invalidateConfiguredModelAvailability: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@code-proxy/ui", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock("@code-proxy/api-client", () => ({
  authFilesApi: {
    downloadFile: vi.fn(),
    downloadBlob: vi.fn(),
    upload: vi.fn(),
    deleteFile: mocks.deleteFile,
    setStatus: mocks.setStatus,
    patchFields: vi.fn(),
  },
}));

vi.mock("@features/model-availability", () => ({
  invalidateConfiguredModelAvailability: mocks.invalidateConfiguredModelAvailability,
}));

import { useAuthFilesFileActions } from "../useAuthFilesFileActions";

interface SetupOptions {
  loadAll: () => Promise<AuthFileItem[]>;
}

const setup = ({ loadAll }: SetupOptions) => {
  const setFiles = vi.fn<Dispatch<SetStateAction<AuthFileItem[]>>>();
  const setSelectedFileNames = vi.fn<Dispatch<SetStateAction<string[]>>>();
  const setDetailFile = vi.fn<Dispatch<SetStateAction<AuthFileItem | null>>>();
  const setDetailOpen = vi.fn<Dispatch<SetStateAction<boolean>>>();
  const hook = renderHook(() =>
    useAuthFilesFileActions({
      loadAll,
      fileInputRef: createRef<HTMLInputElement>(),
      detailFile: null,
      setDetailFile,
      setDetailOpen,
      setFiles,
      setSelectedFileNames,
    }),
  );
  return { ...hook, setFiles, setSelectedFileNames, setDetailFile };
};

describe("useAuthFilesFileActions batch mutations", () => {
  beforeEach(() => {
    mocks.deleteFile.mockReset();
    mocks.setStatus.mockReset();
    mocks.notify.mockReset();
    mocks.invalidateConfiguredModelAvailability.mockReset();
    mocks.deleteFile.mockResolvedValue(undefined);
    mocks.setStatus.mockImplementation(async (_name: string, disabled: boolean) => ({
      status: "ok",
      disabled,
    }));
  });

  it("disables every selected auth file and reports one batch result", async () => {
    const loadAll = vi.fn(async (): Promise<AuthFileItem[]> => [
      { name: "a.json", disabled: true },
      { name: "b.json", disabled: true },
    ]);
    const { result, setFiles } = setup({ loadAll });

    await act(async () => {
      await result.current.handleDisableSelection(["a.json", "b.json"]);
    });

    expect(mocks.setStatus.mock.calls).toEqual([
      ["a.json", true],
      ["b.json", true],
    ]);
    expect(loadAll).toHaveBeenCalledTimes(1);
    const updateFiles = setFiles.mock.calls.at(-1)?.[0];
    expect(typeof updateFiles).toBe("function");
    expect(
      (updateFiles as (files: AuthFileItem[]) => AuthFileItem[])([
        { name: "a.json", disabled: false },
        { name: "b.json", disabled: false },
      ]),
    ).toEqual([
      { name: "a.json", disabled: true },
      { name: "b.json", disabled: true },
    ]);
    expect(mocks.notify).toHaveBeenCalledWith({
      type: "success",
      message: "auth_files.batch_status_success",
    });
  });

  it("treats an errored delete as successful when authoritative refresh shows it absent", async () => {
    mocks.deleteFile.mockRejectedValueOnce(new Error("response lost"));
    const loadAll = vi.fn(async (): Promise<AuthFileItem[]> => []);
    const { result, setSelectedFileNames } = setup({ loadAll });

    await act(async () => {
      await result.current.handleDeleteSelection(["tenant-account.json"]);
    });

    expect(loadAll).toHaveBeenCalledTimes(1);
    const updateSelection = setSelectedFileNames.mock.calls.at(-1)?.[0];
    expect(typeof updateSelection).toBe("function");
    expect((updateSelection as (names: string[]) => string[])(["tenant-account.json"])).toEqual(
      [],
    );
    expect(mocks.notify).toHaveBeenCalledWith({
      type: "success",
      message: "auth_files.batch_deleted_selected",
    });
  });
});
