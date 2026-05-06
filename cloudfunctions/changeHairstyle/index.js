// 云函数：changeHairstyle
// 职责：提交换发型任务，立即返回 taskId
// API：AILab Tools Hairstyle Editor Premium（支持参考图片）
// 格式：multipart/form-data 文件上传
const cloud = require('wx-server-sdk')
const axios = require('axios')
const FormData = require('form-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const AILAB_API_KEY = process.env.AILAB_API_KEY

exports.main = async (event) => {
  const { personImageFileID, refImageFileID } = event

  if (!personImageFileID || !refImageFileID) {
    return { code: -1, message: '缺少 personImageFileID 或 refImageFileID' }
  }

  // 1. 获取图片临时 URL
  let personUrl, refUrl
  try {
    const res = await cloud.getTempFileURL({
      fileList: [personImageFileID, refImageFileID]
    })
    personUrl = res.fileList[0].tempFileURL
    refUrl    = res.fileList[1].tempFileURL
  } catch (e) {
    return { code: -1, message: '获取图片URL失败: ' + e.message }
  }

  // 2. 下载图片二进制（并行，8秒超时，限制5MB）
  let personBuffer, refBuffer
  try {
    const [p, r] = await Promise.all([
      axios({ method: 'get', url: personUrl, responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 }),
      axios({ method: 'get', url: refUrl,    responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 })
    ])
    personBuffer = Buffer.from(p.data)
    refBuffer    = Buffer.from(r.data)
    console.log('[changeHairstyle] 下载完成，人像:', personBuffer.length, '字节，参考图:', refBuffer.length, '字节')
  } catch (e) {
    return { code: -1, message: '下载图片失败: ' + e.message }
  }

  // 3. 用 multipart/form-data 提交到 Premium API
  try {
    const form = new FormData()
    form.append('image', personBuffer, { filename: 'person.jpg', contentType: 'image/jpeg' })
    form.append('image_template', refBuffer, { filename: 'ref.jpg', contentType: 'image/jpeg' })
    form.append('color', 'reference')    // 使用参考图发色
    form.append('task_type', 'async')    // 异步模式

    const resp = await axios.post(
      'https://www.ailabapi.com/api/portrait/effects/hairstyle-editor-premium',
      form,
      {
        headers: {
          'ailabapi-api-key': AILAB_API_KEY,
          ...form.getHeaders()
        },
        timeout: 15000,
        maxContentLength: 2 * 1024 * 1024
      }
    )

    console.log('[changeHairstyle] API响应:', JSON.stringify(resp.data))

    const taskId = resp.data?.task_id
    if (!taskId) {
      return { code: -1, message: '提交任务失败，未获取 task_id', raw: resp.data }
    }

    return { code: 0, message: '任务已提交', data: { taskId } }

  } catch (e) {
    const detail = e.response?.data || e.message
    console.error('[changeHairstyle] 提交失败:', typeof detail === 'object' ? JSON.stringify(detail) : String(detail))
    return { code: -1, message: '提交任务失败', detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail) }
  }
}
