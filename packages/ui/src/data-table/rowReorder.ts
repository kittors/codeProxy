import type { RowReorderGeometry, RowReorderState } from "./dataTableModel";

function syncClonedFormControlState(
  sourceRow: HTMLTableRowElement,
  clonedRow: HTMLTableRowElement,
) {
  const sourceControls = sourceRow.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  const clonedControls = clonedRow.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  clonedControls.forEach((clonedControl, index) => {
    const sourceControl = sourceControls[index];
    if (sourceControl) {
      clonedControl.value = sourceControl.value;
      if (sourceControl instanceof HTMLInputElement && clonedControl instanceof HTMLInputElement) {
        clonedControl.checked = sourceControl.checked;
      }
    }
    clonedControl.tabIndex = -1;
  });
}

// Clone the rendered row so form controls keep their exact current appearance without re-running cell callbacks.
export function createRowReorderPreviewElement(sourceRow: HTMLTableRowElement) {
  const rowRect = sourceRow.getBoundingClientRect();
  const clonedRow = sourceRow.cloneNode(true) as HTMLTableRowElement;
  clonedRow.removeAttribute("data-vt-row-index");
  clonedRow.removeAttribute("data-vt-row-key");
  clonedRow.removeAttribute("data-vt-row-reorder-active");
  clonedRow.removeAttribute("tabindex");
  clonedRow.style.height = `${rowRect.height}px`;
  clonedRow.style.opacity = "1";
  clonedRow.style.background = "transparent";

  clonedRow.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  clonedRow.querySelectorAll<HTMLElement>("button, [href], [tabindex]").forEach((element) => {
    element.removeAttribute("aria-label");
    element.removeAttribute("title");
    element.tabIndex = -1;
  });
  syncClonedFormControlState(sourceRow, clonedRow);

  const sourceCells = Array.from(sourceRow.cells);
  const clonedCells = Array.from(clonedRow.cells);
  sourceCells.forEach((sourceCell, index) => {
    const clonedCell = clonedCells[index];
    if (!clonedCell) return;
    clonedCell.style.borderTopWidth = "0";
    clonedCell.style.borderBottomWidth = "0";

    const cellWidth = sourceCell.getBoundingClientRect().width;
    if (cellWidth <= 0) return;
    const widthPx = `${cellWidth}px`;
    clonedCell.style.width = widthPx;
    clonedCell.style.minWidth = widthPx;
    clonedCell.style.maxWidth = widthPx;
  });

  const table = document.createElement("table");
  table.className = "w-full table-fixed border-separate border-spacing-0 text-sm";
  const tbody = document.createElement("tbody");
  tbody.appendChild(clonedRow);
  table.appendChild(tbody);

  const preview = document.createElement("div");
  preview.dataset.vtRowReorderPreview = "true";
  preview.setAttribute("aria-hidden", "true");
  preview.className =
    "pointer-events-none fixed left-0 top-0 z-[1100] box-border overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_0_20px_rgba(15,23,42,0.16)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_0_20px_rgba(0,0,0,0.42)]";
  preview.style.left = `${rowRect.left}px`;
  preview.style.width = `${Math.max(1, rowRect.width)}px`;
  preview.style.height = `${Math.max(1, rowRect.height)}px`;
  preview.style.willChange = "transform";
  preview.appendChild(table);
  document.body.appendChild(preview);

  return { preview, height: Math.max(1, rowRect.height) };
}

export function positionRowReorderPreview(active: RowReorderState, clientY: number) {
  if (!active.previewElement) return;
  const viewportInset = 8;
  const unclampedTop = clientY - active.grabOffsetY;
  const maxTop = Math.max(viewportInset, window.innerHeight - active.previewHeight - viewportInset);
  const top = Math.max(viewportInset, Math.min(maxTop, unclampedTop));
  active.previewElement.style.transform = `translate3d(0, ${Math.round(top)}px, 0)`;
}

export function collectRowReorderGeometry(table: HTMLTableElement | null): RowReorderGeometry[] {
  return Array.from(
    table?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-vt-row-index]") ?? [],
  )
    .map((element) => ({
      index: Number(element.dataset.vtRowIndex),
      element,
      appliedShift: 0,
    }))
    .filter((item) => Number.isInteger(item.index));
}

export function resolveRowReorderDestination(active: RowReorderState, rowCount: number) {
  return Math.max(
    0,
    Math.min(
      rowCount - 1,
      active.insertionIndex > active.fromIndex ? active.insertionIndex - 1 : active.insertionIndex,
    ),
  );
}

export function applyRowReorderDisplacement(active: RowReorderState, rowCount: number) {
  const destinationIndex = resolveRowReorderDestination(active, rowCount);
  for (const geometry of active.rows) {
    if (geometry.index === active.fromIndex) {
      geometry.element.style.opacity = "0";
      geometry.element.style.pointerEvents = "none";
      continue;
    }

    const shift =
      active.fromIndex < destinationIndex &&
      geometry.index > active.fromIndex &&
      geometry.index <= destinationIndex
        ? -active.sourceHeight
        : active.fromIndex > destinationIndex &&
            geometry.index >= destinationIndex &&
            geometry.index < active.fromIndex
          ? active.sourceHeight
          : 0;
    if (shift === geometry.appliedShift) continue;
    geometry.appliedShift = shift;
    geometry.element.style.willChange = "transform";
    geometry.element.style.transition = "transform 140ms cubic-bezier(0.2, 0, 0, 1)";
    geometry.element.style.transform =
      shift === 0 ? "" : `translate3d(0, ${Math.round(shift)}px, 0)`;
  }
}

export function resetRowReorderDisplacement(active: RowReorderState | null) {
  for (const geometry of active?.rows ?? []) {
    geometry.element.style.opacity = "";
    geometry.element.style.pointerEvents = "";
    geometry.element.style.willChange = "";
    geometry.element.style.transition = "";
    geometry.element.style.transform = "";
  }
}

export function removeRowReorderVisuals(active: RowReorderState | null) {
  resetRowReorderDisplacement(active);
  active?.previewElement?.remove();
}

// ---------------------------------------------------------------------------
// Column Order Helpers
// ---------------------------------------------------------------------------
