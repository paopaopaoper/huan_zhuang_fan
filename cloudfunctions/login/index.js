// 云函数：login
// 用户登录 / 更新资料：获取 openid，保存头像昵称，返回用户信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const users = db.collection('users')

// 新用户免费次数（分类）
const NEW_HAIRSTYLE_FREE = 2  // 换发型2次
const NEW_TRYON_FREE    = 3  // 换装3次

// 积分消耗
const HAIRSTYLE_COST = 4  // 换发型4积分/次
const TRYON_COST     = 2  // 换装2积分/次

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { avatarUrl, nickName } = event

  // 查找已有用户
  let userRes = await users.where({ _openid: openid }).get()

  if (userRes.data.length > 0) {
    // 已有用户 — 更新头像昵称（如果有传）
    const user = userRes.data[0]
    const updateData = {}

    if (avatarUrl) updateData.avatarUrl = avatarUrl
    if (nickName) updateData.nickName = nickName

    if (Object.keys(updateData).length > 0) {
      await users.where({ _openid: openid }).update({ data: updateData })
      Object.assign(user, updateData)
    }

    return formatResponse(user, false)
  }

  // 新用户 — 创建记录（使用新字段体系）
  const newUser = {
    _openid: openid,
    nickName: nickName || '',
    avatarUrl: avatarUrl || '',
    // 免费次数（分类独立）
    hairstyleFreeQuota: NEW_HAIRSTYLE_FREE,
    tryonFreeQuota:     NEW_TRYON_FREE,
    // 使用次数（分类统计）
    hairstyleUsed: 0,
    tryonUsed:     0,
    // 共用奖励
    sharedQuota:  0,
    inviteQuota:  0,
    adPoints:     0,
    // 广告统计
    adCount:      0,
    adDailyCount: 0,
    adDailyDate:  null,
    // 分享/邀请统计
    shareCount:   0,
    inviteCount:  0,
    invitedBy:    event.invitedBy || null,
    createTime:   db.serverDate()
  }

  const addRes = await users.add({ data: newUser })
  newUser._id = addRes._id

  return formatResponse(newUser, true)
}

function formatResponse(user, isNewUser) {
  const hairstyleRemaining = calcHairstyleRemaining(user)
  const tryonRemaining     = calcTryonRemaining(user)

  return {
    code: 0,
    data: {
      openid: user._openid,
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || '',
      // 新字段：分类次数
      hairstyleRemaining,
      tryonRemaining,
      adPoints: user.adPoints || 0,
      // 奖励统计
      sharedQuota: user.sharedQuota || 0,
      inviteQuota: user.inviteQuota || 0,
      shareCount:  user.shareCount  || 0,
      inviteCount: user.inviteCount || 0,
      isNewUser
    }
  }
}

function calcHairstyleRemaining(user) {
  const freeLeft  = Math.max(0, user.hairstyleFreeQuota || 0)
  const bonusLeft = Math.max(0, (user.sharedQuota || 0) + (user.inviteQuota || 0))
  const adLeft    = Math.floor(Math.max(0, user.adPoints || 0) / HAIRSTYLE_COST)
  return freeLeft + bonusLeft + adLeft
}

function calcTryonRemaining(user) {
  const freeLeft  = Math.max(0, user.tryonFreeQuota || 0)
  const bonusLeft = Math.max(0, (user.sharedQuota || 0) + (user.inviteQuota || 0))
  const adLeft    = Math.floor(Math.max(0, user.adPoints || 0) / TRYON_COST)
  return freeLeft + bonusLeft + adLeft
}
