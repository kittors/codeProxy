// satin-ui/vue 的公共底子：把 createXxx 包成 Vue 组件的 wrap()，主入口（vue/index.js）和重组件的子路径（vue/grid.js……）都从这里拿。
// · v-model：modelValue + update:modelValue（valueKey 是 v-model 绑的那一项，modelEvent 是哪个事件带新值；modelEvent 给 null 就不支持 v-model）
// · 模板 ref 拿到 Satin 实例（expose 出 instance）
// · SSR 安全：服务端输出和浏览器第一帧一样的标记（createXxx.html），水合以后再接交互；导入时不碰 document
// · 第一次挂载任何组件时自动调 setup()（Tooltip、浮层栈这些页面级行为），最后一个组件卸载时撤掉
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch, shallowRef } from "vue";
import { setup } from "../src/setup.js";

export const cx = (...a) => a.filter(Boolean).join(" ");
// 把 createXxx 包成 Vue 组件。props：组件的选项名；valueKey：v-model 绑定的那一项
// returns：这些事件要拿到监听的返回值（提示词输入框 @send 返回 Promise）：不写进 emits，直接调组件上的 onXxx
// also：某个事件同时再发成别的名字（{ modelChange: "update:model" }：v-model:model 用）
export function wrap(create, { name, props = [], valueKey = "value", events = ["change"], modelEvent = "change", returns = [], also = {} }) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: Object.fromEntries([...props, "modelValue"].map((p) => [p, { type: null, default: undefined }])),
    emits: [...events.filter((e) => !returns.includes(e)), ...Object.values(also), "update:modelValue"],
    setup(p, { emit, expose, attrs }) {
      const host = ref(null), inst = shallowRef(null);
      const opts = () => { const o = {}; for (const k of props) if (p[k] !== undefined) o[k] = p[k]; if (p.modelValue !== undefined) o[valueKey] = p.modelValue; return o; };
      const html = create.html(opts());
      let unsetup = null;
      onMounted(() => {
        unsetup = setup();
        const handlers = {};
        for (const ev of events) { const on = "on" + ev[0].toUpperCase() + ev.slice(1);
          handlers[on] = returns.includes(ev) ? (v) => { const fn = attrs[on]; return Array.isArray(fn) ? fn.map((f) => f(v))[0] : fn?.(v); } : (v) => { emit(ev, v); if (also[ev]) emit(also[ev], v); if (ev === modelEvent) emit("update:modelValue", v); }; }
        inst.value = create(host.value.firstElementChild, { ...opts(), ...handlers });
      });
      watch(opts, (o) => inst.value?.update(o), { deep: true });
      onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; unsetup?.(); });
      expose({ instance: inst });
      // returns 里的事件监听不挂到外层 div 上
      const own = () => { const a = { ...attrs }; for (const ev of returns) delete a["on" + ev[0].toUpperCase() + ev.slice(1)]; return a; };
      return () => h("div", { ...own(), ref: host, class: cx("sn-host", attrs.class), style: ["display: contents", attrs.style], innerHTML: html });
    },
  });
}
