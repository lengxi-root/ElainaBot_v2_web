const clone = value => JSON.parse(JSON.stringify(value))
const now = () => new Date().toLocaleString('zh-CN', { hour12: false })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const accountBots = new Map()
const groupsByBot = new Map()
const settingsByBot = new Map()
const eventConfigByBot = new Map()
const ipWhitelistByBot = new Map()
const testersByBot = new Map()
let nextBotId = Date.now()

const notifications = [
  { id: 'n1', type: 'security', title: '机器人 AppSecret 即将到期', desc: '当前密钥将在 3 天后失效，请及时更新。', time: '2 分钟前', unread: true },
  { id: 'n2', type: 'system', title: 'QQ 机器人开放平台服务协议更新', desc: '建议确认并同意最新版本。', time: '1 小时前', unread: true },
  { id: 'n3', type: 'ops', title: '上周运营数据周报已生成', desc: '可前往运营数据查看详情。', time: '昨天 09:30', unread: false },
]

const marketBots = {
  work: [
    { name: '文件整理助手', desc: '智能分类整理文件，支持批量重命名与归档', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=file', hot: '12.8w' },
    { name: '短视频策划师', desc: '一键生成脚本、分镜与配乐推荐', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=video', hot: '12.8w' },
    { name: 'AI 工程师', desc: '辅助代码编写、调试与架构设计', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=engineer', hot: '12.8w' },
  ],
  chat: [
    { name: '情感陪伴师', desc: '温柔倾听，提供情绪疏导与心理支持', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=emotion', hot: '9.6w' },
    { name: '故事大王', desc: '海量故事库，支持自定义角色与剧情', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=story', hot: '8.2w' },
  ],
}

const ownedGroups = [
  { id: '743826192', name: '太空小孩的空间站', meta: '群主 · 218 人' },
  { id: '128493017', name: '产品体验官联盟', meta: '群主 · 142 人' },
  { id: '562810394', name: 'AI 技术研讨', meta: '群主 · 88 人' },
]

const ownedChannels = [
  { id: '1001536294', name: 'AI 体验官频道', meta: '频道主 · 312 成员' },
  { id: '1002457813', name: '机器人开发交流', meta: '频道主 · 186 成员' },
]

function botKey(payload, context) {
  return String(payload.botId ?? payload.botAppid ?? context.botId ?? '')
}

function accountKey(payload, context) {
  return String(payload.accountId ?? context.accountId ?? 'default')
}

function normalizeBot(bot, index) {
  const appid = String(bot.appid ?? bot.bot_appid ?? bot.id ?? nextBotId + index)
  return {
    id: Number(bot.id ?? appid) || nextBotId + index,
    appid,
    name: bot.name ?? bot.bot_name ?? '模拟机器人',
    desc: bot.desc ?? '',
    avatar: bot.avatar ?? bot.bot_avatar ?? null,
    online: Boolean(bot.online),
    service: bot.service ?? null,
    revoking: Boolean(bot.revoking),
  }
}

function ensureBots(payload, context) {
  const key = accountKey(payload, context)
  if (!accountBots.has(key)) {
    const source = context.bots?.length ? context.bots : (context.bot?.appid ? [context.bot] : [])
    accountBots.set(key, source.map(normalizeBot))
  }
  return accountBots.get(key)
}

function findBot(payload, context) {
  const id = botKey(payload, context)
  return ensureBots(payload, context).find(bot => String(bot.id) === id || bot.appid === id) || null
}

function ensureGroups(payload, context) {
  const key = botKey(payload, context)
  if (!groupsByBot.has(key)) groupsByBot.set(key, clone(ownedGroups))
  return groupsByBot.get(key)
}

function ensureSettings(payload, context) {
  const key = botKey(payload, context)
  if (!settingsByBot.has(key)) {
    settingsByBot.set(key, { allowFriend: true, friendRange: 'friends', allowGroup: true, approval: 'none' })
  }
  return settingsByBot.get(key)
}

function ensureEventConfig(payload, context) {
  const key = botKey(payload, context)
  if (!eventConfigByBot.has(key)) {
    eventConfigByBot.set(key, {
      channel: 'webhook',
      websocket: { endpoint: `wss://api.qqbot.qq.com/ws/${key || 'mock'}` },
      webhook: {
        url: 'https://bot.example.com/qq/callback',
        subscribed: ['friend.message', 'group.at_message', 'system.audit'],
      },
    })
  }
  return eventConfigByBot.get(key)
}

function ensureIpWhitelist(payload, context) {
  const key = botKey(payload, context)
  if (!ipWhitelistByBot.has(key)) {
    ipWhitelistByBot.set(key, [
      { ip: '111.231.45.20', note: '生产-华南', addedAt: now() },
      { ip: '120.241.18.10', note: '生产-华东', addedAt: now() },
    ])
  }
  return ipWhitelistByBot.get(key)
}

function ensureTesters(payload, context) {
  const key = botKey(payload, context)
  if (!testersByBot.has(key)) testersByBot.set(key, { users: [], groups: [], channels: [] })
  return testersByBot.get(key)
}

function updateBot(payload, context, patch) {
  const bot = findBot(payload, context)
  if (!bot) return null
  Object.assign(bot, patch)
  return clone(bot)
}

const withContext = payload => context => ({
  accountId: context.accountId,
  botId: context.botId,
  ...payload,
})

export const ADVANCED_MOCK_APIS = [
  { key: 'mock-bot-list', rpc: 'bot.getBotList', name: 'Mock · 机器人列表', description: '返回当前主体的本地模拟机器人列表。', payload: withContext({}) },
  { key: 'mock-bot-detail', rpc: 'bot.getBotDetail', name: 'Mock · 机器人详情', description: '返回当前机器人的本地模拟详情。', payload: withContext({}) },
  { key: 'mock-bot-create', rpc: 'bot.createBot', name: 'Mock · 创建机器人', description: '只在内存中创建模拟机器人，刷新页面后重置。', payload: withContext({ draft: { nick: '模拟机器人', desc: '本地 Mock 创建' }, service: null }) },
  { key: 'mock-bot-update', rpc: 'bot.updateBot', name: 'Mock · 更新机器人', description: '只更新本地模拟机器人字段。', payload: withContext({ patch: { name: '已更新的模拟机器人' } }) },
  { key: 'mock-bot-stop', rpc: 'bot.stopBot', name: 'Mock · 停止机器人', description: '将本地模拟机器人切换为离线。', payload: withContext({}) },
  { key: 'mock-bot-start', rpc: 'bot.startBot', name: 'Mock · 启动机器人', description: '将本地模拟机器人切换为在线。', payload: withContext({}) },
  { key: 'mock-bot-revoke', rpc: 'bot.revokeBot', name: 'Mock · 注销机器人', description: '只标记本地模拟机器人为注销中。', payload: withContext({}) },
  { key: 'mock-bot-cancel-revoke', rpc: 'bot.cancelRevoke', name: 'Mock · 撤回注销', description: '撤回本地模拟机器人的注销状态。', payload: withContext({}) },
  { key: 'mock-bot-connect-service', rpc: 'bot.connectService', name: 'Mock · 连接 AI 服务', description: '只在本地记录服务标识，不连接 QQ 服务端。', payload: withContext({ service: 'openclaw' }) },
  { key: 'mock-group-list', rpc: 'group.getGroupList', name: 'Mock · 群列表', description: '返回官方源码示例群列表。', payload: withContext({}) },
  { key: 'mock-group-remove', rpc: 'group.removeGroup', name: 'Mock · 移除群', description: '从本地模拟群列表移除一个群。', payload: withContext({ groupId: '743826192' }) },
  { key: 'mock-group-batch-remove', rpc: 'group.batchRemoveGroups', name: 'Mock · 批量移除群', description: '从本地模拟群列表批量移除群。', payload: withContext({ groupIds: ['743826192', '128493017'] }) },
  { key: 'mock-market-bots', rpc: 'market.getMarketBots', name: 'Mock · 机器人市场', description: '返回隐藏市场页面使用的演示机器人数据。', payload: () => ({ tab: 'work' }) },
  { key: 'mock-settings-get', rpc: 'settings.getSettings', name: 'Mock · 读取通用设置', description: '读取本地模拟的机器人设置。', payload: withContext({}) },
  { key: 'mock-settings-update', rpc: 'settings.updateSettings', name: 'Mock · 更新通用设置', description: '更新本地模拟设置。', payload: withContext({ patch: { allowGroup: false } }) },
  { key: 'mock-notify-list', rpc: 'notify.getNotifyList', name: 'Mock · 通知列表', description: '返回未接线通知中心使用的模拟通知。', payload: () => ({}) },
  { key: 'mock-notify-read', rpc: 'notify.markRead', name: 'Mock · 标记通知已读', description: '在内存中标记一条模拟通知为已读。', payload: () => ({ id: 'n1' }) },
  { key: 'mock-notify-read-all', rpc: 'notify.markAllRead', name: 'Mock · 全部通知已读', description: '在内存中标记全部模拟通知为已读。', payload: () => ({}) },
  { key: 'mock-event-get', rpc: 'eventConfig.get', name: 'Mock · 事件配置', description: '返回本地模拟的 WebSocket/Webhook 配置。', payload: withContext({}) },
  { key: 'mock-event-channel', rpc: 'eventConfig.updateChannel', name: 'Mock · 更新事件通道', description: '切换本地模拟事件接入方式。', payload: withContext({ channel: 'websocket' }) },
  { key: 'mock-event-webhook', rpc: 'eventConfig.updateWebhook', name: 'Mock · 更新 Webhook', description: '更新本地模拟 Webhook 地址。', payload: withContext({ url: 'https://example.com/qq/callback' }) },
  { key: 'mock-event-subscribed', rpc: 'eventConfig.updateSubscribed', name: 'Mock · 更新订阅事件', description: '更新本地模拟事件订阅列表。', payload: withContext({ subscribed: ['friend.message', 'group.at_message'] }) },
  { key: 'mock-ip-list', rpc: 'ipWhitelist.getList', name: 'Mock · IP 白名单', description: '返回本地模拟 IP 白名单。', payload: withContext({ botAppid: null }) },
  { key: 'mock-ip-add', rpc: 'ipWhitelist.add', name: 'Mock · 添加 IP', description: '向本地模拟白名单添加 IP。', payload: withContext({ botAppid: null, ip: '203.205.137.81', note: '测试机' }) },
  { key: 'mock-ip-remove', rpc: 'ipWhitelist.remove', name: 'Mock · 删除 IP', description: '从本地模拟白名单删除 IP。', payload: withContext({ botAppid: null, ip: '203.205.137.81' }) },
  { key: 'mock-tester-list', rpc: 'devTester.getList', name: 'Mock · 体验成员列表', description: '返回本地模拟体验用户、群和频道。', payload: withContext({}) },
  { key: 'mock-tester-add', rpc: 'devTester.addOne', name: 'Mock · 添加体验成员', description: '向本地模拟体验成员列表添加一项。', payload: withContext({ kind: 'users', id: '10001', note: '手动添加' }) },
  { key: 'mock-tester-add-many', rpc: 'devTester.addMany', name: 'Mock · 批量添加体验成员', description: '批量添加本地模拟体验成员。', payload: withContext({ kind: 'users', items: [{ id: '10002', note: '批量添加' }, { id: '10003', note: '批量添加' }] }) },
  { key: 'mock-tester-remove', rpc: 'devTester.remove', name: 'Mock · 删除体验成员', description: '按索引删除一项本地模拟体验成员。', payload: withContext({ kind: 'users', index: 0 }) },
  { key: 'mock-owned-groups', rpc: 'devTester.getOwnedGroups', name: 'Mock · 可选群列表', description: '返回体验成员选择器使用的模拟群。', payload: () => ({}) },
  { key: 'mock-owned-channels', rpc: 'devTester.getOwnedChannels', name: 'Mock · 可选频道列表', description: '返回体验成员选择器使用的模拟频道。', payload: () => ({}) },
].map(api => ({ ...api, source: 'mock', method: 'LOCAL MOCK', path: `mock://${api.rpc}` }))

export async function runAdvancedMock(rpc, payload, context) {
  await wait(120 + Math.floor(Math.random() * 120))
  let data

  switch (rpc) {
    case 'bot.getBotList':
      data = clone(ensureBots(payload, context))
      break
    case 'bot.getBotDetail':
      data = clone(findBot(payload, context))
      break
    case 'bot.createBot': {
      const bots = ensureBots(payload, context)
      const id = ++nextBotId
      const bot = {
        id,
        appid: String(id),
        name: payload.draft?.nick || '新机器人',
        desc: payload.draft?.desc || '',
        avatar: payload.draft?.avatar || null,
        online: Boolean(payload.service),
        service: payload.service || null,
        revoking: false,
      }
      bots.unshift(bot)
      data = clone(bot)
      break
    }
    case 'bot.updateBot':
      data = updateBot(payload, context, payload.patch || {})
      break
    case 'bot.stopBot':
      data = updateBot(payload, context, { online: false })
      break
    case 'bot.startBot':
      data = updateBot(payload, context, { online: true })
      break
    case 'bot.revokeBot':
      data = updateBot(payload, context, { revoking: true, online: false, deleteAt: '30 天后' })
      break
    case 'bot.cancelRevoke':
      data = updateBot(payload, context, { revoking: false, online: true, deleteAt: undefined })
      break
    case 'bot.connectService':
      data = updateBot(payload, context, { service: payload.service || null, online: true })
      break
    case 'group.getGroupList':
      data = clone(ensureGroups(payload, context))
      break
    case 'group.removeGroup': {
      const groups = ensureGroups(payload, context)
      const before = groups.length
      const index = groups.findIndex(group => String(group.id) === String(payload.groupId))
      if (index >= 0) groups.splice(index, 1)
      data = { removed: before - groups.length }
      break
    }
    case 'group.batchRemoveGroups': {
      const groups = ensureGroups(payload, context)
      const ids = new Set((payload.groupIds || []).map(String))
      const before = groups.length
      groupsByBot.set(botKey(payload, context), groups.filter(group => !ids.has(String(group.id))))
      data = { removed: before - groupsByBot.get(botKey(payload, context)).length }
      break
    }
    case 'market.getMarketBots':
      data = clone(marketBots[payload.tab] || [])
      break
    case 'settings.getSettings':
      data = clone(ensureSettings(payload, context))
      break
    case 'settings.updateSettings': {
      const settings = ensureSettings(payload, context)
      Object.assign(settings, payload.patch || {})
      data = clone(settings)
      break
    }
    case 'notify.getNotifyList':
      data = clone(notifications)
      break
    case 'notify.markRead': {
      const item = notifications.find(notification => notification.id === payload.id)
      if (item) item.unread = false
      data = clone(notifications)
      break
    }
    case 'notify.markAllRead':
      notifications.forEach(notification => { notification.unread = false })
      data = clone(notifications)
      break
    case 'eventConfig.get':
      data = clone(ensureEventConfig(payload, context))
      break
    case 'eventConfig.updateChannel': {
      const config = ensureEventConfig(payload, context)
      config.channel = payload.channel
      data = clone(config)
      break
    }
    case 'eventConfig.updateWebhook': {
      const config = ensureEventConfig(payload, context)
      config.webhook.url = payload.url
      data = clone(config)
      break
    }
    case 'eventConfig.updateSubscribed': {
      const config = ensureEventConfig(payload, context)
      config.webhook.subscribed = [...(payload.subscribed || [])]
      data = clone(config)
      break
    }
    case 'ipWhitelist.getList':
      data = clone(ensureIpWhitelist(payload, context))
      break
    case 'ipWhitelist.add': {
      const list = ensureIpWhitelist(payload, context)
      if (!list.some(item => item.ip === payload.ip)) {
        list.unshift({ ip: payload.ip, note: payload.note || '手动添加', addedAt: now() })
      }
      data = { ok: true, list: clone(list) }
      break
    }
    case 'ipWhitelist.remove': {
      const list = ensureIpWhitelist(payload, context)
      const index = list.findIndex(item => item.ip === payload.ip)
      if (index >= 0) list.splice(index, 1)
      data = clone(list)
      break
    }
    case 'devTester.getList':
      data = clone(ensureTesters(payload, context))
      break
    case 'devTester.addOne': {
      const testers = ensureTesters(payload, context)
      const list = testers[payload.kind]
      if (!Array.isArray(list)) throw new Error('kind 必须是 users、groups 或 channels')
      if (!list.some(item => String(item.id) === String(payload.id))) {
        list.unshift({ id: String(payload.id), note: payload.note || '手动添加', addedAt: now() })
      }
      data = { ok: true, list: clone(list) }
      break
    }
    case 'devTester.addMany': {
      const testers = ensureTesters(payload, context)
      const list = testers[payload.kind]
      if (!Array.isArray(list)) throw new Error('kind 必须是 users、groups 或 channels')
      let added = 0
      for (const item of payload.items || []) {
        if (!list.some(existing => String(existing.id) === String(item.id))) {
          list.unshift({ id: String(item.id), note: item.note || '', addedAt: now() })
          added += 1
        }
      }
      data = { added, list: clone(list) }
      break
    }
    case 'devTester.remove': {
      const testers = ensureTesters(payload, context)
      const list = testers[payload.kind]
      if (!Array.isArray(list)) throw new Error('kind 必须是 users、groups 或 channels')
      if (payload.index >= 0 && payload.index < list.length) list.splice(payload.index, 1)
      data = clone(list)
      break
    }
    case 'devTester.getOwnedGroups':
      data = clone(ownedGroups)
      break
    case 'devTester.getOwnedChannels':
      data = clone(ownedChannels)
      break
    default:
      throw new Error(`[mock] no handler for path: ${rpc}`)
  }

  return { code: 0, data }
}
