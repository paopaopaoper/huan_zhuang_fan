// pages/tryon/tryon.js
const app = getApp()
const MAX_IMAGES = 5

Page({
  data: {
    personImages: [],   // [{url, fileID}]
    garmentImages: [],  // [{url, fileID}]
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

  pickGarmentImages() {
    const remain = MAX_IMAGES - this.data.garmentImages.length
    if (remain <= 0) return wx.showToast({ title: `最多${MAX_IMAGES}张`, icon: 'none' })
    this._pickImages('garmentImages', remain)
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
  removeGarmentImage(e) { this._removeImage('garmentImages', e.currentTarget.dataset.index) },

  _removeImage(key, index) {
    const arr = [...this.data[key]]
    arr.splice(index, 1)
    this.setData({ [key]: arr })
  },

  // ——— 上传到云存储 ———
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

  // ——— 开始试衣 ———
  async startTryon() {
    const { personImages, garmentImages } = this.data
    if (personImages.length === 0) return wx.showToast({ title: '请先上传您的照片', icon: 'none' })
    if (garmentImages.length === 0) return wx.showToast({ title: '请先上传服装照片', icon: 'none' })

    this.setData({ isProcessing: true, resultImageUrl: '', progress: '正在提交任务...' })

    try {
      await app.deductQuota('tryon')
    } catch (e) {
      this.setData({ isProcessing: false, progress: '' })
      wx.showModal({
        title: '换装次数不足',
        content: '换装次数已用完\n\n获取方式：\n• 看广告：每2积分换1次换装\n• 每日分享：获得3次通用次数\n• 邀请好友：获得5次通用次数',
        confirmText: '去看广告',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) wx.switchTab({ url: '/pages/profile/profile' })
        }
      })
      return
    }

    // 取第一张（阿里云百炼单次 1 对 1）
    const personImageFileID  = personImages[0].fileID
    const garmentImageFileID = garmentImages[0].fileID

    try {
      const submitRes = await wx.cloud.callFunction({
        name: 'tryonClothes',
        data: { personImageFileID, garmentImageFileID }
      })

      console.log('submitRes:', JSON.stringify(submitRes.result))

      if (!submitRes.result || submitRes.result.code !== 0) {
        this.setData({ isProcessing: false, progress: '' })
        const msg = submitRes.result?.message || '提交失败，请重试'
        return wx.showModal({ title: '提交失败', content: msg, showCancel: false })
      }

      const taskId = submitRes.result.data.taskId
      this.setData({ progress: '任务已提交，AI 生成中...' })
      await this._pollTask(taskId)

    } catch (e) {
      console.error('试衣出错:', e)
      this.setData({ isProcessing: false, progress: '' })
      wx.showModal({ title: '出错了', content: e.message || '请重试', showCancel: false })
    }
  },

  // 前端轮询（每5秒，最多60次 = 5分钟）
  async _pollTask(taskId) {
    for (let i = 1; i <= 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      this.setData({ progress: `AI 渲染中... (${i * 5}s)` })

      try {
        const res = await wx.cloud.callFunction({
          name: 'queryTask',
          data: { taskId }
        })
        const { code, status, data, message } = res.result || {}

        // 成功
        if (status === 'SUCCEEDED') {
          this.setData({ isProcessing: false, progress: '', resultImageUrl: data.imageUrl })
          wx.showToast({ title: '生成成功！', icon: 'success' })
          // 保存历史记录
          this._saveHistory(data.imageUrl)
          return
        }

        // 阿里云百炼明确返回失败
        if (status === 'FAILED') {
          this.setData({ isProcessing: false, progress: '' })
          wx.showModal({ title: '生成失败', content: message || '请换张照片重试', showCancel: false })
          return
        }

        // code === 0 且 status 为 PENDING/RUNNING → 继续轮询
        // code === -1 但没有 status（网络异常）→ 继续轮询

      } catch (e) {
        // wx.cloud.callFunction 调用失败（网络问题），继续重试
        console.warn('查询任务调用失败，继续重试:', e.message)
      }
    }

    this.setData({ isProcessing: false, progress: '' })
    wx.showModal({ title: '生成超时', content: 'AI 生成时间超过5分钟，请稍后重试或更换照片', showCancel: false })
  },

  clearResult() {
    this.setData({ resultImageUrl: '', personImages: [], garmentImages: [] })
  },

  saveImage() {
    if (!this.data.resultImageUrl) return
    // 网络图片需要先下载到本地才能保存到相册
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

  // 保存试衣历史到云数据库
  _saveHistory(resultUrl) {
    const { personImages, garmentImages } = this.data
    if (!resultUrl) return
    const db = wx.cloud.database()
    db.collection('history').add({
      data: {
        type: 'tryon',
        personFileID: personImages[0]?.fileID || '',
        refFileID: garmentImages[0]?.fileID || '',
        resultUrl: resultUrl,
        createTime: db.serverDate()
      }
    }).catch(err => console.log('保存历史失败', err))
  }
})
