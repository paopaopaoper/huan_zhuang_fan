// 云函数入口文件 - 获取用户配额
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-d8gdrvm0l998d4c00'
})

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('收到获取用户配额请求')

  try {
    // 1. 获取用户openid
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    console.log('用户openid:', openid)

    // 2. 连接云数据库
    const db = cloud.database()
    const usersCollection = db.collection('users')

    // 3. 查询用户信息
    const userResult = await usersCollection.where({
      _openid: openid
    }).get()

    let userData = null

    if (userResult.data.length === 0) {
      // 用户不存在，创建新用户
      console.log('用户不存在，创建新用户')
      const newUser = {
        _openid: openid,
        freeQuota: 3,      // 初始免费3次
        usedQuota: 0,      // 已使用次数
        sharedQuota: 0,     // 分享获得次数
        inviteQuota: 0,     // 邀请获得次数
        createTime: new Date()
      }

      const addResult = await usersCollection.add(newUser)
      userData = newUser
      userData._id = addResult._id
    } else {
      // 用户已存在
      userData = userResult.data[0]
    }

    console.log('用户配额信息:', userData)

    // 4. 返回配额信息
    return {
      code: 0,
      message: '获取成功',
      data: {
        freeQuota: userData.freeQuota || 3,
        usedQuota: userData.usedQuota || 0,
        sharedQuota: userData.sharedQuota || 0,
        inviteQuota: userData.inviteQuota || 0,
        totalQuota: (userData.freeQuota || 3) + (userData.sharedQuota || 0) + (userData.inviteQuota || 0) - (userData.usedQuota || 0)
      }
    }

  } catch (error) {
    console.error('获取用户配额失败:', error)
    return {
      code: -1,
      message: error.message || '获取失败',
      data: null
    }
  }
}
