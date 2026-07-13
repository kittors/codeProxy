import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  isChunkLoadError,
  recoverFromChunkLoadError,
} from "@pages/chunkLoadRecovery";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  isChunkError: boolean;
  reloading: boolean;
};

/**
 * Catches rejected lazy route imports that bubble past Suspense.
 * Stale post-deploy chunks trigger a single hard reload; other errors show a
 * minimal recovery surface instead of a permanent white screen.
 */
export class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    isChunkError: false,
    reloading: false,
  };

  static getDerivedStateFromError(error: unknown): State {
    const isChunkError = isChunkLoadError(error);
    return {
      hasError: true,
      isChunkError,
      reloading: isChunkError,
    };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    if (isChunkLoadError(error)) {
      const reloading = recoverFromChunkLoadError(error);
      if (!reloading) {
        this.setState({ reloading: false });
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.state.isChunkError && this.state.reloading) {
      return null;
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600 dark:text-slate-300">
        <p>
          {this.state.isChunkError
            ? "页面资源已更新，请刷新浏览器后重试。"
            : "页面加载失败，请刷新浏览器后重试。"}
        </p>
        <button
          type="button"
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          onClick={this.handleReload}
        >
          刷新页面
        </button>
      </div>
    );
  }
}
