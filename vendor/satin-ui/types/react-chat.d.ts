// satin-ui/react/chat
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { ChatOptions, ChatApi, ThreadRailOptions, ThreadRailApi } from "./heavy";
export const Chat: React.ForwardRefExoticComponent<{ className?: string; style?: React.CSSProperties; id?: string;
  /** 自己画新对话那一块（第一条消息进来时一起淡出）；给了它 empty 就不用写 */
  renderEmpty?(): React.ReactNode } & ChatOptions & React.RefAttributes<SatinInstance & ChatApi>>;
/** 独立侧边定位刻度轨 */
export const ThreadRail: React.ForwardRefExoticComponent<{ className?: string; style?: React.CSSProperties; id?: string } & ThreadRailOptions & React.RefAttributes<SatinInstance & ThreadRailApi>>;
export type { ChatOptions, ChatProps, ChatHistory, ChatItem, ChatEmpty, ChatApi, ChatToolItem, ChatToolRenderer } from "./heavy";
