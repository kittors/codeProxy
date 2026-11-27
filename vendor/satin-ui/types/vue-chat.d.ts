// satin-ui/vue/chat
import type { DefineComponent } from "vue";
import type { ChatProps, ThreadRailOptions } from "./heavy";
/** 新对话可以用 #empty 插槽自己画；模型用 v-model:model（@update:model） */
export const Chat: DefineComponent<ChatProps>;
export const ThreadRail: DefineComponent<Omit<ThreadRailOptions, "onSelect">>;
export type { ChatOptions, ChatProps, ChatHistory, ChatItem, ChatEmpty, ChatApi, ChatToolItem, ChatToolRenderer } from "./heavy";
