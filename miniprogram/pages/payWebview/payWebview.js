// pages/payWebview/payWebview.js
Page({
  data: {
    url: ''
  },

  onLoad: function (options) {
    // 从参数获取公众号文章URL
    if (options.url) {
      this.setData({ url: decodeURIComponent(options.url) })
      console.log('[payWebview] 打开URL:', decodeURIComponent(options.url))
    } else {
      wx.showToast({ title: '支付页面加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onWebMessage: function (e) {
    // 接收webview内H5页面postMessage（用于接收支付结果）
    console.log('[payWebview] 收到消息:', e.detail)
  },

  onLoad: function () {
    console.log('[payWebview] 页面加载成功')
  },

  onError: function (e) {
    console.error('[payWebview] 加载错误:', e)
    wx.showModal({
      title: '无法打开',
      content: '公众号文章暂时无法访问，请稍后重试',
      showCancel: false,
      confirmText: '返回',
      success: () => wx.navigateBack()
    })
  }
})
