import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AppearanceProvider, ThemeProvider } from "@code-proxy/ui";
import { AppearanceButton } from "../AppearanceButton";

const renderButton = () =>
  render(
    <ThemeProvider>
      <AppearanceProvider>
        <AppearanceButton />
      </AppearanceProvider>
    </ThemeProvider>,
  );

describe("AppearanceButton", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  test("the header palette button opens the appearance settings in the side drawer", async () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: /Appearance|外观|Внешний вид/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: /Appearance|外观|Внешний вид/ });
    // 设置正文是按需加载的，到位后能看到实时预览和风格卡片。
    expect(await within(drawer).findByTestId("appearance-preview")).toBeInTheDocument();
    const styles = within(drawer).getByRole("radiogroup", { name: /Style|风格|Стиль/ });

    // 默认就是多彩：「恢复默认」不可点；换成简约后全站立刻切换，「恢复默认」可以点了。
    const restore = within(drawer).getByRole("button", {
      name: /Restore defaults|恢复默认|Вернуть/,
    });
    expect(restore).toBeDisabled();
    fireEvent.click(within(styles).getByRole("radio", { name: /Quiet|简约|Сдержанный/ }));
    expect(document.documentElement.dataset.palette).toBe("quiet");
    expect(restore).toBeEnabled();

    fireEvent.click(restore);
    expect(document.documentElement.dataset.palette).toBe("colorful");
  });
});
