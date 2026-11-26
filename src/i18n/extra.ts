/**
 * Strings that only the React + Astryx frontend needs. Deep-merged on top of
 * the shared Vue catalogs (see core.ts), so a nested object here only adds or
 * overrides the leaves it lists. App-only UI strings live under `astryx`;
 * the other namespaces fill leaves the React pages call but the Vue catalogs
 * do not define. Keep both locales in sync.
 */
export const extraMessages = {
  zh: {
    nav: {
      ops: '运维监控',
      plugins: '插件管理',
      proxies: '代理管理',
      promoCodes: '优惠码',
      promptAudit: '提示词审计',
      auditLog: '操作日志',
      orders: '订单管理',
      affiliateInviteRecords: '邀请记录',
      affiliateRebateRecords: '返利记录',
      affiliateTransferRecords: '提现记录',
    },
    astryx: {
      frontendUpdateAvailable: '前端有更新，刷新页面以加载',
      backendUpdateAvailable: '后端有更新',
      adminPanel: '管理后台',
      adminSection: '管理',
      navGroups: {
        users: '用户与运营',
        upstream: '账号与渠道',
        billing: '订单与卡券',
        audit: '监控与审计',
      },
      logoutSuccess: '已退出登录',
      notPortedTitle: '此页面尚未迁移',
      notPortedDescription: '新版界面正在逐步迁移，这个页面暂时还没有完成。',
      backToDashboard: '返回仪表盘',
      openInLegacyUi: '在旧版界面打开',
      switchLanguage: '切换语言',
      homeOneKey: '一个密钥',
      sourceNotices: '源码与许可',
      notFoundTitle: '页面不存在',
      notFoundDescription: '你访问的页面不存在或已被移除。',
      userFallback: '用户 #{id}',
      accountMappingInvalid: '模型映射须为 JSON 对象，模型名和目标名均须为非空字符串。',
      accountAuthorized: '已授权，重新授权',
      accountLocation: '服务区域',
      noAccountsDescription: '请调整筛选条件，或添加一个新账号。',
      keyUsage: {
        showKey: '显示密钥',
        hideKey: '隐藏密钥',
        durationMs: '{ms} 毫秒',
        status: {
          active: '正常',
          quotaExhausted: '额度已用尽',
          expired: '已过期',
          unknown: '未知',
        },
        window: {
          fiveHours: '5小时',
          daily: '日',
          sevenDays: '7天',
          weekly: '周',
          monthly: '月',
        },
        resetIn: {
          days: '{d}天{h}小时',
          hours: '{h}小时{m}分',
          minutes: '{m}分',
        },
      },
      batchImage: {
        customIdColumn: 'Custom ID',
        promptLabel: 'Prompt',
        apiKeyLabel: 'API Key',
        outputCountShort: 'x{n}',
        agentInstruction: `---
name: sub2api-batch-image
description: 当用户希望用 Gemini/Vertex 批量生成图片、批量跑提示词、下载批量生图结果、重试失败图片时使用。
---

你是 Codex 中的批量生图执行 Agent。用户不需要手动填写页面表单；你应从当前聊天、用户给的文件、目录或上下文中整理任务名称、prompt 列表和输出目录，只有缺少关键决策时才向用户提问。

默认端点：
{endpoint}

你需要自己完成：
1. 从用户聊天或附件中提取 prompt。每条 prompt 保留完整文本，按顺序生成稳定 custom_id，例如 img_001、img_002。
2. 从用户要求或上下文推断任务名称；没有明确名称时用当前时间生成任务名。
3. 从用户要求或上下文推断输出目录；如果用户没有说保存到哪里，才询问用户。
4. 提交前必须先计算 expected_output_count = 所有 item 的 output_count 之和。单个批量任务硬性最多 200 张输出图；超过 200 张必须拆成多组任务，不能提交一个超大任务，也不能把参考图附件上限当成生成张数上限。
5. 如果用户提供参考图，把参考图按用途绑定到具体 item。参考图只是输入附件，不是输出图数量。模型单条限制必须按模型执行：Gemini 2.5 Flash Image 每条最多 3 张参考图；Gemini 3 Pro Image 每条最多 14 张参考图。不要把后端附件风控理解成 Pro 单条能力：按 output_count 展开后，所有 item 的参考图附件总数还有内部保护阈值 1000 个，inline base64 参考图解码后总量最多 128MB。这个 1000 只是服务器拒绝异常请求的保护阈值，不是推荐规模；参考图很多或总请求体较大时应主动拆分任务。
6. 参考图会按 output_count 重复消耗输入 token；大量任务、重复复用同一张参考图或参考图总体积较大时，优先使用 gs:// file_uri 或拆分成多组任务。
7. 选择 API Key 和模型：先获取当前可用的批量生图 Key/模型；如果用户指定模型且该 Key 支持，则使用用户指定模型；否则使用该 Key 可用模型中的默认/第一个。不要展示或询问内部 provider 名称。
8. 调用批量生图 API 提交、轮询、下载，不要求用户去页面里手填。

API 调用规范：
- 模型：GET {modelsUrl}
- 提交：POST {submitUrl}
- 查询：GET {jobUrl}
- 明细：GET {itemsUrl}
- 下载：GET {downloadUrl}
- 取消：POST {cancelUrl}

提交请求体：
{
  "model": "<按所选 Key 可用模型填写>",
  "task_name": "<从聊天推断；为空则用当前时间>",
  "image_size": "1K",
  "response_mime_type": "image/png",
  "items": [
    {
      "custom_id": "img_001",
      "prompt": "<第一条完整 prompt>",
      "output_count": 1,
      "reference_images": [
        {
          "id": "face",
          "type": "subject",
          "mime_type": "image/png",
          "data": "<base64，不含 data:image/png;base64, 前缀>"
        }
      ]
    }
  ]
}

必须遵守：
- 不要把 API Key 写入仓库、日志、提交记录或最终回复。
- 不要把参考图 base64 写入最终回复、日志或公开文件。恢复记录中只保存参考图文件名、用途、数量和请求 JSON 文件路径；若请求 JSON 文件包含 base64，应保存在用户指定输出目录且不要提交到仓库。
- output_count 表示同一 prompt 和参考图重复生成几张，默认 1，每条最多 4；这不是依赖 Gemini 单次请求返回多图，而是系统展开成多个真实任务项。提交前必须确认预计输出图总数不超过 200，超过就拆分成多组任务。绝不能因为参考图附件有更高的内部保护阈值，就提交会生成超过 200 张图的任务。
- 当前对用户的批量生图计费仍按成功输出图片数量结算，不单独对参考图加价。可以向用户说明：参考图会产生少量上游输入 token 和临时存储成本，且会随 output_count 重复计算；页面显示的冻结/结算金额按输出图片数量计算。
- 提交成功后，必须立刻在输出目录写入本地恢复记录，例如 batch-image-resume.json。不要在恢复记录里保存 API Key。
- 恢复记录至少包含：endpoint、task_name、batch_id、model、output_dir、request_file、submitted_at、last_status、status_url、items_url、download_url、prompt_count、expected_output_count，以及可用于失败重试的 custom_id 到 prompt 映射或请求 JSON 文件路径。
- 每次查询状态后更新恢复记录，写入 last_checked_at、last_status、成功数、失败数、实际扣费和失败摘要。会话中断或暂停后，下次必须能凭该文件继续查询、下载或重试。
- 不要高频轮询。首次查询等待约 20 到 30 秒；queued 状态每 60 到 120 秒查询一次；如果连续 3 次仍是 queued，就先停止主动查询，告诉用户任务仍在排队，并保留恢复记录，之后可继续其他任务或等待用户稍后让你恢复。
- running 状态每约 60 秒查询一次，服务器压力大或大批量任务时可以更久；processing_results 等接近完成的状态可每 20 到 45 秒查询一次。
- 任务完成后报告任务名、任务 id、成功数、失败数、实际扣费和保存路径。
- 只下载成功图片。部分失败时，先展示失败 custom_id、错误码、错误来源和简要原因。
- 重试只能重试失败项，不能重复提交已成功项。若历史任务没有保存失败项 prompt，必须告诉用户无法自动重试，并询问用户是否提供原 prompt。
- 取消任务前必须提醒：已被系统索引为成功的图片仍会按成功项结算扣费，其余冻结金额会释放。
- 图片预览按需加载；不要为了查看列表自动批量加载图片内容。`,
      },
      // gaps-b:paymentFlow:zh (strings for paymentFlow; keep zh/en in sync)
      paymentFlow: {
        // end-paymentFlow-zh
      },
      // gaps-b:dashboardGaps:zh (strings for dashboardGaps; keep zh/en in sync)
      dashboardGaps: {
        // end-dashboardGaps-zh
      },
      // gaps-b:usersAdmin:zh (strings for usersAdmin; keep zh/en in sync)
      usersAdmin: {
        createUser: '创建用户',
        editUser: '编辑用户',
        emailRequired: '邮箱是必填项',
        passwordRequired: '密码是必填项',
        userCreated: '用户已创建',
        userUpdated: '用户已更新',
        bulkEdit: '批量编辑',
        bulkDelete: '批量删除',
        bulkEditConfirm: '确定要更新这 {count} 个用户吗？',
        bulkDeleteConfirm: '确定要删除这 {count} 个用户吗？',
        selected: '已选择 {count} 个用户',
        selectAtLeastOne: '请至少选择一项',
        viewApiKeys: '查看 API 密钥',
        allowedGroups: '允许的分组',
        deposit: '充值',
        withdraw: '提现',
        balanceHistory: '余额历史',
        platformQuotas: '平台配额',
        currentBalance: '当前余额',
        depositAmount: '充值金额',
        withdrawAmount: '提现金额',
        amountRequired: '请输入金额',
        insufficientBalance: '余额不足',
        newBalance: '新余额',
        noApiKeys: '暂无 API 密钥',
        noBalanceHistory: '暂无余额历史记录',
        noBalanceHistoryDescription: '该用户还没有任何余额变动记录',
        totalRecharged: '总充值',
        notes: '备注',
        notesPlaceholder: '输入备注（可选）',
        dailyLimit: '日限额',
        weeklyLimit: '周限额',
        monthlyLimit: '月限额',
        editQuota: '编辑配额',
        nullMeansUnlimited: '空值表示无限制',
        balanceType: '余额',
        affiliateBalanceType: '推荐人余额',
        adminBalanceType: '管理员余额',
        keyName: '密钥名称',
        keyValue: '密钥值',
        failedToLoadApiKeys: '加载 API 密钥失败',
        failedToLoadGroups: '加载分组失败',
        failedToLoadQuotas: '加载配额失败',
        // end-usersAdmin-zh
      },
      // gaps-b:accountsAdmin:zh (strings for accountsAdmin; keep zh/en in sync)
      accountsAdmin: {
        // end-accountsAdmin-zh
      },
      // gaps-b:groupsAdmin:zh (strings for groupsAdmin; keep zh/en in sync)
      groupsAdmin: {
        dialogs: {
          noUserFound: '未找到匹配的用户',
        },
        // end-groupsAdmin-zh
      },
      // gaps-c: admin proxies dialogs
      proxiesAdmin: {
        showPassword: '显示密码',
        hidePassword: '隐藏密码',
        copyFormats: '选择复制格式',
        selectedCount: '已选择 {count} 个代理',
        clearSelection: '取消选择',
      },
      // gaps-c: admin subscriptions dialogs
      subscriptionsAdmin: {
        guideDescColumn: '说明',
      },
      // gaps-c: admin plugins page
      pluginsAdmin: {
        columns: {
          name: '插件',
          actions: '操作',
        },
      },
      // gaps-c: admin promo codes dialogs
      promoAdmin: {
        usageUser: '用户 / 使用时间',
      },
      // gaps-c: admin usage page
      usageAdmin: {
        userIdPlaceholder: '输入用户 ID',
        modelPlaceholder: '输入模型名称',
        groupIdPlaceholder: '输入分组 ID',
        failedToLoadStats: '加载使用统计失败',
      },
    },
    usage: {
      records: '条记录',
      noUsage: '暂无使用记录',
      startUsingApi: '调用 API 后，使用记录会显示在这里。',
      allApiKeys: '全部 API Key',
    },
    channelMonitorV2: {
      subtitle: '查看各平台模型的可用性、首 Token 延迟和缓存率',
      lastUpdate: '数据更新至',
      overview: {
        status: '运行状态',
        online: '在线',
      },
      table: {
        status: '状态',
        requests: '请求数',
      },
    },
    payment: {
      orderCreated: '订单已创建',
      createOrderFailed: '创建订单失败',
      noPaymentMethods: '暂无可用的支付方式',
      admin: {
        searchOrders: '搜索订单...',
        allStatuses: '全部状态',
        allPaymentTypes: '全部支付方式',
        allOrderTypes: '全部订单类型',
        noOrdersFound: '没有找到订单',
        daySuffix: '天',
        orderDetail: '订单详情',
        orderType: '订单类型',
        balanceOrder: '充值订单',
        subscriptionOrder: '订阅订单',
        cancelOrderConfirm: '确定要取消该订单吗？',
        orderCancelled: '订单已取消',
        retry: '重试',
        retrySuccess: '重试成功',
        refund: '退款',
        approveRefund: '批准退款',
        retryRefund: '重试退款',
        queryRefundStatus: '查询退款状态',
        refundSuccess: '退款成功',
        refundPending: '退款处理中',
        refundAmount: '退款金额',
        refundReason: '退款原因',
        refundRequestInfo: '退款申请信息',
        refundRequestedAt: '申请时间',
        refundRequestedBy: '申请人',
        refundRequestReason: '申请原因',
        auditLogs: '操作日志',
        operator: '操作人',
        feeRate: '手续费率',
        expiresAt: '过期时间',
        paidAt: '支付时间',
        planName: '计划名称',
        group: '分组',
        price: '价格',
        validity: '有效期',
        forSale: '在售',
        sortOrder: '排序',
        createPlan: '创建计划',
        deletePlan: '删除计划',
        deletePlanConfirm: '确定要删除该计划吗？',
        groupMissing: '分组不存在',
        totalRevenue: '总收入',
        orderCount: '订单数',
        averageAmount: '平均金额',
        paymentDistribution: '支付方式分布',
        topUsers: '顶级用户',
        noData: '暂无数据',
      },
      status: {
        pending: '待支付',
        paid: '已支付',
        completed: '已完成',
        expired: '已过期',
        cancelled: '已取消',
        failed: '失败',
        refunded: '已退款',
        refund_requested: '退款申请中',
        refund_pending: '退款待处理',
        refund_failed: '退款失败',
      },
      methods: {
        alipay: '支付宝',
        wxpay: '微信支付',
        stripe: 'Stripe',
        airwallex: 'Airwallex',
      },
    },
    purchase: {
      paymentType: '购买类型',
    },
    keys: {
      title: 'API 密钥',
      nameLabel: '名称',
      apiKey: 'API 密钥',
      group: '分组',
      statusLabel: '状态',
      quota: '额度',
      lastUsedAt: '最后使用',
      totalKeys: '总密钥数：{count}',
      noKeys: '暂无密钥',
      createFirstKey: '创建您的第一个 API 密钥以开始使用 API。',
      noResultsTitle: '没有找到匹配的密钥',
      noResultsDescription: '调整搜索或筛选条件，或创建一个新密钥。',
      createKey: '创建密钥',
      editKey: '编辑密钥',
      deleteKey: '删除密钥',
      useKey: '使用密钥',
      importToCcSwitch: '导入到 CC Switch',
      copyToClipboard: '复制到剪贴板',
      refresh: '刷新',
      edit: '编辑',
      delete: '删除',
      allGroups: '全部分组',
      noGroup: '无分组',
      allStatus: '全部状态',
      active: '启用',
      inactive: '禁用',
      enable: '启用',
      disable: '禁用',
      bulkEditButton: '批量编辑',
      useCustomKey: '使用自定义密钥',
      customKeyPlaceholder: '输入自定义密钥（至少16个字符）',
      customKeyTooShort: '自定义密钥至少需要16个字符',
      customKeyInvalidChars: '自定义密钥只能包含字母、数字、下划线和短横线',
      customKeyRequired: '请输入自定义密钥',
      enableIPRestriction: 'IP 限制',
      ipWhitelist: 'IP 白名单',
      ipWhitelistPlaceholder: '每行一个 IP 地址或 CIDR',
      ipBlacklist: 'IP 黑名单',
      ipBlacklistPlaceholder: '每行一个 IP 地址或 CIDR',
      enableQuota: '额度',
      quotaPlaceholder: '输入额度（USD）',
      enableRateLimit: '限额',
      rateLimit5h: '5小时限额 (USD)',
      rateLimit1d: '日限额 (USD)',
      rateLimit7d: '7天限额 (USD)',
      rateLimitPlaceholder: '输入限额（USD）',
      enableExpiration: '有效期',
      expiresIn: '有效期',
      expires7Days: '7天',
      expires30Days: '30天',
      expires90Days: '90天',
      groupRequired: '请选择分组',
      selectGroup: '请选择分组',
      namePlaceholder: '输入密钥名称',
      searchPlaceholder: '搜索密钥...',
      bulkEdit: {
        title: '批量编辑',
        selectedCount: '已选择 {count} 个密钥',
        hint: '勾选需要修改的字段，未勾选的字段保持原值。',
        noFieldsEnabled: '请至少勾选一个字段',
        success: '已成功更新 {count} 个密钥',
        partialSuccess: '已更新 {success} 个密钥，{failed} 个失败',
        allFailed: '全部密钥更新失败',
        updateFailed: '更新失败',
        failedKeys: '失败的密钥',
      },
      deleteConfirm: '确定要删除密钥「{name}」吗？',
      deleteWarning: '删除后将无法恢复，请谨慎操作。',
      keyCreatedSuccess: '密钥已创建',
      keyUpdatedSuccess: '密钥已更新',
      keyDeletedSuccess: '密钥已删除',
      failedToCreate: '创建密钥失败',
      failedToUpdate: '更新密钥失败',
      failedToDelete: '删除密钥失败',
      copied: '已复制',
      ccSwitchNotInstalled: 'CC Switch 未安装',
      ccsClientSelect: {
        title: '选择导入客户端',
        description: '选择要导入的客户端',
        claudeCode: 'Claude Code',
        claudeCodeDesc: '在 Claude Code 中导入',
        geminiCli: 'Gemini CLI',
        geminiCliDesc: '在 Gemini CLI 中导入',
      },
      clickToChangeGroup: '点击修改分组',
      failedToChangeGroup: '修改分组失败',
      groupChangedSuccess: '分组已修改',
      noGroupFound: '未找到匹配的分组',
      searchGroup: '搜索分组...',
      useKeyModal: {
        title: '使用密钥',
        noGroupTitle: '无可用的分组配置',
        noGroupHint: '请联系管理员配置分组信息',
        opencode: {
          hint: '在 OpenCode 中打开此密钥的配置',
        },
      },
      endpoints: {
        available: '可用端点',
        title: '主端点',
        copied: '已复制',
        default: '默认',
        copy: '复制',
        speedTest: '测速',
      },
    },
    orders: {
      title: '我的订单',
      subtitle: '查看充值和订阅订单历史',
      orderId: '订单号',
      orderNo: '订单号',
      userId: '用户 ID',
      type: {
        label: '类型',
        balance: '充值',
        subscription: '订阅',
      },
      amount: '金额',
      payAmount: '支付金额',
      paymentMethod: '支付方式',
      baseAmount: '基础金额',
      fee: '手续费',
      bonusAmount: '奖励金额',
      creditedAmount: '实际到账',
      status: {
        label: '状态',
        pending: '待支付',
        paid: '已支付',
        recharging: '充值中',
        completed: '已完成',
        expired: '已过期',
        cancelled: '已取消',
        failed: '失败',
        refund_requested: '退款申请中',
        refunding: '退款中',
        refund_pending: '退款待处理',
        partially_refunded: '部分退款',
        refunded: '已退款',
        refund_failed: '退款失败',
      },
      createdAt: '创建时间',
      paidAt: '支付时间',
      pay: '去支付',
      cancel: '取消订单',
      allStatuses: '全部状态',
      filterByStatus: '按状态筛选',
      noOrders: '暂无订单',
      noOrdersDescription: '您还没有任何订单记录',
      failedToLoad: '加载订单失败',
    },
    availableChannels: {
      tryDifferentSearch: '没有匹配的渠道，换个关键词试试',
    },
    auth: {
      authentication: '登录',
    },
    common: {
      name: '名称',
      retry: '重试',
      status: '状态',
      active: '启用',
      inactive: '禁用',
      cancel: '取消',
      create: '创建',
      save: '保存',
      delete: '删除',
      previous: '上一页',
      next: '下一页',
      pageOf: '第 {current} 页，共 {total} 页',
      none: '无',
      enable: '启用',
      loadFailed: '加载失败',
      saveSuccess: '保存成功',
      saveFailed: '保存失败',
      deleteFailed: '删除失败',
      autoRefreshOn: '自动刷新：开',
      autoRefreshOff: '自动刷新：关',
      clearFilters: '清除筛选',
    },
    admin: {
      dashboard: {
        metric: '统计指标',
        topModels: 'Top 12 模型',
        topUsers: 'Top 12 用户',
      },
      users: {
        failedToUpdateStatus: '更新用户状态失败',
      },
      ops: {
        title: '运维监控',
        subtitle: '实时查看系统运行状态、请求吞吐量和错误分布',
        realtime: '实时监控',
        notice: '功能即将推出',
        comingSoon: '运维监控功能正在开发中，敬请期待。',
      },
      promptAudit: {
        title: '提示词审计',
        subtitle: '查看和审计用户提交的提示词内容',
        comingSoon: '提示词审计功能正在开发中。',
      },
      orders: {
        title: '订单管理',
        subtitle: '管理用户的充值和订阅订单',
        comingSoon: '订单管理功能正在开发中。',
        dashboard: {
          title: '订单概览',
          subtitle: '订单统计和趋势分析',
          period: '统计周期',
        },
        plans: {
          title: '支付计划',
          subtitle: '管理充值和订阅计划',
        },
      },
      affiliates: {
        title: '邀请返利',
        invites: {
          title: '邀请记录',
          subtitle: '查看用户邀请和返利记录',
        },
        invitesDescription: '查看用户邀请和返利记录',
        rebates: {
          title: '返利记录',
          subtitle: '管理返利发放和统计',
        },
        rebatesDescription: '管理返利发放和统计',
        transfers: {
          title: '提现记录',
          subtitle: '处理用户提现申请',
        },
        transfersDescription: '处理用户提现申请',
      },
      accounts: {
        setupToken: '设置令牌',
      },
      groups: {
        platforms: {
          composite: '组合路由',
        },
      },
      subscriptions: {
        fillRequired: '请填写用户 ID 和分组 ID',
        columns: {
          createdAt: '创建时间',
        },
        form: {
          userId: '用户 ID',
          userIdPlaceholder: '请输入用户 ID',
          groupId: '分组 ID',
          groupIdPlaceholder: '请输入订阅分组 ID',
        },
      },
      channelMonitor: {
        filterByProvider: '按供应商筛选',
        columns: {
          status: '状态',
        },
        stats: {
          total: '监控总数',
          available: '可用',
          enabled: '已启用',
          avgLatency: '平均延迟',
        },
      },
      riskControl: {
        baseUrlLabel: '审计接口地址',
      },
      redeem: {
        expiresInDaysLabel: '兑换码有效期（天）',
        status: {
          active: '可用',
          public: '公开',
          private: '私密',
          exhausted: '已用尽',
        },
      },
      announcements: {
        noAnnouncements: '暂无公告',
        noAnnouncementsDesc: '调整筛选条件，或创建一条新公告。',
      },
      settings: {
        saveSuccess: '设置保存成功',
        site: {
          siteLogoPlaceholder: 'https://example.test/logo.png',
          siteLogoHint: '填写 Logo 图片地址，留空则使用默认 Logo。建议使用 80x80px 的正方形图片。',
        },
        agreement: {
          title: '登录条款确认',
          description: '控制登录页是否要求用户先阅读并同意服务条款、隐私政策或其他 Markdown 文档。',
          enabled: '启用登录条款确认',
          displayMode: '展示形式',
          modal: '弹窗',
          checkbox: '复选框',
          checkboxHint: '复选框会显示在登录按钮下方，未勾选前所有登录入口禁用。',
          modalHint: '弹窗会在登录页打开，用户拒绝后所有登录入口保持禁用。',
          updatedDate: '条款更新日期',
          updatedDateHint: '日期或文档内容变化后，用户需要重新同意。',
          documents: '协议文档',
          documentsHint: '文档名称可自定义，内容按 Markdown 保存。可参考：服务条款、使用政策、支持的国家和地区、服务特定条款。',
          addDocument: '添加文档',
          untitledDocument: '未命名文档',
          documentTitle: '文档名称',
          documentTitlePlaceholder: '例如：服务条款',
          routeSlug: '路由标识',
          routeSlugHint: '文档的访问地址为 /legal/ 加上该标识，建议使用小写字母、数字和短横线。',
          content: 'Markdown 内容',
          contentPlaceholder: '在这里填写正式 Markdown 内容。',
          contentHint: '内容按 Markdown 渲染给用户。',
          documentsRequired: '启用登录条款确认时，至少需要保留一份文档。',
          documentTitleRequired: '登录条款文档名称不能为空。',
          duplicateRoute: '登录条款文档路由不能重复：{path}',
          defaultDocuments: {
            terms: '服务条款',
            'usage-policy': '使用政策',
            'supported-regions': '支持的国家和地区',
            'service-specific-terms': '服务特定条款',
          },
        },
        features: {
          registration: {
            title: '注册与访问',
            description: '控制新用户注册以及注册时的验证要求',
            enabled: '开放注册',
            enabledHint: '允许新用户注册',
            emailVerify: '邮箱验证',
            emailVerifyHint: '新用户注册时需要验证邮箱',
            invitationCode: '邀请码注册',
            invitationCodeHint: '开启后，用户注册时需要填写有效的邀请码',
            promoCode: '优惠码',
            promoCodeHint: '允许用户在注册时使用优惠码',
          },
          business: {
            title: '业务功能',
            description: '订阅、在线支付和邀请返利等业务功能',
            subscription: '订阅功能',
            subscriptionHint: '开启后用户端提供订阅套餐与「我的订阅」入口',
            payment: '在线支付',
            paymentHint: '开启后用户可在线充值和购买订阅',
          },
          platform: {
            title: '平台功能',
            description: '模型广场、可用渠道、渠道监控、风控中心和插件管理等平台功能',
          },
          affiliate: {
            invalidNumber: '请输入数字',
            wholeNumber: '请输入整数',
            fixNumbers: '请先修正标红的数字再保存',
            customUsers: {
              loadError: '加载专属用户失败',
              selectedCount: '已选择 {count} 位用户',
              clearSelection: '取消选择',
              batchRate: '批量设置比例',
            },
          },
        },
        registration: {
          enabled: '开放注册',
          enabledHint: '允许新用户注册',
          emailVerify: '邮箱验证',
          emailVerifyHint: '新用户注册时需要验证邮箱',
        },
        authentication: {
          title: '认证与会话',
          description: '登录认证方式与会话安全',
          totp: '双因素认证 (2FA)',
          totpHint: '允许用户使用 Google Authenticator 等应用进行二次验证',
          passkey: 'Passkey 登录',
          passkeyHint: '当依赖方配置有效时，允许无密码登录及用户自行管理 Passkey。',
          sessionBinding: '会话 IP/UA 绑定',
          sessionBindingHint: '将登录会话与客户端 IP 和 User-Agent 绑定，任一变化即强制该会话失效并需重新登录。',
          stepUp: '敏感操作二次验证 (step-up 2FA)',
          stepUpHint: '开启后，导出、备份、S3 配置修改、提升管理员等敏感操作需要先完成 TOTP 二次验证（15 分钟内有效）。',
          auditLogRetention: '操作日志保留天数',
          auditLogRetentionHint: '超过该天数的操作日志将被自动清理；填 0 表示永久保留（仅支持手动清空）。',
          saveHint: '同时保存上方「注册设置」里的开关。',
        },
        apiKeyAcl: {
          forwardedClientIpHeaderDuplicate: '已在列表中',
        },
        adminApiKey: {
          regenerateSuccess: '管理员 API Key 已重新生成',
          regenerateFailed: '重新生成管理员 API Key 失败',
          deleteSuccess: '管理员 API Key 已删除',
          deleteFailed: '删除管理员 API Key 失败',
          copied: '密钥已复制到剪贴板',
          copyFailed: '复制失败',
        },
        authSourceDefaults: {
          sourceUsers: {
            email: '邮箱密码注册用户',
            linuxdo: 'LinuxDo OAuth 用户',
            oidc: '通用 OIDC OAuth 用户',
            wechat: '微信 OAuth 用户',
            github: 'GitHub OAuth 用户',
            google: 'Google OAuth 用户',
            dingtalk: '钉钉 OAuth 用户',
          },
        },
        betaPolicy: {
          scopeApikey: '仅 API Key 账号',
        },
        openaiFastPolicy: {
          scopeApikey: '仅 API Key 账号',
          targetUsers: '指定用户',
          targetUsersHint: '输入任意邮箱关键词进行模糊搜索。留空表示对全部用户生效；选中用户的 API Key 请求优先匹配用户规则。',
        },
        payment: {
          productName: '商品名称',
          amountLimits: '金额限制',
          balanceAndRates: '余额与费率',
          alipaySettings: '支付宝设置',
          helpContent: '帮助内容',
          rateLimit: {
            rolling: '滚动',
            fixed: '固定',
          },
        },
        email: {
          testing: '测试中...',
          testConnection: '测试连接',
          testConnectionMissingFields: '请先填写 SMTP 主机和端口',
          testConnectionSuccess: 'SMTP 连接成功',
          testConnectionFailed: 'SMTP 连接测试失败',
          sending: '发送中...',
          sendTest: '发送测试邮件',
          testEmailMissingAddress: '请输入收件人邮箱地址',
          testEmailMissingFields: '请先填写 SMTP 主机、端口和发件人邮箱',
          testEmailSuccess: '测试邮件发送成功',
          testEmailFailed: '发送测试邮件失败',
          smtp: {
            title: 'SMTP 设置',
            description: '配置用于发送验证码和通知的邮件服务',
            host: 'SMTP 主机',
            port: 'SMTP 端口',
            username: 'SMTP 用户名',
            usernamePlaceholder: 'mailbox@example.test',
            password: 'SMTP 密码',
            passwordConfigured: '已配置',
            passwordPlaceholder: '输入 SMTP 密码',
            passwordPlaceholderConfigured: '密码已配置，留空以保留当前值',
            fromEmail: '发件人邮箱',
            fromName: '发件人名称',
            fromNamePlaceholder: 'Sub2API',
            useTls: '使用 TLS',
            useTlsHint: '为 SMTP 连接启用 TLS 加密',
          },
          testEmail: {
            title: '发送测试邮件',
            description: '发送测试邮件以验证 SMTP 配置',
            address: '收件人邮箱',
            addressPlaceholder: '输入收件人邮箱，例如 test@example.test',
          },
        },
        backup: {
          testing: '测试中...',
          testConnection: '测试连接',
          testConnectionMissingFields: '请先填写端点地址和存储桶',
          testConnectionSuccess: 'S3 连接测试成功',
          testConnectionFailed: 'S3 连接测试失败',
          s3: {
            title: 'S3 存储配置',
            description: '配置 S3 兼容存储（支持 Cloudflare R2），用于保存数据库备份',
            endpoint: '端点地址',
            endpointHint: 'S3 兼容服务的 API 地址，例如 AWS S3、Cloudflare R2 或 MinIO',
            region: '区域',
            regionHint: '存储桶所在区域；Cloudflare R2 可填写 auto',
            accessKeyId: 'Access Key ID',
            accessKeyIdPlaceholder: '输入 Access Key ID',
            secretAccessKey: 'Secret Access Key',
            secretKeyConfigured: '已配置',
            secretKeyPlaceholder: '输入 Secret Access Key',
            secretKeyPlaceholderConfigured: '已配置，留空保持不变',
            secretKeyHint: '出于安全考虑，已保存的密钥不会回显',
            bucket: '存储桶',
            bucketHint: '用于保存备份文件的存储桶名称',
            pathPrefix: 'Key 前缀',
            pathPrefixHint: '备份文件在存储桶中的路径前缀',
          },
          auto: {
            title: '定时备份',
            description: '按计划自动备份数据库',
            enabled: '启用定时备份',
            enabledHint: '开启后按下方 Cron 表达式自动创建备份',
            cronExpression: 'Cron 表达式',
            cronExpressionHint: '例如 "0 2 * * *" 表示每天凌晨 2 点',
            retentionDays: '备份过期天数',
            retentionDaysHint: '超过此天数的备份会被自动删除',
          },
          info: {
            title: '说明',
            item1: '备份为数据库全量备份，保存到上方配置的 S3 兼容存储。',
            item2: '保存前可先点击「测试连接」确认存储配置可用。',
            item3: '定时备份按 Cron 表达式执行，过期的备份会被自动清理。',
            item4: '手动创建、下载和恢复备份请前往「数据库备份」管理页。',
          },
        },
      },
    },
  },
  en: {
    nav: {
      ops: 'Operations',
      plugins: 'Plugins',
      proxies: 'Proxies',
      promoCodes: 'Promo Codes',
      promptAudit: 'Prompt Audit',
      auditLog: 'Audit Log',
      orders: 'Orders',
      affiliateInviteRecords: 'Invitation Records',
      affiliateRebateRecords: 'Rebate Records',
      affiliateTransferRecords: 'Withdrawal Records',
    },
    astryx: {
      frontendUpdateAvailable: 'Frontend update available. Refresh to load it.',
      backendUpdateAvailable: 'Backend update available.',
      adminPanel: 'Admin console',
      adminSection: 'Admin',
      navGroups: {
        users: 'Users & Engagement',
        upstream: 'Accounts & Channels',
        billing: 'Orders & Codes',
        audit: 'Monitoring & Audit',
      },
      logoutSuccess: 'Signed out',
      notPortedTitle: 'This page has not been migrated yet',
      notPortedDescription: 'The new interface is being migrated page by page; this one is not ready yet.',
      backToDashboard: 'Back to dashboard',
      openInLegacyUi: 'Open in the classic UI',
      switchLanguage: 'Switch language',
      homeOneKey: 'One key',
      sourceNotices: 'Source and licenses',
      notFoundTitle: 'Page not found',
      notFoundDescription: 'The page you are looking for does not exist or has been removed.',
      userFallback: 'User #{id}',
      accountMappingInvalid: 'Enter a JSON object with non-empty model names and target names.',
      accountAuthorized: 'Authorized · authorize again',
      accountLocation: 'Service location',
      noAccountsDescription: 'Try adjusting your filters or add a new account.',
      keyUsage: {
        showKey: 'Show key',
        hideKey: 'Hide key',
        durationMs: '{ms} ms',
        status: {
          active: 'Active',
          quotaExhausted: 'Quota Exhausted',
          expired: 'Expired',
          unknown: 'Unknown',
        },
        window: {
          fiveHours: '5H',
          daily: 'D',
          sevenDays: '7D',
          weekly: 'W',
          monthly: 'M',
        },
        resetIn: {
          days: '{d}d {h}h',
          hours: '{h}h {m}m',
          minutes: '{m}m',
        },
      },
      batchImage: {
        customIdColumn: 'Custom ID',
        promptLabel: 'Prompt',
        apiKeyLabel: 'API Key',
        outputCountShort: 'x{n}',
        agentInstruction: `---
name: sub2api-batch-image
description: Use when the user wants to batch-generate images with Gemini/Vertex, run prompts in bulk, download batch image results, or retry failed images.
---

You are the batch image execution agent in Codex. The user does not need to fill in the page form; collect the task name, prompt list and output directory from the current chat and from the files, folders or context the user provides, and only ask the user when a key decision is missing.

Default endpoint:
{endpoint}

You must do the following yourself:
1. Extract prompts from the chat or attachments. Keep the full text of every prompt and generate stable custom_ids in order, e.g. img_001, img_002.
2. Infer the task name from the user's request or context; if there is no explicit name, use the current time.
3. Infer the output directory from the user's request or context; only ask the user if they did not say where to save the results.
4. Before submitting, compute expected_output_count = the sum of every item's output_count. A single batch job is hard-capped at 200 output images; above 200 you must split the work into several jobs. Never submit one oversized job, and never treat the reference-image attachment limit as the number of images to generate.
5. If the user provides reference images, bind each one to specific items by purpose. Reference images are input attachments only, not output images. Per-item limits depend on the model: Gemini 2.5 Flash Image allows at most 3 reference images per item; Gemini 3 Pro Image allows at most 14. Do not mistake the backend attachment guard for Pro's per-item capability: after expanding by output_count, all reference-image attachments across all items are also subject to an internal protection threshold of 1000, and inline base64 reference images may total at most 128MB after decoding. The 1000 limit only lets the server reject abnormal requests; it is not a recommended scale. Split jobs proactively when there are many reference images or the request body is large.
6. Reference images consume input tokens again for every output_count; for large jobs, repeated reuse of the same reference image, or a large total reference size, prefer gs:// file_uri or split the work into several jobs.
7. Choose the API key and model: first fetch the batch image keys/models currently available; if the user named a model and the key supports it, use that model; otherwise use the default/first model available to the key. Do not show or ask about internal provider names.
8. Call the batch image API to submit, poll and download; do not ask the user to fill in the page manually.

API reference:
- Models: GET {modelsUrl}
- Submit: POST {submitUrl}
- Status: GET {jobUrl}
- Items: GET {itemsUrl}
- Download: GET {downloadUrl}
- Cancel: POST {cancelUrl}

Submit request body:
{
  "model": "<a model available to the selected key>",
  "task_name": "<inferred from the chat; current time when empty>",
  "image_size": "1K",
  "response_mime_type": "image/png",
  "items": [
    {
      "custom_id": "img_001",
      "prompt": "<full text of the first prompt>",
      "output_count": 1,
      "reference_images": [
        {
          "id": "face",
          "type": "subject",
          "mime_type": "image/png",
          "data": "<base64, without the data:image/png;base64, prefix>"
        }
      ]
    }
  ]
}

Rules:
- Never write the API key into the repository, logs, commits or your final reply.
- Never write reference-image base64 into your final reply, logs or public files. The resume record only stores reference image file names, purposes, counts and the request JSON file path; if the request JSON file contains base64, keep it in the user's output directory and never commit it to the repository.
- output_count is how many images to generate from the same prompt and reference images; default 1, at most 4 per item. It does not rely on Gemini returning several images per request; the system expands it into separate real items. Before submitting, confirm the expected number of output images does not exceed 200, and split into several jobs if it does. Never submit a job that would produce more than 200 images just because the reference attachment guard is higher.
- Batch image billing is still based on the number of successfully generated images; reference images are not charged extra. You may tell the user that reference images add a small amount of upstream input tokens and temporary storage cost, repeated per output_count, and that the hold/settled amount shown on the page is computed from the number of output images.
- Immediately after a successful submit, write a local resume record into the output directory, e.g. batch-image-resume.json. Never store the API key in it.
- The resume record must contain at least: endpoint, task_name, batch_id, model, output_dir, request_file, submitted_at, last_status, status_url, items_url, download_url, prompt_count, expected_output_count, plus a custom_id-to-prompt mapping or the request JSON file path for retrying failures.
- After every status check, update the resume record with last_checked_at, last_status, success count, failure count, actual charge and a failure summary. If the session is interrupted or paused, the next session must be able to continue querying, downloading or retrying from this file.
- Do not poll frequently. Wait about 20 to 30 seconds before the first check; while queued, check every 60 to 120 seconds; if the job is still queued after 3 consecutive checks, stop polling, tell the user the job is still queued, keep the resume record, and move on to other work or wait for the user to ask you to resume later.
- While running, check about every 60 seconds, or less often under heavy server load or for large jobs; near-complete states such as processing_results can be checked every 20 to 45 seconds.
- When the job completes, report the task name, job id, success count, failure count, actual charge and save path.
- Only download successful images. On partial failure, first show the failed custom_ids, error codes, error sources and short reasons.
- Retries may only resubmit failed items, never items that already succeeded. If a past job did not save the prompts of its failed items, tell the user it cannot be retried automatically and ask whether they can provide the original prompts.
- Before cancelling a job, warn that images already indexed as successful are still billed, and the rest of the hold is released.
- Load image previews on demand; never bulk-load image content just to view the list.`,
      },
      // gaps-b:paymentFlow:en (strings for paymentFlow; keep zh/en in sync)
      paymentFlow: {
        // end-paymentFlow-en
      },
      // gaps-b:dashboardGaps:en (strings for dashboardGaps; keep zh/en in sync)
      dashboardGaps: {
        // end-dashboardGaps-en
      },
      // gaps-b:usersAdmin:en (strings for usersAdmin; keep zh/en in sync)
      usersAdmin: {
        createUser: 'Create user',
        editUser: 'Edit user',
        emailRequired: 'Email is required',
        passwordRequired: 'Password is required',
        userCreated: 'User created',
        userUpdated: 'User updated',
        bulkEdit: 'Bulk edit',
        bulkDelete: 'Bulk delete',
        bulkEditConfirm: 'Update {count} users?',
        bulkDeleteConfirm: 'Delete {count} users?',
        selected: '{count} users selected',
        selectAtLeastOne: 'Select at least one option',
        viewApiKeys: 'View API keys',
        allowedGroups: 'Allowed groups',
        deposit: 'Deposit',
        withdraw: 'Withdraw',
        balanceHistory: 'Balance history',
        platformQuotas: 'Platform quotas',
        currentBalance: 'Current balance',
        depositAmount: 'Deposit amount',
        withdrawAmount: 'Withdraw amount',
        amountRequired: 'Amount is required',
        insufficientBalance: 'Insufficient balance',
        newBalance: 'New balance',
        noApiKeys: 'No API keys',
        noBalanceHistory: 'No balance history',
        noBalanceHistoryDescription: 'This user has no balance transactions yet',
        totalRecharged: 'Total recharged',
        notes: 'Notes',
        notesPlaceholder: 'Enter notes (optional)',
        dailyLimit: 'Daily limit',
        weeklyLimit: 'Weekly limit',
        monthlyLimit: 'Monthly limit',
        editQuota: 'Edit quota',
        nullMeansUnlimited: 'Null means unlimited',
        balanceType: 'Balance',
        affiliateBalanceType: 'Affiliate balance',
        adminBalanceType: 'Admin balance',
        keyName: 'Key name',
        keyValue: 'Key value',
        failedToLoadApiKeys: 'Failed to load API keys',
        failedToLoadGroups: 'Failed to load groups',
        failedToLoadQuotas: 'Failed to load quotas',
        // end-usersAdmin-en
      },
      // gaps-b:accountsAdmin:en (strings for accountsAdmin; keep zh/en in sync)
      accountsAdmin: {
        // end-accountsAdmin-en
      },
      // gaps-b:groupsAdmin:en (strings for groupsAdmin; keep zh/en in sync)
      groupsAdmin: {
        dialogs: {
          noUserFound: 'No matching users',
        },
        // end-groupsAdmin-en
      },
      // gaps-c: admin proxies dialogs
      proxiesAdmin: {
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        copyFormats: 'Copy format',
        selectedCount: '{count} proxies selected',
        clearSelection: 'Clear selection',
      },
      // gaps-c: admin subscriptions dialogs
      subscriptionsAdmin: {
        guideDescColumn: 'Description',
      },
      // gaps-c: admin plugins page
      pluginsAdmin: {
        columns: {
          name: 'Plugin',
          actions: 'Actions',
        },
      },
      // gaps-c: admin promo codes dialogs
      promoAdmin: {
        usageUser: 'User / used at',
      },
      // gaps-c: admin usage page
      usageAdmin: {
        userIdPlaceholder: 'Enter user ID',
        modelPlaceholder: 'Enter model name',
        groupIdPlaceholder: 'Enter group ID',
        failedToLoadStats: 'Failed to load usage statistics',
      },
    },
    usage: {
      records: 'records',
      noUsage: 'No usage records',
      startUsingApi: 'Usage records appear here after you call the API.',
      allApiKeys: 'All API Keys',
    },
    channelMonitorV2: {
      subtitle: 'Availability, first-token latency and cache rate per platform model',
      lastUpdate: 'Data through',
      overview: {
        status: 'Status',
        online: 'online',
      },
      table: {
        status: 'Status',
        requests: 'Requests',
      },
    },
    payment: {
      orderCreated: 'Order created',
      createOrderFailed: 'Failed to create order',
      noPaymentMethods: 'No payment methods available',
    },
    purchase: {
      paymentType: 'Purchase type',
    },
    keys: {
      title: 'API Keys',
      nameLabel: 'Name',
      apiKey: 'API Key',
      group: 'Group',
      statusLabel: 'Status',
      quota: 'Quota',
      lastUsedAt: 'Last Used',
      totalKeys: 'Total keys: {count}',
      noKeys: 'No keys',
      createFirstKey: 'Create your first API key to get started.',
      noResultsTitle: 'No keys found',
      noResultsDescription: 'Adjust your search or filters, or create a new key.',
      createKey: 'Create Key',
      editKey: 'Edit Key',
      deleteKey: 'Delete Key',
      useKey: 'Use Key',
      importToCcSwitch: 'Import to CC Switch',
      copyToClipboard: 'Copy to Clipboard',
      refresh: 'Refresh',
      edit: 'Edit',
      delete: 'Delete',
      allGroups: 'All Groups',
      noGroup: 'No Group',
      allStatus: 'All Status',
      active: 'Active',
      inactive: 'Inactive',
      enable: 'Active',
      disable: 'Inactive',
      bulkEditButton: 'Bulk Edit',
      useCustomKey: 'Use Custom Key',
      customKeyPlaceholder: 'Enter custom key (at least 16 characters)',
      customKeyTooShort: 'Custom key must be at least 16 characters',
      customKeyInvalidChars: 'Custom key can only contain letters, digits, underscores and hyphens',
      customKeyRequired: 'Enter a custom key',
      enableIPRestriction: 'IP Restriction',
      ipWhitelist: 'IP Whitelist',
      ipWhitelistPlaceholder: 'One IP address or CIDR per line',
      ipBlacklist: 'IP Blacklist',
      ipBlacklistPlaceholder: 'One IP address or CIDR per line',
      enableQuota: 'Quota',
      quotaPlaceholder: 'Enter quota (USD)',
      enableRateLimit: 'Rate Limit',
      rateLimit5h: '5-Hour Limit (USD)',
      rateLimit1d: 'Daily Limit (USD)',
      rateLimit7d: '7-Day Limit (USD)',
      rateLimitPlaceholder: 'Enter limit (USD)',
      enableExpiration: 'Expiration',
      expiresIn: 'Expires In',
      expires7Days: '7 Days',
      expires30Days: '30 Days',
      expires90Days: '90 Days',
      groupRequired: 'Please select a group',
      selectGroup: 'Select a group',
      namePlaceholder: 'Enter key name',
      searchPlaceholder: 'Search keys...',
      bulkEdit: {
        title: 'Bulk Edit',
        selectedCount: '{count} keys selected',
        hint: 'Check the fields to modify; unchecked fields keep their current values.',
        noFieldsEnabled: 'Check at least one field',
        success: '{count} keys updated successfully',
        partialSuccess: '{success} keys updated, {failed} failed',
        allFailed: 'All keys failed to update',
        updateFailed: 'Update failed',
        failedKeys: 'Failed keys',
      },
      deleteConfirm: 'Delete the key "{name}"?',
      deleteWarning: 'This action cannot be undone.',
      keyCreatedSuccess: 'Key created',
      keyUpdatedSuccess: 'Key updated',
      keyDeletedSuccess: 'Key deleted',
      failedToCreate: 'Failed to create key',
      failedToUpdate: 'Failed to update key',
      failedToDelete: 'Failed to delete key',
      copied: 'Copied',
      ccSwitchNotInstalled: 'CC Switch not installed',
      ccsClientSelect: {
        title: 'Select import client',
        description: 'Choose which client to import to',
        claudeCode: 'Claude Code',
        claudeCodeDesc: 'Import to Claude Code',
        geminiCli: 'Gemini CLI',
        geminiCliDesc: 'Import to Gemini CLI',
      },
      clickToChangeGroup: 'Click to change group',
      failedToChangeGroup: 'Failed to change group',
      groupChangedSuccess: 'Group changed',
      noGroupFound: 'No matching groups',
      searchGroup: 'Search groups...',
      useKeyModal: {
        title: 'Use Key',
        noGroupTitle: 'No group configuration available',
        noGroupHint: 'Contact your administrator to set up group information',
        opencode: {
          hint: 'Open this key configuration in OpenCode',
        },
      },
      endpoints: {
        available: 'Available Endpoints',
        title: 'Primary Endpoint',
        copied: 'Copied',
        default: 'Default',
        copy: 'Copy',
        speedTest: 'Speed Test',
      },
    },
    orders: {
      title: 'My Orders',
      subtitle: 'View your recharge and subscription order history',
      orderId: 'Order ID',
      type: {
        label: 'Type',
        balance: 'Recharge',
        subscription: 'Subscription',
      },
      amount: 'Amount',
      payAmount: 'Pay Amount',
      paymentMethod: 'Payment Method',
      status: {
        label: 'Status',
        pending: 'Pending',
        paid: 'Paid',
        recharging: 'Processing',
        completed: 'Completed',
        expired: 'Expired',
        cancelled: 'Cancelled',
        failed: 'Failed',
        refundRequested: 'Refund Requested',
        refunding: 'Refunding',
        refundPending: 'Refund Pending',
        partiallyRefunded: 'Partially Refunded',
        refunded: 'Refunded',
        refundFailed: 'Refund Failed',
      },
      createdAt: 'Created At',
      paidAt: 'Paid At',
      pay: 'Pay Now',
      allStatuses: 'All Statuses',
      filterByStatus: 'Filter by status',
      noOrders: 'No Orders',
      noOrdersDescription: 'You have no order history yet',
      failedToLoad: 'Failed to load orders',
    },
    availableChannels: {
      tryDifferentSearch: 'No matching channels. Try a different keyword.',
    },
    auth: {
      authentication: 'Sign in',
    },
    common: {
      name: 'Name',
      retry: 'Retry',
      status: 'Status',
      active: 'Active',
      inactive: 'Inactive',
      cancel: 'Cancel',
      create: 'Create',
      save: 'Save',
      delete: 'Delete',
      previous: 'Previous',
      next: 'Next',
      pageOf: 'Page {current} of {total}',
      none: 'None',
      enable: 'Enable',
      loadFailed: 'Failed to load',
      saveSuccess: 'Saved',
      saveFailed: 'Failed to save',
      deleteFailed: 'Failed to delete',
      autoRefreshOn: 'Auto refresh: on',
      autoRefreshOff: 'Auto refresh: off',
      clearFilters: 'Clear filters',
    },
    admin: {
      dashboard: {
        metric: 'Metric',
        topModels: 'Top 12 Models',
        topUsers: 'Top 12 Users',
      },
      users: {
        failedToUpdateStatus: 'Failed to update user status',
      },
      ops: {
        title: 'Operations Dashboard',
        subtitle: 'Real-time system health, throughput and error distribution',
        realtime: 'Real-time',
        notice: 'Coming Soon',
        comingSoon: 'Operations monitoring is under development.',
      },
      promptAudit: {
        title: 'Prompt Audit',
        subtitle: 'Review and audit user-submitted prompts',
        comingSoon: 'Prompt audit feature is under development.',
      },
      orders: {
        title: 'Order Management',
        subtitle: 'Manage user recharge and subscription orders',
        comingSoon: 'Order management is under development.',
        dashboard: {
          title: 'Orders Dashboard',
          subtitle: 'Order statistics and trends',
          period: 'Statistics period',
        },
        plans: {
          title: 'Payment Plans',
          subtitle: 'Manage recharge and subscription plans',
        },
      },
      payment: {
        admin: {
          searchOrders: 'Search orders...',
          allStatuses: 'All Statuses',
          allPaymentTypes: 'All Payment Types',
          allOrderTypes: 'All Order Types',
          noOrdersFound: 'No orders found',
          daySuffix: ' days',
          orderDetail: 'Order Details',
          orderType: 'Order Type',
          balanceOrder: 'Recharge Order',
          subscriptionOrder: 'Subscription Order',
          cancelOrderConfirm: 'Cancel this order?',
          orderCancelled: 'Order cancelled',
          retry: 'Retry',
          retrySuccess: 'Retry successful',
          refund: 'Refund',
          approveRefund: 'Approve Refund',
          retryRefund: 'Retry Refund',
          queryRefundStatus: 'Query Refund Status',
          refundSuccess: 'Refund successful',
          refundPending: 'Refund processing',
          refundAmount: 'Refund Amount',
          refundReason: 'Refund Reason',
          refundRequestInfo: 'Refund Request Info',
          refundRequestedAt: 'Requested At',
          refundRequestedBy: 'Requested By',
          refundRequestReason: 'Request Reason',
          auditLogs: 'Audit Logs',
          operator: 'Operator',
          feeRate: 'Fee Rate',
          expiresAt: 'Expires At',
          paidAt: 'Paid At',
          planName: 'Plan Name',
          group: 'Group',
          price: 'Price',
          validity: 'Validity',
          forSale: 'For Sale',
          sortOrder: 'Sort Order',
          createPlan: 'Create Plan',
          deletePlan: 'Delete Plan',
          deletePlanConfirm: 'Delete this plan?',
          groupMissing: 'Group Missing',
          totalRevenue: 'Total Revenue',
          orderCount: 'Order Count',
          averageAmount: 'Average Amount',
          paymentDistribution: 'Payment Distribution',
          topUsers: 'Top Users',
          noData: 'No Data',
        },
        status: {
          pending: 'Pending',
          paid: 'Paid',
          completed: 'Completed',
          expired: 'Expired',
          cancelled: 'Cancelled',
          failed: 'Failed',
          refunded: 'Refunded',
          refund_requested: 'Refund Requested',
          refund_pending: 'Refund Pending',
          refund_failed: 'Refund Failed',
        },
        methods: {
          alipay: 'Alipay',
          wxpay: 'WeChat Pay',
          stripe: 'Stripe',
          airwallex: 'Airwallex',
        },
      },
      affiliates: {
        title: 'Affiliate Rebates',
        invites: {
          title: 'Invitation Records',
          subtitle: 'View user invitations and referral records',
        },
        invitesDescription: 'View user invitations and referral records',
        rebates: {
          title: 'Rebate Records',
          subtitle: 'Manage rebate distribution and statistics',
        },
        rebatesDescription: 'Manage rebate distribution and statistics',
        transfers: {
          title: 'Withdrawal Records',
          subtitle: 'Process user withdrawal requests',
        },
        transfersDescription: 'Process user withdrawal requests',
      },
      accounts: {
        setupToken: 'Setup Token',
      },
      groups: {
        platforms: {
          composite: 'Composite',
        },
      },
      subscriptions: {
        fillRequired: 'Enter both the user ID and the group ID',
        columns: {
          createdAt: 'Created At',
        },
        form: {
          userId: 'User ID',
          userIdPlaceholder: 'Enter user ID',
          groupId: 'Group ID',
          groupIdPlaceholder: 'Enter subscription group ID',
        },
      },
      channelMonitor: {
        filterByProvider: 'Filter by provider',
        columns: {
          status: 'Status',
        },
        stats: {
          total: 'Total monitors',
          available: 'Available',
          enabled: 'Enabled',
          avgLatency: 'Average latency',
        },
      },
      riskControl: {
        baseUrlLabel: 'Base URL',
      },
      redeem: {
        expiresInDaysLabel: 'Code expires in (days)',
        status: {
          active: 'Active',
          public: 'Public',
          private: 'Private',
          exhausted: 'Exhausted',
        },
      },
      announcements: {
        noAnnouncements: 'No announcements',
        noAnnouncementsDesc: 'Adjust the filters or create a new announcement.',
      },
      settings: {
        saveSuccess: 'Settings saved successfully',
        site: {
          siteLogoPlaceholder: 'https://example.test/logo.png',
          siteLogoHint: 'Logo image URL. Leave empty to use the default logo. An 80x80px square image is recommended.',
        },
        agreement: {
          title: 'Login agreement',
          description: 'Control whether the login page requires users to accept Markdown policy documents first.',
          enabled: 'Enable login agreement',
          displayMode: 'Display mode',
          modal: 'Modal',
          checkbox: 'Checkbox',
          checkboxHint: 'The checkbox appears below the login button and gates all login actions.',
          modalHint: 'The modal opens on the login page and gates all login actions until accepted.',
          updatedDate: 'Updated date',
          updatedDateHint: 'Changing the date or content requires fresh consent.',
          documents: 'Agreement documents',
          documentsHint: 'Document titles are customizable and content is saved as Markdown.',
          addDocument: 'Add document',
          untitledDocument: 'Untitled document',
          documentTitle: 'Document title',
          documentTitlePlaceholder: 'Example: Terms of Service',
          routeSlug: 'Route slug',
          routeSlugHint: 'The document is served at /legal/ plus this slug. Use lowercase letters, digits and hyphens.',
          content: 'Markdown content',
          contentPlaceholder: 'Write the final Markdown content here.',
          contentHint: 'Rendered to users as Markdown.',
          documentsRequired: 'At least one document is required when login agreement is enabled.',
          documentTitleRequired: 'Login agreement document title cannot be empty.',
          duplicateRoute: 'Login agreement document routes cannot be duplicated: {path}',
          defaultDocuments: {
            terms: 'Terms of Service',
            'usage-policy': 'Usage Policy',
            'supported-regions': 'Supported Countries and Regions',
            'service-specific-terms': 'Service-Specific Terms',
          },
        },
        features: {
          registration: {
            title: 'Registration & Access',
            description: 'Control new user registration and its verification requirements',
            enabled: 'Enable Registration',
            enabledHint: 'Allow new users to register',
            emailVerify: 'Email Verification',
            emailVerifyHint: 'Require email verification for new registrations',
            invitationCode: 'Invitation Code Registration',
            invitationCodeHint: 'When enabled, users must enter a valid invitation code to register',
            promoCode: 'Promo Code',
            promoCodeHint: 'Allow users to use promo codes during registration',
          },
          business: {
            title: 'Business Features',
            description: 'Subscriptions, online payment and affiliate rebates',
            subscription: 'Subscriptions',
            subscriptionHint: 'When enabled, users can buy subscription plans and see "My Subscriptions"',
            payment: 'Online Payment',
            paymentHint: 'When enabled, users can recharge and buy subscriptions online',
          },
          platform: {
            title: 'Platform Features',
            description: 'Model plaza, available channels, channel monitor, risk control and plugin management',
          },
          affiliate: {
            invalidNumber: 'Enter a number',
            wholeNumber: 'Enter a whole number',
            fixNumbers: 'Fix the highlighted numbers before saving',
            customUsers: {
              loadError: 'Failed to load custom users',
              selectedCount: '{count} users selected',
              clearSelection: 'Clear selection',
              batchRate: 'Batch Set Rate',
            },
          },
        },
        registration: {
          enabled: 'Enable Registration',
          enabledHint: 'Allow new users to register',
          emailVerify: 'Email Verification',
          emailVerifyHint: 'Require email verification for new registrations',
        },
        authentication: {
          title: 'Authentication & Sessions',
          description: 'Sign-in methods and session security',
          totp: 'Two-Factor Authentication (2FA)',
          totpHint: 'Allow users to use authenticator apps like Google Authenticator',
          passkey: 'Passkey Sign-in',
          passkeyHint: 'Allow passwordless sign-in and user-managed passkeys when the relying party is configured.',
          sessionBinding: 'Session IP/UA Binding',
          sessionBindingHint: 'Bind sessions to the client IP and User-Agent; any change invalidates the session.',
          stepUp: 'Step-up 2FA for Sensitive Actions',
          stepUpHint: 'Require a TOTP check (valid 15 minutes) before exports, backups, S3 changes and admin promotion.',
          auditLogRetention: 'Audit Log Retention (days)',
          auditLogRetentionHint: 'Audit logs older than this are deleted automatically; 0 keeps them forever (manual clear only).',
          saveHint: 'Also saves the switches under Registration Settings above.',
        },
        apiKeyAcl: {
          forwardedClientIpHeaderDuplicate: 'Already in the list',
        },
        adminApiKey: {
          regenerateSuccess: 'Admin API key regenerated',
          regenerateFailed: 'Failed to regenerate admin API key',
          deleteSuccess: 'Admin API key deleted',
          deleteFailed: 'Failed to delete admin API key',
          copied: 'Key copied to clipboard',
          copyFailed: 'Copy failed',
        },
        authSourceDefaults: {
          sourceUsers: {
            email: 'Email/password users',
            linuxdo: 'LinuxDo OAuth users',
            oidc: 'Generic OIDC OAuth users',
            wechat: 'WeChat OAuth users',
            github: 'GitHub OAuth users',
            google: 'Google OAuth users',
            dingtalk: 'DingTalk OAuth users',
          },
        },
        betaPolicy: {
          scopeApikey: 'API Key accounts only',
        },
        openaiFastPolicy: {
          scopeApikey: 'API Key accounts only',
          targetUsers: 'Target users',
          targetUsersHint: 'Search by any email keyword. Leave empty to apply to all users; API key requests from selected users match user rules first.',
        },
        payment: {
          productName: 'Product Name',
          amountLimits: 'Amount Limits',
          balanceAndRates: 'Balance & Rates',
          alipaySettings: 'Alipay Settings',
          helpContent: 'Help Content',
          rateLimit: {
            rolling: 'Rolling',
            fixed: 'Fixed',
          },
        },
        email: {
          testing: 'Testing...',
          testConnection: 'Test Connection',
          testConnectionMissingFields: 'Enter the SMTP host and port first',
          testConnectionSuccess: 'SMTP connection successful',
          testConnectionFailed: 'SMTP connection test failed',
          sending: 'Sending...',
          sendTest: 'Send Test Email',
          testEmailMissingAddress: 'Please enter a recipient email address',
          testEmailMissingFields: 'Enter the SMTP host, port and sender email first',
          testEmailSuccess: 'Test email sent successfully',
          testEmailFailed: 'Failed to send test email',
          smtp: {
            title: 'SMTP Settings',
            description: 'Configure the mail service used for verification codes and notifications',
            host: 'SMTP Host',
            port: 'SMTP Port',
            username: 'SMTP Username',
            usernamePlaceholder: 'mailbox@example.test',
            password: 'SMTP Password',
            passwordConfigured: 'configured',
            passwordPlaceholder: 'Enter SMTP password',
            passwordPlaceholderConfigured: 'Password configured, leave empty to keep it',
            fromEmail: 'From Email',
            fromName: 'From Name',
            fromNamePlaceholder: 'Sub2API',
            useTls: 'Use TLS',
            useTlsHint: 'Enable TLS encryption for the SMTP connection',
          },
          testEmail: {
            title: 'Send Test Email',
            description: 'Send a test email to verify the SMTP configuration',
            address: 'Recipient Email',
            addressPlaceholder: 'Enter a recipient email, e.g. test@example.test',
          },
        },
        backup: {
          testing: 'Testing...',
          testConnection: 'Test Connection',
          testConnectionMissingFields: 'Enter the endpoint and bucket first',
          testConnectionSuccess: 'S3 connection test succeeded',
          testConnectionFailed: 'S3 connection test failed',
          s3: {
            title: 'S3 Storage',
            description: 'S3-compatible storage (Cloudflare R2 supported) for database backups',
            endpoint: 'Endpoint',
            endpointHint: 'API URL of the S3-compatible service, e.g. AWS S3, Cloudflare R2 or MinIO',
            region: 'Region',
            regionHint: 'Bucket region; use auto for Cloudflare R2',
            accessKeyId: 'Access Key ID',
            accessKeyIdPlaceholder: 'Enter Access Key ID',
            secretAccessKey: 'Secret Access Key',
            secretKeyConfigured: 'configured',
            secretKeyPlaceholder: 'Enter Secret Access Key',
            secretKeyPlaceholderConfigured: 'Configured, leave empty to keep it',
            secretKeyHint: 'For security, a saved secret is never shown again',
            bucket: 'Bucket',
            bucketHint: 'Name of the bucket that stores backup files',
            pathPrefix: 'Key Prefix',
            pathPrefixHint: 'Path prefix for backup files inside the bucket',
          },
          auto: {
            title: 'Scheduled Backup',
            description: 'Back up the database automatically on a schedule',
            enabled: 'Enable Scheduled Backup',
            enabledHint: 'When enabled, backups run on the cron expression below',
            cronExpression: 'Cron Expression',
            cronExpressionHint: 'e.g. "0 2 * * *" for every day at 2 AM',
            retentionDays: 'Retention Days',
            retentionDaysHint: 'Backups older than this are deleted automatically',
          },
          info: {
            title: 'Notes',
            item1: 'Backups are full database dumps saved to the S3-compatible storage above.',
            item2: 'Use "Test Connection" to check the storage settings before saving.',
            item3: 'Scheduled backups follow the cron expression; expired backups are removed automatically.',
            item4: 'Create, download and restore backups manually on the Database Backup page.',
          },
        },
      },
    },
  },
} as const
