/**
 * 通知状态管理
 * 使用 goey-toast 作为底层通知引擎
 */

import { create } from "zustand";
import type { ReactNode } from "react";
import { goeyToast } from "goey-toast";

interface ConfirmationOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary" | "secondary";
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

type NotificationType = "success" | "error" | "warning" | "info";

interface NotificationState {
  confirmation: {
    isOpen: boolean;
    isLoading: boolean;
    options: ConfirmationOptions | null;
  };
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  showConfirmation: (options: ConfirmationOptions) => void;
  hideConfirmation: () => void;
  setConfirmationLoading: (loading: boolean) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  confirmation: {
    isOpen: false,
    isLoading: false,
    options: null,
  },

  showNotification: (message, type = "info", duration) => {
    const options = duration ? { timing: { displayDuration: duration } } : {};

    switch (type) {
      case "success":
        goeyToast.success(message, options);
        break;
      case "error":
        goeyToast.error(message, options);
        break;
      case "warning":
        goeyToast.warning(message, options);
        break;
      case "info":
      default:
        goeyToast.info(message, options);
        break;
    }
  },

  removeNotification: () => {
    goeyToast.dismiss();
  },

  clearAll: () => {
    goeyToast.dismiss();
  },

  showConfirmation: (options) => {
    set({
      confirmation: {
        isOpen: true,
        isLoading: false,
        options,
      },
    });
  },

  hideConfirmation: () => {
    set((state) => ({
      confirmation: {
        ...state.confirmation,
        isOpen: false,
        options: null,
      },
    }));
  },

  setConfirmationLoading: (loading) => {
    set((state) => ({
      confirmation: {
        ...state.confirmation,
        isLoading: loading,
      },
    }));
  },
}));
