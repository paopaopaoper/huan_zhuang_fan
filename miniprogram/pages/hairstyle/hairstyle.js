// pages/hairstyle/hairstyle.js
const app = getApp()
const MAX_IMAGES = 5

Page({
  data: {
    personImages: [],   // 我的照片
    refImages: [],      // 目标发型照片
    isUploading: false,
    isProcessing: false,
    progress: '',
    resultImageUrl: ''
  },

  // ——— 选图 ———
  pickPersonImages() {
    const remain = MAX_IMAGES - this.data.personImages.length
    if (remain <= 0) return wx.showToast({ title: `最多${MAX_IMAGES}张`, icon: 'none' })
    this._pickImages('personImages', remain)
  },

  pickRefImages() {
    const remain = MAX_IMAGES - this.data.refImages.length
    if (remain <= 0) return wx.showToast({ title: `最多${MAX_IMAGES}张`, icon: 'none' })
    this._pickImages('refImages', remain)
  },

  _pickImages(key, count) {
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        this.setData({ isUploading: true })
        const newItems = []
        // 串行上传，避免并发内存峰值
        for (const tempFilePath of res.tempFilePaths) {
          const fileID = await this._uploadCloud(tempFilePath, key)
          if (fileID) newItems.push({ url: tempFilePath, fileID })
        }
        this.setData({
          [key]: [...this.data[key], ...newItems],
          isUploading: false
        })
      },
      fail: () => {
        this.setData({ isUploading: false })
      }
    })
  },

  removePersonImage(e) { this._removeImage('personImages', e.currentTarget.dataset.index) },
  removeRefImage(e) { this._removeImage('refImages', e.currentTarget.dataset.index) },

  _removeImage(key, index) {
    const arr = [...this.data[key]]
    arr.splice(index, 1)
    this.setData({ [key]: arr })
  },

  _uploadCloud(filePath, type) {
    return new Promise((resolve) => {
      const ext = filePath.split('.').pop() || 'jpg'
      const cloudPath = `uploads/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => resolve(res.fileID),
        fail: err => { console.error('上传失败', err); resolve(null) }
      })
    })
  },

  async startChange() {
    const { personImages, refImages } = this.data
    if (personImages.length === 0) return wx.showToast({ title: '请先上传您的照片', icon: 'none' })
    if (refImages.length === 0)    return wx.showToast({ title: '请先上传目标发型照片', icon: 'none' })

    this.setData({ isProcessing: true, resultImageUrl: '', progress: '正在提交任务...' })

    // 先扣减额度
    try {
      await app.deductQuota('hairstyle')
    } catch (e) {
      this.setData({ isProcessing: false, progress: '' })
      wx.showModal({
        title: '换发型次数不足',
        content: '换发型次数已用完\n\n获取方式：\n• 看广告：每4积分换1次发型\n• 每日分享：获得3次通用次数\n• 邀请好友：获得5次通用次数',
        confirmText: '去看广告',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) wx.switchTab({ url: '/pages/profile/profile' })
        }
      })
      return
    }

    const personImageFileID = personImages[0].fileID
    const refImageFileID    = refImages[0].fileID

    try {
      const submitRes = await wx.cloud.callFunction({
        name: 'changeHairstyle',
        data: { personImageFileID, refImageFileID }
      })

      console.log('hairstyle submitRes:', JSON.stringify(submitRes.result))

      if (!submitRes.result || submitRes.result.code !== 0) {
        this.setData({ isProcessing: false, progress: '' })
        const msg = submitRes.result?.message || '提交失败，请重试'
        return wx.showModal({ title: '提交失败', content: msg, showCancel: false })
      }

      const taskId = submitRes.result.data.taskId
      this.setData({ progress: '任务已提交，AI 换发型中...' })
      await this._pollTask(taskId)

    } catch (e) {
      console.error('换发型出错:', e)
      this.setData({ isProcessing: false, progress: '' })
      wx.showModal({ title: '出错了', content: e.message || '请重试', showCancel: false })
    }
  },

  // 前端轮询（每5秒，最多60次 = 5分钟）
  async _pollTask(taskId) {
    for (let i = 1; i <= 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      this.setData({ progress: `AI 换发型中... (${i * 5}s)` })

      try {
        const res = await wx.cloud.callFunction({
          name: 'queryHairstyleTask',
          data: { taskId }
        })
        const { code, status, data, message } = res.result || {}

        // 成功
        if (status === 'SUCCEEDED') {
          this.setData({ isProcessing: false, progress: '', resultImageUrl: data.imageUrl })
          wx.showToast({ title: '换发型成功！', icon: 'success' })
          // 保存历史记录
          this._saveHistory(data.imageUrl)
          return
        }

        // AILab 明确返回失败
        if (status === 'FAILED') {
          this.setData({ isProcessing: false, progress: '' })
          wx.showModal({ title: '生成失败', content: message || '请换张照片重试', showCancel: false })
          return
        }

        // code === 0 且 status 为 PENDING/RUNNING → 继续轮询
        // code === -1 但没有 status（网络异常）→ 继续轮询

      } catch (e) {
        console.warn('查询任务调用失败，继续重试:', e.message)
      }
    }

    this.setData({ isProcessing: false, progress: '' })
    wx.showModal({ title: '生成超时', content: 'AI 生成时间超过5分钟，请稍后重试或更换照片', showCancel: false })
  },

  clearResult() {
    this.setData({ resultImageUrl: '', personImages: [], refImages: [] })
  },

  saveImage() {
    if (!this.data.resultImageUrl) return
    wx.downloadFile({
      url: this.data.resultImageUrl,
      success: (downloadRes) => {
        if (downloadRes.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: downloadRes.tempFilePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => wx.showToast({ title: '保存失败，请允许相册权限', icon: 'none' })
          })
        } else {
          wx.showToast({ title: '下载图片失败', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '下载图片失败', icon: 'none' })
    })
  },

  // 保存换发型历史到云数据库
  _saveHistory(resultUrl) {
    const { personImages, refImages } = this.data
    if (!resultUrl) return
    const db = wx.cloud.database()
    db.collection('history').add({
      data: {
        type: 'hairstyle',
        personFileID: personImages[0]?.fileID || '',
        refFileID: refImages[0]?.fileID || '',
        resultUrl: resultUrl,
        createTime: db.serverDate()
      }
    }).catch(err => console.log('保存历史失败', err))
  }
})
