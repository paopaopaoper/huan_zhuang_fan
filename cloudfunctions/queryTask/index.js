// 云函数：queryTask
// 职责：查询阿里云百炼任务状态，前端轮询调用
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY

// 阿里云百炼异步任务查询接口
const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'

exports.main = async (event) => {
  const { taskId } = event

  if (!taskId) {
    return { code: -1, status: 'FAILED', message: '缺少 taskId' }
  }

  if (!BAILIAN_API_KEY) {
    return { code: -1, status: 'FAILED', message: '未配置 BAILIAN_API_KEY 环境变量' }
  }

  try {
    const resp = await axios.get(
      `${BASE_URL}/tasks/${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${BAILIAN_API_KEY}` },
        timeout: 10000,
        validateStatus: () => true
      }
    )

    console.log('Aliyun query resp:', JSON.stringify(resp.data))

    // 检查阿里云 API 层面的错误（如 InvalidApiKey、QuotaExceeded 等）
    const apiCode = resp.data?.code
    if (apiCode && apiCode !== '200' && apiCode !== 200) {
      const apiMsg = resp.data?.message || 'API调用失败'
      console.error('阿里云API错误:', apiCode, apiMsg)
      return { code: -1, status: 'FAILED', message: `阿里云API错误: ${apiMsg}` }
    }

    const output = resp.data?.output
    const status = output?.task_status  // PENDING / RUNNING / SUCCEEDED / FAILED

    if (status === 'SUCCEEDED') {
      const imageUrl = output?.image_url || ''
      console.log('任务成功，图片URL:', imageUrl)
      return { code: 0, status: 'SUCCEEDED', data: { imageUrl } }
    }

    if (status === 'FAILED') {
      const msg = output?.message || resp.data?.message || '任务失败'
      return { code: -1, status: 'FAILED', message: msg }
    }

    // PENDING 或 RUNNING，继续轮询
    return { code: 0, status: status || 'PENDING' }

  } catch (e) {
    console.error('查询任务网络异常:', e.message)
    // 网络异常不中断轮询，但最多连续3次网络异常后放弃
    return { code: 0, status: 'PENDING', message: '网络异常，继续等待' }
  }
}
