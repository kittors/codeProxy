import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createContext, useContext } from "react";
import { describe, expect, test } from "vitest";
import { SatinTable } from "../../index";

const CurrencyContext = createContext("USD");

function PriceCell({ amount }: { amount: number }) {
  const currency = useContext(CurrencyContext);
  return (
    <span data-testid={`price-${amount}`}>
      {currency} {amount.toFixed(2)}
    </span>
  );
}

describe("SatinTable React portal context integration", () => {
  test("preserves parent React Context inside custom cell renderers and supports sorting", async () => {
    const rows = [
      { id: "a", name: "Beta", amount: 20 },
      { id: "b", name: "Alpha", amount: 5 },
    ];

    render(
      <CurrencyContext.Provider value="CNY">
        <SatinTable
          plain
          rowKey="id"
          data={rows}
          columns={[
            { key: "name", title: "Name", sortable: true },
            {
              key: "amount",
              title: "Amount",
              align: "right",
              sortable: true,
              render: (_value, row) => <PriceCell amount={Number(row.amount)} />,
            },
          ]}
        />
      </CurrencyContext.Provider>,
    );

    expect(await screen.findByTestId("price-20")).toHaveTextContent("CNY 20.00");
    expect(screen.getByTestId("price-5")).toHaveTextContent("CNY 5.00");

    // 点击表头排序按钮，验证重排后 Context 与单元格节点依然正常挂载。
    const amountSort = screen.getByRole("button", { name: "Amount" });
    fireEvent.click(amountSort);

    await waitFor(() => {
      const renderedCells = screen.getAllByTestId(/^price-/);
      expect(renderedCells.map((el) => el.textContent)).toEqual(["CNY 5.00", "CNY 20.00"]);
    });
  });
});
