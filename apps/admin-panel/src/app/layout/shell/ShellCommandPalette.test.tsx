import { afterEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard, Server } from "@code-proxy/ui/icons";
import { ThemeProvider } from "@code-proxy/ui";
import type { NavSection } from "./navModel";
import type { RouteNavigation } from "./useRouteNavigation";
import { ShellCommandPalette } from "./ShellCommandPalette";

const SECTIONS: readonly NavSection[] = [
  {
    id: "dashboard",
    i18nKey: "shell.nav_dashboard",
    icon: LayoutDashboard,
    single: true,
    items: [
      {
        menuCode: "dashboard",
        to: "/dashboard",
        i18nKey: "shell.nav_dashboard",
        icon: LayoutDashboard,
        permission: "dashboard.read",
        sortOrder: 10,
      },
    ],
  },
  {
    id: "group.system",
    i18nKey: "shell.nav_group_system",
    icon: Server,
    single: false,
    items: [
      {
        menuCode: "system.config",
        to: "/system/config",
        i18nKey: "shell.nav_config",
        icon: Server,
        permission: "system.config.read",
        sortOrder: 20,
      },
    ],
  },
];

function createNavMock(): RouteNavigation {
  return {
    pendingTo: "",
    progressDone: false,
    startNavigation: vi.fn(),
    handleNavClick: vi.fn(),
    warmPageRoute: vi.fn(),
  };
}

describe("ShellCommandPalette", () => {
  afterEach(() => {
    document.getElementById("cmdk-panel")?.remove();
    document.getElementById("cmdkScrim")?.remove();
  });

  test("stays unmounted until opened, opens via ⌘K shortcut, and executes page navigation", async () => {
    const nav = createNavMock();
    const onToggleSidebar = vi.fn();
    let currentOpen = false;
    const onOpenChange = vi.fn((next: boolean) => {
      currentOpen = next;
    });

    const view = render(
      <MemoryRouter>
        <ThemeProvider>
          <ShellCommandPalette
            open={currentOpen}
            onOpenChange={onOpenChange}
            sections={SECTIONS}
            isMobile={false}
            collapsed={false}
            nav={nav}
            onToggleSidebar={onToggleSidebar}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // 未打开时不向 document.body 注入隐藏命令面板 DOM。
    expect(document.getElementById("cmdk-panel")).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);

    view.rerender(
      <MemoryRouter>
        <ThemeProvider>
          <ShellCommandPalette
            open={true}
            onOpenChange={onOpenChange}
            sections={SECTIONS}
            isMobile={false}
            collapsed={false}
            nav={nav}
            onToggleSidebar={onToggleSidebar}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.getElementById("cmdk-panel")).not.toBeNull();
    });

    const configOption = screen.getByRole("option", { name: /Config|配置面板/i });
    await act(async () => {
      fireEvent.click(configOption);
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(nav.startNavigation).toHaveBeenCalledWith("/system/config");
  });
});
