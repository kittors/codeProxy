export type LandingTranslate = (key: string, options?: Record<string, unknown>) => string;

export interface LandingFeatureCopy {
  title: string;
  desc: string;
}

export interface LandingCopy {
  /** 当前部署的 API 根地址，用于终端示例与接入步骤；随部署域名自动变化，不写死。 */
  apiBaseUrl: string;
  hero: {
    badge: string;
    titleLine1: string;
    titleLine2: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    railTitle: string;
    railMore: string;
  };
  console: {
    title: string;
    logsTitle: string;
    kpis: readonly { label: string; value: string }[];
  };
  providers: { eyebrow: string; title: string };
  features: {
    eyebrow: string;
    title: string;
    subtitle: string;
    gateway: LandingFeatureCopy & { diagramLabel: string };
    usage: LandingFeatureCopy;
    logs: LandingFeatureCopy;
    quota: LandingFeatureCopy;
    pool: LandingFeatureCopy;
    plaza: LandingFeatureCopy;
  };
  workflow: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: readonly LandingFeatureCopy[];
    copy: string;
    copied: string;
  };
  closing: {
    title: string;
    subtitle: string;
    cta: string;
    secondary: string;
  };
  footer: {
    tagline: string;
    rights: string;
  };
}

/** 部署域名即 API 根地址；SSR / 测试环境下退回到线上默认值，保证文案永远可读。 */
export function resolveApiBaseUrl(): string {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "https://relay.example.com/v1";
  }
  return `${window.location.origin}/v1`;
}

export function buildLandingCopy(t: LandingTranslate): LandingCopy {
  const k = (key: string, defaultValue: string) =>
    t(`apikey_lookup.${key}`, { defaultValue });

  return {
    apiBaseUrl: resolveApiBaseUrl(),
    hero: {
      badge: k("landing_badge", "统一入口 · 实时可观测"),
      titleLine1: k("landing_title_line1", "一个入口"),
      titleLine2: k("landing_title_line2", "接入全部模型能力"),
      description: k(
        "landing_desc",
        "用一套 OpenAI 兼容的 API，统一调度 Claude、Gemini、GPT、Grok 等模型。内置用量统计、请求日志、配额限额与账号池轮换，改一行 base_url 即可接入。",
      ),
      primaryCta: k("landing_cta", "登录"),
      secondaryCta: k("landing_cta_secondary", "看看支持哪些模型"),
      railTitle: k("landing_rail_title", "已接入上游"),
      railMore: k("landing_rail_more", "查看全部 →"),
    },
    console: {
      title: k("landing_console_title", "控制台预览"),
      logsTitle: k("landing_console_logs", "最近请求"),
      kpis: [
        { label: k("landing_console_kpi_requests", "请求数"), value: "12,847" },
        { label: k("landing_console_kpi_tokens", "Token"), value: "38.4M" },
        { label: k("landing_console_kpi_cost", "费用"), value: "$126.30" },
      ],
    },
    providers: {
      eyebrow: k("landing_providers_eyebrow", "已接入"),
      title: k("landing_providers_title", "主流模型与客户端，开箱即用"),
    },
    features: {
      eyebrow: k("landing_features_eyebrow", "产品能力"),
      title: k("landing_features_title", "把多模型接入变成一件小事"),
      subtitle: k(
        "landing_features_subtitle",
        "从统一协议、用量核算到配额治理，网关该做的事都替你做完。",
      ),
      gateway: {
        title: k("landing_feature_gateway_title", "统一入口"),
        desc: k(
          "landing_feature_gateway_desc",
          "一个 base_url、一把 API Key，背后自动路由到不同厂商的模型。协议差异、鉴权方式、重试与降级都在网关内消化，业务侧只面对 OpenAI 一种调用方式。",
        ),
        diagramLabel: k("landing_feature_gateway_diagram", "你的应用"),
      },
      usage: {
        title: k("landing_feature_usage_title", "用量可观测"),
        desc: k("landing_feature_usage_desc", "请求数、Token 与费用按模型和时间维度实时统计。"),
      },
      logs: {
        title: k("landing_feature_logs_title", "请求日志"),
        desc: k("landing_feature_logs_desc", "逐条留存请求与回包，可按模型、状态、Key 筛选回看。"),
      },
      quota: {
        title: k("landing_feature_quota_title", "配额与限额"),
        desc: k("landing_feature_quota_desc", "按日 / 周 / 月设置消费上限，超额自动拦截。"),
      },
      pool: {
        title: k("landing_feature_pool_title", "账号池轮换"),
        desc: k("landing_feature_pool_desc", "多账号自动轮换与故障剔除，单账号限流不影响整体可用性。"),
      },
      plaza: {
        title: k("landing_feature_plaza_title", "模型广场"),
        desc: k("landing_feature_plaza_desc", "可用模型、能力标签与价格一览，选型前先比价。"),
      },
    },
    workflow: {
      eyebrow: k("landing_workflow_eyebrow", "接入方式"),
      title: k("landing_workflow_title", "三步接入，不改一行业务逻辑"),
      subtitle: k(
        "landing_workflow_subtitle",
        "任何 OpenAI SDK 都能直接指向 CliRelay，模型名一换即可切换厂商。",
      ),
      steps: [
        {
          title: k("landing_workflow_step1_title", "登录并创建 API Key"),
          desc: k("landing_workflow_step1_desc", "在门户里创建 Key，并按需设置消费上限。"),
        },
        {
          title: k("landing_workflow_step2_title", "替换 base_url"),
          desc: k("landing_workflow_step2_desc", "把 SDK 的服务地址指向网关，鉴权仍用标准 Bearer。"),
        },
        {
          title: k("landing_workflow_step3_title", "按模型名直接调用"),
          desc: k("landing_workflow_step3_desc", "换 model 字段即可切换厂商，用量与日志自动记录。"),
        },
      ],
      copy: k("landing_workflow_copy", "复制"),
      copied: k("landing_workflow_copied", "已复制"),
    },
    closing: {
      title: k("landing_closing_title", "现在就把多模型接入收敛到一个入口"),
      subtitle: k("landing_closing_subtitle", "登录后即可创建 API Key，几分钟完成接入。"),
      cta: k("landing_closing_cta", "免费开始使用"),
      secondary: k("landing_closing_secondary", "先看看有哪些模型"),
    },
    footer: {
      tagline: k("landing_footer_tagline", "OpenAI 兼容的统一模型网关"),
      rights: k("landing_footer_rights", "统一入口 · 用量可观测 · 配额可治理"),
    },
  };
}
