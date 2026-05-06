// pages/test/test.js
// 测试云函数连通性

Page({
  data: {
    testResults: [],
    isTesting: false
  },

  onLoad() {
    this.testGetUserQuota()
  },

  // 测试 getUserQuota 云函数
  async testGetUserQuota() {
    this.setData({ isTesting: true, testResults: [] })
    
    this.addTestResult('开始测试 getUserQuota 云函数...', 'info')

    try {
      const result = await wx.cloud.callFunction({
        name: 'getUserQuota',
        data: {}
      })

      this.addTestResult('✅ getUserQuota 调用成功', 'success')
      this.addTestResult(`返回数据: ${JSON.stringify(result.result)}`, 'info')

      if (result.result.code === 0) {
        this.addTestResult('✅ 数据库读写正常', 'success')
        this.addTestResult(`用户配额: ${result.result.data.quota}`, 'success')
        this.addTestResult(`已使用: ${result.result.data.used}`, 'success')
      } else {
        this.addTestResult(`❌ 业务错误: ${result.result.message}`, 'error')
      }
    } catch (err) {
      this.addTestResult(`❌ 调用失败: ${err.message}`, 'error')
      console.error('测试失败:', err)
    }

    this.setData({ isTesting: false })
  },

  // 测试 tryonClothes 云函数（需要先上传图片）
  async testTryonClothes() {
    this.addTestResult('---', 'info')
    this.addTestResult('开始测试 tryonClothes 云函数...', 'info')
    this.addTestResult('⚠️ 需要先用真机测试，此函数需要上传图片', 'warning')
  },

  // 测试 changeHairstyle 云函数
  async testChangeHairstyle() {
    this.addTestResult('---', 'info')
    this.addTestResult('开始测试 changeHairstyle 云函数...', 'info')
    this.addTestResult('⚠️ 需要先用真机测试，此函数需要上传图片', 'warning')
  },

  // 添加测试结果
  addTestResult(message, type) {
    const testResults = this.data.testResults
    testResults.push({ message, type })
    this.setData({ testResults })
  },

  // 清空测试结果
  clearResults() {
    this.setData({ testResults: [] })
  }
})