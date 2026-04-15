import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { AuthFileItem } from "@/lib/http/types";
import {
  AUTH_FILES_PAGE_SIZE,
  authFilesSortCollator,
  normalizeProviderKey,
  resolveAuthFileSortKey,
  resolveFileType,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import { isRuntimeOnlyAuthFile } from "@/modules/auth-files/helpers/authFilesPageUtils";

interface UseAuthFilesListStateOptions {
  files: AuthFileItem[];
  filter: string;
  search: string;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  selectedFileNames: string[];
  setSelectedFileNames: Dispatch<SetStateAction<string[]>>;
}

export function useAuthFilesListState({
  files,
  filter,
  search,
  page,
  setPage,
  selectedFileNames,
  setSelectedFileNames,
}: UseAuthFilesListStateOptions) {
  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((file) => set.add(resolveFileType(file)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const searchFilteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((file) => {
      if (!q) return true;
      const name = String(file.name || "").toLowerCase();
      const provider = String(file.provider || "").toLowerCase();
      const type = String(file.type || "").toLowerCase();
      return name.includes(q) || provider.includes(q) || type.includes(q);
    });
  }, [files, search]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    searchFilteredFiles.forEach((file) => {
      const typeKey = normalizeProviderKey(resolveFileType(file));
      counts[typeKey] = (counts[typeKey] ?? 0) + 1;
    });
    return { total: searchFilteredFiles.length, counts };
  }, [searchFilteredFiles]);

  const filteredFiles = useMemo(() => {
    const normalizedFilter = normalizeProviderKey(filter);
    const scoped =
      !normalizedFilter || normalizedFilter === "all"
        ? searchFilteredFiles
        : searchFilteredFiles.filter(
            (file) => normalizeProviderKey(resolveFileType(file)) === normalizedFilter,
          );
    return [...scoped].sort((a, b) =>
      authFilesSortCollator.compare(resolveAuthFileSortKey(a), resolveAuthFileSortKey(b)),
    );
  }, [filter, searchFilteredFiles]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / AUTH_FILES_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * AUTH_FILES_PAGE_SIZE;
    return filteredFiles.slice(start, start + AUTH_FILES_PAGE_SIZE);
  }, [filteredFiles, safePage]);

  const selectableFilteredFiles = useMemo(
    () => filteredFiles.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [filteredFiles],
  );
  const selectablePageFiles = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems],
  );
  const selectableFilteredNameSet = useMemo(
    () => new Set(selectableFilteredFiles.map((file) => file.name)),
    [selectableFilteredFiles],
  );
  const selectablePageNames = useMemo(
    () => selectablePageFiles.map((file) => file.name),
    [selectablePageFiles],
  );
  const selectedFileNameSet = useMemo(() => new Set(selectedFileNames), [selectedFileNames]);
  const selectedCount = selectedFileNames.length;

  const allPageSelected =
    selectablePageNames.length > 0 &&
    selectablePageNames.every((name) => selectedFileNameSet.has(name));
  const somePageSelected =
    !allPageSelected && selectablePageNames.some((name) => selectedFileNameSet.has(name));
  const allFilteredSelected =
    selectableFilteredFiles.length > 0 &&
    selectableFilteredFiles.every((file) => selectedFileNameSet.has(file.name));

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage, setPage]);

  useEffect(() => {
    setSelectedFileNames((prev) => prev.filter((name) => selectableFilteredNameSet.has(name)));
  }, [selectableFilteredNameSet, setSelectedFileNames]);

  const toggleFileSelection = useCallback(
    (name: string, checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        if (checked) next.add(name);
        else next.delete(name);
        return Array.from(next);
      });
    },
    [setSelectedFileNames],
  );

  const selectCurrentPage = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectablePageNames.forEach((name) => {
          if (checked) next.add(name);
          else next.delete(name);
        });
        return Array.from(next);
      });
    },
    [selectablePageNames, setSelectedFileNames],
  );

  const selectFilteredFiles = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectableFilteredFiles.forEach((file) => {
          if (checked) next.add(file.name);
          else next.delete(file.name);
        });
        return Array.from(next);
      });
    },
    [selectableFilteredFiles, setSelectedFileNames],
  );

  return {
    providerOptions,
    filterCounts,
    filteredFiles,
    totalPages,
    safePage,
    pageItems,
    selectableFilteredFiles,
    selectablePageNames,
    selectedFileNameSet,
    selectedCount,
    allPageSelected,
    somePageSelected,
    allFilteredSelected,
    toggleFileSelection,
    selectCurrentPage,
    selectFilteredFiles,
  };
}
