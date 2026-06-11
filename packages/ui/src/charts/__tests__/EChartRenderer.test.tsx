import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { EChartRenderer } from "../EChartRenderer";

const resizeSpy = vi.hoisted(() => vi.fn());

vi.mock("echarts-for-react", async () => {
  const React = await import("react");

  const MockReactECharts = React.forwardRef<any, any>(function MockReactECharts(props, ref) {
    const instanceRef = React.useRef({
      getHeight: () => 0,
      getWidth: () => 0,
      hideLoading: vi.fn(),
      resize: resizeSpy,
      showLoading: vi.fn(),
    });

    React.useImperativeHandle(ref, () => ({
      getEchartsInstance: () => instanceRef.current,
    }));

    React.useEffect(() => {
      props.onChartReady?.(instanceRef.current);
    }, [props.onChartReady]);

    return <div className={props.className} data-testid="mock-echart" style={props.style} />;
  });

  return { default: MockReactECharts };
});

const setElementSize = (width: number, height: number) => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });
};

describe("EChartRenderer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resizeSpy.mockReset();
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  });

  test("defers forced resize calls while the initial animation guard is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setElementSize(640, 320);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    render(
      <ThemeProvider>
        <EChartRenderer option={{ series: [] }} className="h-80" initialAnimationGuardMs={800} />
      </ThemeProvider>,
    );

    await act(async () => undefined);

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(resizeSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(739);
    });
    expect(resizeSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(resizeSpy).toHaveBeenCalledTimes(1);
    expect(resizeSpy).toHaveBeenLastCalledWith({
      animation: { duration: 0 },
      height: 320,
      width: 640,
    });
  });
});
