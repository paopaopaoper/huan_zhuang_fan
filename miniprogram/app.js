// app.js
App({
  onLaunch: function (options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: 'cloud1-d8gdrvm0l998d4c00',
      traceUser: true,
    })

    this.globalData = {
      userInfo: null,
      openId: null,
      hairstyleRemaining: 2,  // 发型剩余次数（新用户2次）
      tryonRemaining: 3,       // 换装剩余次数（新用户3次）
      quotaLoaded: false,
      needLogin: false,        // 是否需要弹出登录提示
      inviterOpenId: null     // 邀请人ID（从分享链接进入时设置）
    }

    // 处理邀请场景：从分享链接进入
    if (options && options.query && options.query.inviter) {
      this.globalData.inviterOpenId = options.query.inviter
    }

    // 自动登录：获取 openid + 用户信息
    this.autoLogin()
  },

  onShow: function (options) {
    // 从分享卡片进入时处理邀请
    if (options && options.query && options.query.inviter) {
      this.globalData.inviterOpenId = options.query.inviter
    }
  },

  // ——— 自动登录（静默获取 openid） ———
  autoLogin: function () {
    wx.cloud.callFunction({
      name: 'login',
      data: {
        // 如果有邀请人，传给云函数
        invitedBy: this.globalData.inviterOpenId || null
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data
          // 存储 openid 到本地（用于分享邀请链接）
          wx.setStorageSync('userOpenId', d.openid)
          // 更新全局数据
          this.globalData.openId             = d.openid
          this.globalData.hairstyleRemaining = d.hairstyleRemaining || 0
          this.globalData.tryonRemaining     = d.tryonRemaining     || 0

          // 用户信息（有昵称头像才算已登录）
          if (d.nickName && d.avatarUrl) {
            this.globalData.userInfo = {
              nickName: d.nickName || '',
              avatarUrl: d.avatarUrl || ''
            }
            wx.setStorageSync('userInfo', this.globalData.userInfo)
            this.globalData.needLogin = false
          } else {
            // 没有昵称头像 → 需要登录
            this.globalData.needLogin = true
          }

          // 新用户 + 有邀请人 → 触发邀请奖励
          if (d.isNewUser && this.globalData.inviterOpenId) {
            this.processInvite(this.globalData.inviterOpenId)
          }

          this.globalData.quotaLoaded = true
          if (typeof this.onQuotaLoaded === 'function') {
            this.onQuotaLoaded()
          }
        }
      },
      fail: err => {
        console.log('自动登录失败', err)
        this.globalData.needLogin = true
        // 登录失败仍尝试加载配额
        this.loadUserQuota()
      }
    })
  },

  // 处理邀请奖励（给邀请人加5次）
  processInvite: function (inviterOpenId) {
    wx.cloud.callFunction({
      name: 'manageQuota',
      data: { action: 'inviteAdd', invitedBy: inviterOpenId },
      success: res => {
        if (res.result && res.result.code === 0) {
          console.log('邀请奖励已发放给邀请人')
        }
      },
      fail: err => console.log('邀请奖励失败', err)
    })
  },

  // 更新用户资料（头像/昵称）— 登录成功后调用
  updateUserProfile: function (avatarUrl, nickName) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: { avatarUrl, nickName },
        success: res => {
          if (res.result && res.result.code === 0) {
            const d = res.result.data
            this.globalData.userInfo = {
              nickName: d.nickName || '',
              avatarUrl: d.avatarUrl || ''
            }
            this.globalData.needLogin = false
            wx.setStorageSync('userInfo', this.globalData.userInfo)
            resolve(this.globalData.userInfo)
          } else {
            reject(new Error(res.result?.message || '更新失败'))
          }
        },
        fail: err => reject(err)
      })
    })
  },

  // 加载用户配额（备用，autoLogin 成功后不需要单独调用）
  loadUserQuota: function () {
    const that = this
    wx.cloud.callFunction({
      name: 'manageQuota',
      data: { action: 'query' },
      success: res => {
        if (res.result && res.result.code === 0) {
          const d = res.result.data
          that.globalData.hairstyleRemaining = d.hairstyleRemaining || 0
          that.globalData.tryonRemaining     = d.tryonRemaining     || 0
          that.globalData.quotaLoaded = true
          if (typeof that.onQuotaLoaded === 'function') {
            that.onQuotaLoaded()
          }
        }
      },
      fail: err => {
        console.log('获取用户配额失败', err)
      }
    })
  },

  // 扣减额度（生成前调用），返回 Promise
  // type: 'hairstyle' | 'tryon'
  deductQuota: function (type) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'manageQuota',
        data: { action: 'deduct', type: type || 'tryon' },
        success: res => {
          if (res.result && res.result.code === 0) {
            const d = res.result.data
            this.globalData.hairstyleRemaining = d.hairstyleRemaining
            this.globalData.tryonRemaining     = d.tryonRemaining
            resolve(d)
          } else {
            reject(new Error(res.result?.message || '额度不足'))
          }
        },
        fail: err => reject(err)
      })
    })
  },

  // 分享奖励（每日限1次）
  addShareQuota: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'manageQuota',
        data: { action: 'shareAdd' },
        success: res => {
          if (res.result && res.result.code === 0) {
            const d = res.result.data
            if (d.hairstyleRemaining !== undefined) this.globalData.hairstyleRemaining = d.hairstyleRemaining
            if (d.tryonRemaining !== undefined) this.globalData.tryonRemaining = d.tryonRemaining
            resolve(res.result)
          } else {
            reject(new Error(res.result?.message || '分享失败'))
          }
        },
        fail: err => reject(err)
      })
    })
  },

  // 邀请奖励（外部一般不直接调用，由 autoLogin 内部触发）
  addInviteQuota: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'manageQuota',
        data: { action: 'inviteAdd', invitedBy: this.globalData.inviterOpenId },
        success: res => {
          if (res.result && res.result.code === 0) {
            const d = res.result.data
            if (d.hairstyleRemaining !== undefined) this.globalData.hairstyleRemaining = d.hairstyleRemaining
            if (d.tryonRemaining !== undefined) this.globalData.tryonRemaining = d.tryonRemaining
            resolve(res.result)
          } else {
            reject(new Error(res.result?.message || '邀请失败'))
          }
        },
        fail: err => reject(err)
      })
    })
  },

  onQuotaLoaded: null
})
