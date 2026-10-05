import { useCallback, useState, type KeyboardEvent } from "react";

/**
 * 密码框旁的「大写锁定已开启」提示。
 *
 * Caps Lock 只能从键盘事件里读到（getModifierState），页面刚打开、还没按过键时无从得知，
 * 所以初始为 false；失焦时复位，免得提示留在已经离开的输入框下面。把返回的三个处理函数
 * 展开到 input 上即可，可以同时挂在多个密码框上。
 */
export function useCapsLock() {
  const [capsLock, setCapsLock] = useState(false);

  const sync = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    // 自动填充、输入法合成派发的合成事件可能没有 getModifierState。
    if (typeof event.getModifierState !== "function") return;
    setCapsLock(event.getModifierState("CapsLock"));
  }, []);
  const reset = useCallback(() => setCapsLock(false), []);

  return { capsLock, onKeyDown: sync, onKeyUp: sync, onBlur: reset };
}
