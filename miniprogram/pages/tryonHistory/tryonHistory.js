// pages/tryonHistory/tryonHistory.js
const db = wx.cloud.database()
const PAGE_SIZE = 18

Page({
  data: {
    list: [],
    resultUrls: [],
    loaded: false,
    hasMore: true,
    page: 0
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    // 每次显示时刷新
    this.setData({ list: [], page: 0, hasMore: true, loaded: false })
    this.loadHistory()
  },

  loadHistory() {
    db.collection('history')
      .where({ type: 'tryon' })
      .orderBy('createTime', 'desc')
      .skip(this.data.page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()
      .then(res => {
        const items = res.data.map(item => {
          const d = item.createTime ? new Date(item.createTime) : new Date()
          item.dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
          return item
        })
        const newList = this.data.list.concat(items)
        const urls = newList.map(i => i.resultUrl).filter(Boolean)
        this.setData({
          list: newList,
          resultUrls: urls,
          loaded: true,
          hasMore: items.length >= PAGE_SIZE,
          page: this.data.page + 1
        })
      })
      .catch(err => {
        console.log('加载试衣历史失败', err)
        this.setData({ loaded: true })
      })
  },

  loadMore() {
    if (this.data.hasMore) {
      this.loadHistory()
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = e.currentTarget.dataset.urls || [url]
    if (!url) return
    wx.previewImage({ current: url, urls })
  }
})
