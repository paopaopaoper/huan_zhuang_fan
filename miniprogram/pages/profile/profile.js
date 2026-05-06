// pages/profile/profile.js
const app = getApp()
const db = wx.cloud.database()

// 广告单元ID（开通流量主后填入，空字符串=广告未上线）
const AD_UNIT_ID = ''
const AD_DAILY_LIMIT = 12

// 广告积分兑换说明
const HAIRSTYLE_COST = 4  // 发型：4积分/次
const TRYON_COST     = 2  // 换装：2积分/次

Page({
  data: {
    userInfo: null,
    // 分类剩余次数
    hairstyleRemaining: 0,
    tryonRemaining: 0,
    // 广告积分
    adPoints: 0,
    // 广告每日数据
    adDailyCount: 0,
    adDailyLeft: AD_DAILY_LIMIT,
    adDailyLimit: AD_DAILY_LIMIT,
    adProgressPercent: 0,   // 进度条百分比（预计算）
    adLoading: false,
    // 奖励统计
    sharedQuota: 0,
    inviteQuota: 0,
    shareCount: 0,
    inviteCount: 0,
    adCount: 0,
    // 积分兑换信息（供UI展示）
    hairstyleCost: HAIRSTYLE_COST,
    tryonCost: TRYON_COST,
    exchangeTipText: '',   // 积分兑换提示文字（预计算）
    // 登录弹窗
    showLogin: false,
    tempAvatarUrl: '',
    tempNickName: '',
    loginLoading: false,
    // 历史记录
    historyTab: 'tryon',
    historyList: [],
    tryonCount: 0,
    hairstyleCount: 0
  },

  onLoad: function () {
    this.loadQuotaInfo()
    this.loadUserInfo()
  },

  onShow: function () {
    this.loadQuotaInfo()
    this.loadUserInfo()
    if (app.globalData.userInfo) {
      this.loadHistory()
    }
  },

  // ——— 用户信息 ———
  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    if (userInfo) {
      this.setData({ userInfo })
    } else {
      this.setData({ userInfo: null })
    }
  },

  showLoginOverlay: function () {
    this.setData({ showLogin: true })
  },

  onLoginChooseAvatar: function (e) {
    if (e.detail.avatarUrl) {
      this.setData({ tempAvatarUrl: e.detail.avatarUrl })
    }
  },

  onLoginNicknameInput: function (e) {
    const v = e.detail.value
    if (v && v.trim()) this.setData({ tempNickName: v.trim() })
  },

  doLogin: function () {
    const { tempAvatarUrl, tempNickName, loginLoading } = this.data
    if (!tempAvatarUrl || !tempNickName || loginLoading) return
    this.setData({ loginLoading: true })

    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.png`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempAvatarUrl,
      success: uploadRes => {
        app.updateUserProfile(uploadRes.fileID, tempNickName).then(userInfo => {
          this.setData({ showLogin: false, tempAvatarUrl: '', tempNickName: '', loginLoading: false, userInfo })
          wx.showToast({ title: '登录成功', icon: 'success' })
          this.loadQuotaInfo()
          this.loadHistory()
        }).catch(() => {
          this.setData({ loginLoading: false })
          wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        })
      },
      fail: () => {
        this.setData({ loginLoading: false })
        wx.showToast({ title: '头像上传失败', icon: 'none' })
      }
    })
  },

  skipLogin: function () {
    this.setData({ showLogin: false })
  },

  onChooseAvatar: function (e) {
    const tempFilePath = e.detail.avatarUrl
    if (!tempFilePath) return
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.png`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: uploadRes => {
        app.updateUserProfile(uploadRes.fileID, this.data.userInfo?.nickName || '').then(userInfo => {
          this.setData({ userInfo })
          wx.showToast({ title: '头像已更新', icon: 'success' })
        }).catch(() => wx.showToast({ title: '头像更新失败', icon: 'none' }))
      },
      fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' })
    })
  },

  onNicknameInput: function (e) {
    const nickName = e.detail.value
    if (!nickName || !nickName.trim()) return
    const trimmedName = nickName.trim()
    if (this.data.userInfo && this.data.userInfo.nickName === trimmedName) return
    app.updateUserProfile(this.data.userInfo?.avatarUrl || '', trimmedName).then(userInfo => {
      this.setData({ userInfo })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
    }).catch(() => wx.showToast({ title: '昵称更新失败', icon: 'none' }))
  },

  // ——— 配额信息 ———
  loadQuotaInfo: function () {
    wx.cloud.callFunction({
      name: 'manageQuota',
      data: { action: 'query' },
      success: res => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data
          const adProgressPercent = Math.min(100, Math.round((d.adDailyCount || 0) / AD_DAILY_LIMIT * 100))
          const exchangeTipText = (d.adPoints || 0) > 0
            ? `当前 ${d.adPoints} 积分 · 可换发型 ${Math.floor(d.adPoints / HAIRSTYLE_COST)} 次 或 换装 ${Math.floor(d.adPoints / TRYON_COST)} 次`
            : ''
          this.setData({
            hairstyleRemaining: d.hairstyleRemaining || 0,
            tryonRemaining:     d.tryonRemaining     || 0,
            adPoints:           d.adPoints           || 0,
            adCount:            d.adCount            || 0,
            adDailyCount:       d.adDailyCount       || 0,
            adDailyLeft:        d.adDailyLeft !== undefined ? d.adDailyLeft : AD_DAILY_LIMIT,
            adProgressPercent:  adProgressPercent,
            sharedQuota:        d.sharedQuota        || 0,
            inviteQuota:        d.inviteQuota        || 0,
            shareCount:         d.shareCount         || 0,
            inviteCount:        d.inviteCount        || 0,
            exchangeTipText:    exchangeTipText
          })
          app.globalData.hairstyleRemaining = d.hairstyleRemaining
          app.globalData.tryonRemaining     = d.tryonRemaining
        }
      },
      fail: err => console.log('获取配额失败', err)
    })
  },

  // ——— 激励视频广告 ———
  watchAd: function () {
    if (this.data.adDailyLeft <= 0) {
      wx.showToast({ title: '今日广告已满，明天再来', icon: 'none' })
      return
    }

    // 广告未上线时的提示
    if (!AD_UNIT_ID) {
      wx.showModal({
        title: '广告功能即将上线',
        content: '感谢您的支持！广告功能正在开通中，上线后即可通过观看广告获取积分，用于兑换发型和换装次数。',
        showCancel: false,
        confirmText: '好的'
      })
      return
    }

    this.setData({ adLoading: true })

    const rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID })

    rewardedVideoAd.onLoad(() => {
      this.setData({ adLoading: false })
      rewardedVideoAd.show().catch(() => {
        wx.showToast({ title: '广告加载失败，请重试', icon: 'none' })
      })
    })

    rewardedVideoAd.onError(err => {
      this.setData({ adLoading: false })
      console.log('广告错误', err)
      wx.showToast({ title: '暂无广告，请稍后重试', icon: 'none' })
    })

    // 用户看完广告后回调
    rewardedVideoAd.onClose(res => {
      if (res && res.isEnded) {
        this._grantAdReward()
      } else {
        wx.showToast({ title: '请完整观看广告才能获得积分', icon: 'none' })
      }
    })
  },

  _grantAdReward: function () {
    wx.showLoading({ title: '积分发放中...' })
    wx.cloud.callFunction({
      name: 'manageQuota',
      data: { action: 'adReward' },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.code === 0) {
          const d = res.result.data
          // 根据新积分重新计算可兑换次数（给用户直观感知）
          const newAdPoints = d.adPoints || 0
          const hairstyleBonus = Math.floor(newAdPoints / HAIRSTYLE_COST)
          const tryonBonus     = Math.floor(newAdPoints / TRYON_COST)
          const adProgressPercent = Math.min(100, Math.round((d.adDailyCount || 0) / AD_DAILY_LIMIT * 100))
          const exchangeTipText = newAdPoints > 0
            ? `当前 ${newAdPoints} 积分 · 可换发型 ${Math.floor(newAdPoints / HAIRSTYLE_COST)} 次 或 换装 ${Math.floor(newAdPoints / TRYON_COST)} 次`
            : ''

          wx.showModal({
            title: '🎬 积分 +1！',
            content: `广告积分已累积到 ${newAdPoints} 分\n\n当前积分可兑换：\n• 换发型 ${hairstyleBonus} 次（每次4分）\n• 换装 ${tryonBonus} 次（每次2分）`,
            showCancel: false,
            confirmText: '好的'
          })
          this.setData({
            adPoints:           d.adPoints,
            adDailyLeft:        d.adDailyLeft !== undefined ? d.adDailyLeft : 0,
            adDailyCount:       d.adDailyCount || 0,
            adProgressPercent:  adProgressPercent,
            hairstyleRemaining: d.hairstyleRemaining,
            tryonRemaining:     d.tryonRemaining,
            exchangeTipText:    exchangeTipText
          })
          app.globalData.hairstyleRemaining = d.hairstyleRemaining
          app.globalData.tryonRemaining     = d.tryonRemaining
        } else {
          wx.showModal({
            title: '提示',
            content: res.result?.message || '积分发放失败，请重试',
            showCancel: false
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      }
    })
  },

  // ——— 历史记录 ———
  switchHistoryTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ historyTab: tab })
    this.loadHistory()
  },

  loadHistory: function () {
    const tab = this.data.historyTab
    db.collection('history').where({ type: 'tryon' }).count().then(res => {
      this.setData({ tryonCount: res.total })
    }).catch(() => {})
    db.collection('history').where({ type: 'hairstyle' }).count().then(res => {
      this.setData({ hairstyleCount: res.total })
    }).catch(() => {})

    db.collection('history')
      .where({ type: tab })
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()
      .then(res => {
        const list = res.data.map(item => {
          const d = item.createTime ? new Date(item.createTime) : new Date()
          item.dateStr = `${d.getMonth() + 1}/${d.getDate()}`
          return item
        })
        this.setData({ historyList: list })
      })
      .catch(() => this.setData({ historyList: [] }))
  },

  previewHistory: function (e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  goHistoryAll: function () {
    const tab = this.data.historyTab
    wx.navigateTo({ url: tab === 'tryon' ? '/pages/tryonHistory/tryonHistory' : '/pages/hairstyleHistory/hairstyleHistory' })
  },

  // ——— 分享/邀请 ———
  shareToFriends: async function () {
    try {
      const res = await app.addShareQuota()
      wx.showToast({ title: res.message || '获得3次！', icon: 'success' })
      this.loadQuotaInfo()
    } catch (e) {
      wx.showToast({ title: e.message || '今日已分享', icon: 'none' })
    }
  },

  inviteFriends: function () {
    wx.showModal({
      title: '邀请好友',
      content: '将小程序分享给好友，好友首次打开后你将获得5次免费机会（换发型/换装通用）',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  goTryonHistory: function () {
    wx.navigateTo({ url: '/pages/tryonHistory/tryonHistory' })
  },
  goHairstyleHistory: function () {
    wx.navigateTo({ url: '/pages/hairstyleHistory/hairstyleHistory' })
  },

  showAbout: function () {
    wx.showModal({
      title: '关于换装范',
      content: '换装范是一款AI智能换发型与虚拟试衣工具。\n\n版本：1.0.0\n\n功能：\n1. AI虚拟试衣\n2. AI换发型\n\n使用方法：\n上传照片，选择服装或发型，AI生成效果。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  feedback: function () {
    wx.showModal({
      title: '意见反馈',
      content: '如有问题或建议，请发送邮件至：\nsupport@huanzhuangfan.com',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  onShareAppMessage: function () {
    const openid = app.globalData.openId || wx.getStorageSync('userOpenId') || ''
    return {
      title: '换装范 - AI智能换发型与虚拟试衣',
      path: `/pages/index/index?inviter=${openid}`,
      imageUrl: '/images/share-image.png'
    }
  },
  onShareTimeline: function () {
    return {
      title: '换装范 - AI智能换发型与虚拟试衣',
      imageUrl: '/images/share-image.png'
    }
  }
})
