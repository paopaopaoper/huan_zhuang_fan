// 云函数：tryonClothes
// 职责：提交试衣任务，立即返回 taskId（前端自行轮询）
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY

exports.main = async (event) => {
  const { personImageFileID, garmentImageFileID } = event

  if (!personImageFileID || !garmentImageFileID) {
    return { code: -1, message: '缺少 personImageFileID 或 garmentImageFileID' }
  }

  if (!BAILIAN_API_KEY) {
    return { code: -1, message: '未配置 BAILIAN_API_KEY 环境变量' }
  }

  // 1. 获取图片临时 URL
  let personUrl, garmentUrl
  try {
    const res = await cloud.getTempFileURL({
      fileList: [personImageFileID, garmentImageFileID]
    })
    personUrl   = res.fileList[0].tempFileURL
    garmentUrl  = res.fileList[1].tempFileURL
  } catch (e) {
    return { code: -1, message: '获取图片URL失败: ' + e.message }
  }

  // 2. 提交任务到阿里云百炼（异步模式，立即返回 task_id）
  try {
    const resp = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis',
      {
        model: 'aitryon-plus',
        input: {
          person_image_url: personUrl,
          top_garment_url:  garmentUrl
        },
        parameters: {
          resolution: 1024,
          restore_face: true
        }
      },
      {
        headers: {
          'Authorization':     `Bearer ${BAILIAN_API_KEY}`,
          'Content-Type':      'application/json',
          'X-DashScope-Async': 'enable'
        },
        timeout: 15000,
        validateStatus: () => true
      }
    )

    console.log('Aliyun submit resp:', JSON.stringify(resp.data))

    // 检查阿里云 API 层面的错误（如 InvalidApiKey、QuotaExceeded 等）
    const apiCode = resp.data?.code
    if (apiCode && apiCode !== '200' && apiCode !== 200) {
      const apiMsg = resp.data?.message || 'API调用失败'
      console.error('阿里云API错误:', apiCode, apiMsg)
      return { code: -1, message: `阿里云API错误: ${apiMsg}` }
    }

    const taskId = resp.data?.output?.task_id
    if (!taskId) {
      return { code: -1, message: '提交任务失败，未获取 task_id', raw: resp.data }
    }

    return { code: 0, message: '任务已提交', data: { taskId } }

  } catch (e) {
    const detail = e.response?.data || e.message
    console.error('提交试衣任务失败:', detail)
    return { code: -1, message: '提交任务失败', detail }
  }
}
