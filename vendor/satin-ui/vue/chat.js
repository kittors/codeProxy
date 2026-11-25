// satin-ui/vue/chat：对话（satin-ui/chat 的 createChat）包成的 Vue 组件。重组件单独一个子路径，不拉进 satin-ui/vue 主入口。
//   <script setup> import { Chat } from "satin-ui/vue/chat"; async function* respond(text) { yield "第三集可以拆成三段："; yield "车站外、候车厅、站台。"; } </script>
//   <Chat title="写作助手" placeholder="说点什么…" :respond="respond" />
// respond 接模型：异步生成器一段段 yield（或返回一整段文字）；每次都用最新的 respond。
// status 变了更新顶栏；history、title、placeholder、max、max-lines、attach 只在创建时用（要换一段对话就换 :key）。模板 ref 的 instance：send(text)、receive(item)……
// 新对话：:empty="{ icon, title, subtitle, suggestions }"；要自己画就写 #empty 插槽（画进空状态那一块，第一条消息进来时一起淡出）。
// 底部输入框：context（@context-change、@context-click）、mode（@mode-change）、models、v-model:model
import { defineComponent, h, ref, computed, shallowRef, onMounted, Teleport } from "vue";
import { createChat, createThreadRail } from "../src/data/chat.js";
import { wrap } from "./wrap.js";

const KEYS = ["title", "status", "placeholder", "max", "maxLines", "attach", "voice", "history", "composer", "respond", "hiRes", "empty", "context", "mode", "models", "model", "menu", "newChat", "rail", "meta", "actions", "caret", "traceMode", "toolStyle", "renderTool", "historyMode", "density", "userMarkdown", "markdown", "submitKey", "composerBlur", "composerResizable", "composerHeight"];
const Base = /* @__PURE__ */ wrap(createChat, { name: "SnChatInstance", props: KEYS, events: ["modelChange", "modeChange", "contextChange", "contextClick", "menu", "newChat"], modelEvent: null });
export const ThreadRail = /* @__PURE__ */ wrap(createThreadRail, { name: "SnThreadRail", props: ["side", "max"], events: ["select"], modelEvent: null });
export const Chat = /* @__PURE__ */ defineComponent({
  name: "SnChat", inheritAttrs: false,
  props: Object.fromEntries(KEYS.map((k) => [k, { type: null, default: undefined }])),
  emits: ["modelChange", "modeChange", "contextChange", "contextClick", "menu", "newChat", "update:model"],
  setup(p, { attrs, expose, slots, emit }) {
    const inner = ref(null), emptyEl = shallowRef(null);
    // 交给库的是固定的转发函数：父组件换了 respond 也用最新的
    const respond = (text, ctx) => p.respond?.(text, ctx), hiRes = (bg) => p.hiRes?.(bg) ?? bg;
    expose({ instance: computed(() => inner.value?.instance ?? null) });
    // #empty 插槽：库只留一个空容器（empty: true），子组件挂好以后（它的 onMounted 先跑）把插槽传送进去
    onMounted(() => { if (slots.empty) emptyEl.value = inner.value?.instance?.emptyEl ?? null; });
    const on = { onModelChange: (v) => { emit("modelChange", v); emit("update:model", v); }, onModeChange: (v) => emit("modeChange", v), onContextChange: (e) => emit("contextChange", e), onContextClick: (e) => emit("contextClick", e), onMenu: () => emit("menu"), onNewChat: () => emit("newChat") };
    return () => [
      h(Base, { ...attrs, ...p, ...on, empty: slots.empty ? true : p.empty, respond, hiRes: p.hiRes ? hiRes : undefined, ref: inner }),
      emptyEl.value && slots.empty ? h(Teleport, { to: emptyEl.value }, slots.empty()) : null,
    ];
  },
});
