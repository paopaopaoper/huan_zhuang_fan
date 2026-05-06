// 云函数：queryHairstyleTask
// 职责：查询 AILab Tools 异步任务状态（Premium API 格式）
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const AILAB_API_KEY = process.env.AILAB_API_KEY

exports.main = async (event) => {
  const { taskId } = event

  if (!taskId) {
    return { code: -1, message: '缺少 taskId' }
  }

  try {
    const resp = await axios.get(
      `https://www.ailabapi.com/api/common/query-async-task-result?task_id=${taskId}`,
      {
        headers: { 'ailabapi-api-key': AILAB_API_KEY },
        timeout: 10000
      }
    )

    const data = resp.data
    const taskStatus = data?.task_status
    const errorDetail = data?.error_detail

    // task_status: 0=排队中, 1=处理中, 2=已完成
    if (taskStatus === 2) {
      // Premium API 成功：结果图片在 data.image（单个 URL）
      const imageUrl = data?.data?.image
      if (imageUrl) {
        return {
          code: 0,
          status: 'SUCCEEDED',
          data: { imageUrl }
        }
      }
      // data 存在但没图片 → 异常
      return {
        code: -1,
        status: 'FAILED',
        message: '任务完成但未返回图片'
      }
    }

    // 任务失败（error_detail 有错误码）
    if (errorDetail && errorDetail.code && errorDetail.code !== 0 && errorDetail.code !== '') {
      return {
        code: -1,
        status: 'FAILED',
        message: errorDetail.message || errorDetail.code_message || '任务失败'
      }
    }

    // 排队中或处理中
    return { code: 0, status: 'RUNNING' }

  } catch (e) {
    // 网络层异常，不中断轮询，返回 RUNNING 让前端继续
    const detail = e.response?.data || e.message
    console.error('查询换发型任务网络异常:', detail)
    return { code: 0, status: 'RUNNING', message: '网络异常，继续等待' }
  }
}
