// pages/index/index.js
const app = getApp()

Page({
  data: {
    hairstyleRemaining: 2,
    tryonRemaining: 3,
    // 登录弹窗
    showLogin: false,
    tempAvatarUrl: '',
    tempNickName: '',
    loginLoading: false
  },

  onLoad: function () {
    this.updateQuota()
    app.onQuotaLoaded = () => {
      this.updateQuota()
      // 检查是否需要弹出登录
      if (app.globalData.needLogin && !this.data.showLogin) {
        this.setData({ showLogin: true })
      }
    }
  },

  onShow: function () {
    this.updateQuota()
    // 每次显示首页时检查登录状态
    if (app.globalData.quotaLoaded && app.globalData.needLogin && !this.data.showLogin) {
      this.setData({ showLogin: true })
    }
  },

  updateQuota: function () {
    this.setData({
      hairstyleRemaining: app.globalData.hairstyleRemaining || 0,
      tryonRemaining: app.globalData.tryonRemaining || 0
    })
  },

  goTryon: function () {
    this._checkAndGo('tryon', '/pages/tryon/tryon')
  },

  goHairstyle: function () {
    this._checkAndGo('hairstyle', '/pages/hairstyle/hairstyle')
  },

  // 检查对应类型额度后跳转
  _checkAndGo: function (type, url) {
    const remaining = (type === 'hairstyle')
      ? app.globalData.hairstyleRemaining
      : app.globalData.tryonRemaining

    if (remaining <= 0) {
      wx.showModal({
        title: '次数已用完',
        content: '看广告获取积分，或分享朋友圈/邀请好友获得免费次数',
        confirmText: '去获取',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/profile/profile' })
          }
        }
      })
      return
    }
    wx.switchTab({ url })
  },

  // ——— 登录弹窗 ———
  onChooseAvatar: function (e) {
    const tempFilePath = e.detail.avatarUrl
    if (tempFilePath) {
      this.setData({ tempAvatarUrl: tempFilePath })
    }
  },

  onNicknameInput: function (e) {
    const nickName = e.detail.value
    if (nickName && nickName.trim()) {
      this.setData({ tempNickName: nickName.trim() })
    }
  },

  doLogin: function () {
    const { tempAvatarUrl, tempNickName, loginLoading } = this.data
    if (!tempAvatarUrl || !tempNickName || loginLoading) return

    this.setData({ loginLoading: true })

    // 1. 上传头像到云存储
    const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.png`
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempAvatarUrl,
      success: uploadRes => {
        const fileID = uploadRes.fileID
        // 2. 调用 login 云函数保存资料
        app.updateUserProfile(fileID, tempNickName).then(() => {
          this.setData({
            showLogin: false,
            tempAvatarUrl: '',
            tempNickName: '',
            loginLoading: false
          })
          wx.showToast({ title: '登录成功', icon: 'success' })
        }).catch(err => {
          console.log('登录失败', err)
          this.setData({ loginLoading: false })
          wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        })
      },
      fail: err => {
        console.log('头像上传失败', err)
        this.setData({ loginLoading: false })
        wx.showToast({ title: '头像上传失败', icon: 'none' })
      }
    })
  },

  skipLogin: function () {
    this.setData({ showLogin: false })
  },

  // ——— 分享 ———
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
  },

  inviteFriend: function () {
    wx.showModal({
      title: '邀请好友',
      content: '点击右上角"..."将小程序分享给好友，好友首次打开后你将获得5次免费机会',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
