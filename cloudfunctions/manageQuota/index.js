// 云函数：manageQuota
// 统一管理用户额度：查询/扣减/分享/邀请/广告奖励
// 经济模型（2026-05）：
//   换发型成本 ¥0.315/次 → 需4积分；换装成本 ¥0.200/次 → 需2积分
//   激励视频广告收益约 ¥0.10/次 → 1次广告=1积分
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const users = db.collection('users')

// ——— 经济模型常量 ———
const NEW_HAIRSTYLE_FREE = 2    // 新用户：换发型免费次数
const NEW_TRYON_FREE    = 3    // 新用户：换装免费次数

const HAIRSTYLE_COST   = 4    // 换发型：消耗广告积分数（¥0.315/次 ÷ ¥0.10 = 3.15 → 向上取整=4）
const TRYON_COST       = 2    // 换装：  消耗广告积分数（¥0.200/次 ÷ ¥0.10 = 2.0   → 2）

const AD_POINTS_PER_AD = 1    // 每次广告奖励积分
const AD_DAILY_LIMIT   = 12   // 每日最多看广告次数（12积分/天，最多换3次发型或6次换装）

exports.main = async (event) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  let userRecord = await ensureUser(openid)

  switch (action) {
    case 'query':
      return queryQuota(userRecord)

    case 'deduct':
      // event.type: 'hairstyle' | 'tryon'
      return deductQuota(openid, userRecord, event.type || 'tryon')

    case 'shareAdd':
      return addShareQuota(openid, userRecord)

    case 'inviteAdd':
      return addInviteQuota(openid, userRecord, event.invitedBy)

    case 'adReward':
      return addAdReward(openid, userRecord)

    default:
      return { code: -1, message: '未知操作类型' }
  }
}

// ——— 确保用户存在（新用户：发型2次 + 换装3次免费额度）———
async function ensureUser(openid) {
  const res = await users.where({ _openid: openid }).get()
  if (res.data.length > 0) return res.data[0]

  const newUser = {
    _openid: openid,
    nickName: '',
    avatarUrl: '',
    // 免费次数（分类独立）
    hairstyleFreeQuota: NEW_HAIRSTYLE_FREE,  // 发型免费2次
    tryonFreeQuota:     NEW_TRYON_FREE,       // 换装免费3次
    // 使用次数（分类统计）
    hairstyleUsed: 0,
    tryonUsed:     0,
    // 共用奖励（积分/邀请/分享均通用）
    sharedQuota:   0,   // 分享奖励（通用次数，不区分类型）
    inviteQuota:   0,   // 邀请奖励（通用次数）
    adPoints:      0,   // 广告积分（看广告累积，消耗换生成次数）
    // 广告统计
    adCount:       0,   // 累计看广告次数
    adDailyCount:  0,   // 今日看广告次数
    adDailyDate:   null,
    // 分享/邀请统计
    shareCount:    0,
    inviteCount:   0,
    invitedBy:     null,
    createTime:    db.serverDate()
  }
  const addRes = await users.add({ data: newUser })
  newUser._id = addRes._id
  return newUser
}

// ——— 查询配额 ———
function queryQuota(user) {
  const today = getTodayStr()
  const adDailyCount = (user.adDailyDate === today) ? (user.adDailyCount || 0) : 0
  const adDailyLeft  = Math.max(0, AD_DAILY_LIMIT - adDailyCount)

  return {
    code: 0,
    data: {
      // 发型剩余
      hairstyleRemaining: getHairstyleRemaining(user),
      hairstyleFreeQuota: user.hairstyleFreeQuota || 0,
      hairstyleUsed:      user.hairstyleUsed      || 0,
      // 换装剩余
      tryonRemaining:     getTryonRemaining(user),
      tryonFreeQuota:     user.tryonFreeQuota     || 0,
      tryonUsed:          user.tryonUsed          || 0,
      // 广告积分
      adPoints:           user.adPoints           || 0,
      hairstyleCost:      HAIRSTYLE_COST,
      tryonCost:          TRYON_COST,
      // 广告统计
      adCount:            user.adCount            || 0,
      adDailyCount:       adDailyCount,
      adDailyLeft:        adDailyLeft,
      adDailyLimit:       AD_DAILY_LIMIT,
      // 奖励统计
      sharedQuota:        user.sharedQuota        || 0,
      inviteQuota:        user.inviteQuota        || 0,
      shareCount:         user.shareCount         || 0,
      inviteCount:        user.inviteCount        || 0,
    }
  }
}

// ——— 扣减额度 ———
// type: 'hairstyle' | 'tryon'
async function deductQuota(openid, user, type) {
  const isHairstyle = (type === 'hairstyle')
  const remaining   = isHairstyle ? getHairstyleRemaining(user) : getTryonRemaining(user)
  const cost        = isHairstyle ? HAIRSTYLE_COST : TRYON_COST

  if (remaining <= 0) {
    return {
      code: -1,
      message: '次数不足',
      data: {
        hairstyleRemaining: getHairstyleRemaining(user),
        tryonRemaining:     getTryonRemaining(user)
      }
    }
  }

  // 优先消耗免费次数，免费用完再消耗广告积分
  const freeKey  = isHairstyle ? 'hairstyleFreeQuota' : 'tryonFreeQuota'
  const usedKey  = isHairstyle ? 'hairstyleUsed'      : 'tryonUsed'
  const freeLeft = user[freeKey] || 0

  const updateData = { [usedKey]: db.command.inc(1) }

  if (freeLeft > 0) {
    // 消耗一次免费次数
    updateData[freeKey] = db.command.inc(-1)
  } else {
    // 消耗广告积分（扣对应 cost 积分）
    updateData.adPoints = db.command.inc(-cost)
  }

  await users.where({ _openid: openid }).update({ data: updateData })

  // 计算新的剩余（本地估算）
  const updatedUser = { ...user, [usedKey]: (user[usedKey] || 0) + 1 }
  if (freeLeft > 0) {
    updatedUser[freeKey] = freeLeft - 1
  } else {
    updatedUser.adPoints = (user.adPoints || 0) - cost
  }

  return {
    code: 0,
    message: '扣减成功',
    data: {
      hairstyleRemaining: getHairstyleRemaining(updatedUser),
      tryonRemaining:     getTryonRemaining(updatedUser)
    }
  }
}

// ——— 分享加3次通用次数 ———
async function addShareQuota(openid, user) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastShareTime = user.lastShareTime ? new Date(user.lastShareTime) : null

  if (lastShareTime && lastShareTime >= today) {
    return { code: -1, message: '今日已分享过，明天再来吧', data: getRemaining(user) }
  }

  await users.where({ _openid: openid }).update({
    data: {
      sharedQuota: db.command.inc(3),
      shareCount:  db.command.inc(1),
      lastShareTime: db.serverDate()
    }
  })

  const updated = { ...user, sharedQuota: (user.sharedQuota || 0) + 3 }
  return { code: 0, message: '分享成功，获得3次免费机会！', data: getRemaining(updated) }
}

// ——— 邀请加5次通用次数 ———
async function addInviteQuota(openid, user, inviterOpenId) {
  if (!inviterOpenId) {
    return { code: -1, message: '无邀请人信息', data: getRemaining(user) }
  }
  if (user.invitedBy) {
    return { code: -1, message: '已处理过邀请', data: getRemaining(user) }
  }

  await users.where({ _openid: openid }).update({
    data: { invitedBy: inviterOpenId }
  })

  const inviterRes = await users.where({ _openid: inviterOpenId }).get()
  if (inviterRes.data.length > 0) {
    await users.where({ _openid: inviterOpenId }).update({
      data: {
        inviteQuota: db.command.inc(5),
        inviteCount: db.command.inc(1)
      }
    })
  }

  return { code: 0, message: '邀请成功！邀请人获得5次免费机会', data: getRemaining(user) }
}

// ——— 广告奖励：看完激励视频后加积分 ———
async function addAdReward(openid, user) {
  const today        = getTodayStr()
  const adDailyCount = (user.adDailyDate === today) ? (user.adDailyCount || 0) : 0

  if (adDailyCount >= AD_DAILY_LIMIT) {
    return {
      code: -1,
      message: `今日广告积分已达上限（${AD_DAILY_LIMIT}次），明天再来吧`,
      data: {
        adPoints:    user.adPoints || 0,
        adDailyLeft: 0,
        ...getRemaining(user)
      }
    }
  }

  const updateData = {
    adPoints:  db.command.inc(AD_POINTS_PER_AD),
    adCount:   db.command.inc(1),
    adDailyDate:  today
  }
  // 重置/累加今日计数
  if (user.adDailyDate !== today) {
    updateData.adDailyCount = 1
  } else {
    updateData.adDailyCount = db.command.inc(1)
  }

  await users.where({ _openid: openid }).update({ data: updateData })

  const newAdPoints      = (user.adPoints || 0) + AD_POINTS_PER_AD
  const newAdDailyCount  = adDailyCount + 1
  const updatedUser      = { ...user, adPoints: newAdPoints }

  return {
    code: 0,
    message: `广告积分 +${AD_POINTS_PER_AD}！`,
    data: {
      adPoints:           newAdPoints,
      adDailyLeft:        AD_DAILY_LIMIT - newAdDailyCount,
      adDailyCount:       newAdDailyCount,
      hairstyleRemaining: getHairstyleRemaining(updatedUser),
      tryonRemaining:     getTryonRemaining(updatedUser),
      hairstyleCost:      HAIRSTYLE_COST,
      tryonCost:          TRYON_COST
    }
  }
}

// ——— 剩余次数计算 ———

// 发型剩余 = 免费次数 + (sharedQuota + inviteQuota 转换) + adPoints÷HAIRSTYLE_COST 向下取整
function getHairstyleRemaining(user) {
  const freeLeft   = Math.max(0, user.hairstyleFreeQuota || 0)
  const bonusLeft  = Math.max(0, (user.sharedQuota || 0) + (user.inviteQuota || 0))
  const adLeft     = Math.floor(Math.max(0, user.adPoints || 0) / HAIRSTYLE_COST)
  return freeLeft + bonusLeft + adLeft
}

// 换装剩余 = 免费次数 + (sharedQuota + inviteQuota 转换) + adPoints÷TRYON_COST 向下取整
function getTryonRemaining(user) {
  const freeLeft   = Math.max(0, user.tryonFreeQuota || 0)
  const bonusLeft  = Math.max(0, (user.sharedQuota || 0) + (user.inviteQuota || 0))
  const adLeft     = Math.floor(Math.max(0, user.adPoints || 0) / TRYON_COST)
  return freeLeft + bonusLeft + adLeft
}

// 通用剩余（分享/邀请奖励时使用，不区分类型）
function getRemaining(user) {
  return {
    hairstyleRemaining: getHairstyleRemaining(user),
    tryonRemaining:     getTryonRemaining(user)
  }
}

// 获取今日日期字符串 YYYY-MM-DD
function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
