import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ProviderKeyListCard } from "@pages/providers/ProviderKeyListCard";

const items: ProviderSimpleConfig[] = [
  { name: "alpha", apiKey: "key-alpha", models: [] } as unknown as ProviderSimpleConfig,
  { name: "bravo", apiKey: "key-bravo", models: [] } as unknown as ProviderSimpleConfig,
  { name: "charlie", apiKey: "key-charlie", models: [] } as unknown as ProviderSimpleConfig,
];

const renderList = (displayOrder?: number[], onEdit = vi.fn()) => {
  render(
    <ThemeProvider>
      <ToastProvider>
        <ProviderKeyListCard
          items={items}
          onEdit={onEdit}
          onDelete={vi.fn()}
          getStats={() => ({ success: 0, failure: 0 })}
          getStatusBar={() => ({
            blocks: [],
            blockDetails: [],
            successRate: 0,
            totalSuccess: 0,
            totalFailure: 0,
          })}
          {...(displayOrder ? { displayOrder } : {})}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
  return onEdit;
};

const renderedNames = (): string[] =>
  items
    .map((item) => item.name as string)
    .map((name) => ({ name, node: screen.queryByTitle(name) }))
    .filter((entry) => entry.node !== null)
    .sort(
      (left, right) =>
        (left.node!.compareDocumentPosition(right.node!) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1),
    )
    .map((entry) => entry.name);

describe("ProviderKeyListCard displayOrder", () => {
  test("renders in configured order when no order is supplied", () => {
    renderList();
    expect(renderedNames()).toEqual(["alpha", "bravo", "charlie"]);
  });

  test("renders in the supplied order", () => {
    renderList([2, 0, 1]);
    expect(renderedNames()).toEqual(["charlie", "alpha", "bravo"]);
  });

  // The index handed to callbacks identifies the credential in the saved config,
  // and also keys its usage cache. If reordering shifted it, the operator would
  // edit whichever credential occupied that screen position and read another
  // one's quota — a silent wrong-target edit.
  test("keeps callback indices pointing at the original config entries", () => {
    const seen: Array<[string, number]> = [];
    render(
      <ThemeProvider>
        <ToastProvider>
          <ProviderKeyListCard
            items={items}
            displayOrder={[2, 0, 1]}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            getStats={() => ({ success: 0, failure: 0 })}
            getStatusBar={() => ({
              blocks: [],
              blockDetails: [],
              successRate: 0,
              totalSuccess: 0,
              totalFailure: 0,
            })}
            getDisplayModels={(item, index) => {
              seen.push([String(item.name), index]);
              return [];
            }}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    // Visited in display order, but each carries its configured position.
    expect(seen).toEqual([
      ["charlie", 2],
      ["alpha", 0],
      ["bravo", 1],
    ]);
  });

  // A malformed order must not drop or duplicate credentials: a card that
  // silently disappears is worse than one shown out of order.
  test.each([
    ["too short", [1, 0]],
    ["out of range", [0, 1, 5]],
    ["duplicated", [0, 0, 1]],
  ])("falls back to configured order when the order is %s", (_label, order) => {
    renderList(order as number[]);
    expect(renderedNames()).toEqual(["alpha", "bravo", "charlie"]);
  });
});
