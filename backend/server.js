const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Parser = require('rss-parser');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config(); // 导入dotenv包读取.env文件

// 硬编码配置
const config = {
  port: process.env.PORT || 3000,
  gotify: {
    url: 'http://gotify.example.com/message', // 替换为实际的 Gotify URL
    token: 'your-gotify-token-here',         // 替换为实际的 Gotify Token
    priority: 5                              // 默认优先级
  },
  db: {
    path: process.env.DB_PATH || './rss.db'
  },
  accessPassword: process.env.ACCESS_PASSWORD || 'admin' // 添加访问密码配置
};

const app = express();
const parser = new Parser();

// 中间件
app.use(cors());
app.use(express.json());

// 添加登录API接口 - 放在中间件之前
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: '请提供密码' });
  }
  
  if (password === config.accessPassword) {
    return res.json({ 
      success: true, 
      token: config.accessPassword,
      message: '登录成功' 
    });
  } else {
    return res.status(401).json({ 
      success: false, 
      error: '密码错误' 
    });
  }
});

// 密码验证中间件
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' });
  }
  
  const token = authHeader.split(' ')[1];
  if (token !== config.accessPassword) {
    return res.status(401).json({ error: '访问令牌无效' });
  }
  
  next();
};

// 应用密码验证中间件
app.use('/api', authMiddleware);

// 初始化数据库
const db = new sqlite3.Database(config.db.path, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
  console.log('Connected to database');
});

// 创建 rss 表
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS rss (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '', -- 名称
      url TEXT NOT NULL, -- RSS URL
      keywords TEXT DEFAULT '', -- 关键词
      blacklist_keywords TEXT DEFAULT '', -- 黑名单关键词
      monitor_interval INTEGER DEFAULT 30, -- 监测间隔（分钟）
      last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 上次检查时间
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 创建时间
      notification_channel_id INTEGER DEFAULT NULL, -- 通知渠道ID
      FOREIGN KEY(notification_channel_id) REFERENCES notifications(id)
    );
  `, (err) => {
    if (err) {
      console.error('Error creating rss table:', err);
    } else {
      console.log('rss table created or already exists');
    }
  });

  // 创建 notifications 表
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '', -- 名称
      endpoint TEXT NOT NULL, -- URL
      active BOOLEAN DEFAULT TRUE, -- 是否激活
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) {
      console.error('Error creating notifications table:', err);
    } else {
      console.log('notifications table created or already exists');
    }
  });

  // 创建 sent_messages 表，用于记录已发送的消息
  db.run(`
    CREATE TABLE IF NOT EXISTS sent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rss_id INTEGER NOT NULL, -- RSS 源 ID
      message_guid TEXT, -- 消息唯一标识
      message_link TEXT, -- 消息链接
      message_title TEXT, -- 消息标题
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 发送时间
      FOREIGN KEY(rss_id) REFERENCES rss(id) ON DELETE CASCADE
    );
  `, (err) => {
    if (err) {
      console.error('Error creating sent_messages table:', err);
    } else {
      console.log('sent_messages table created or already exists');
    }
  });
});

// 检查消息是否已经发送过
const isMessageAlreadySent = (rssId, messageGuid, messageLink, messageTitle) => {
  return new Promise((resolve, reject) => {
    // 优先使用 guid 检查，如果没有 guid 则使用链接和标题组合检查
    const query = messageGuid 
      ? "SELECT * FROM sent_messages WHERE rss_id = ? AND message_guid = ?"
      : "SELECT * FROM sent_messages WHERE rss_id = ? AND message_link = ? AND message_title = ?";
    
    const params = messageGuid 
      ? [rssId, messageGuid]
      : [rssId, messageLink, messageTitle];
    
    db.get(query, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(!!row); // 如果找到记录，返回 true，否则返回 false
    });
  });
};

// 记录已发送的消息
const recordSentMessage = (rssId, messageGuid, messageLink, messageTitle) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO sent_messages (rss_id, message_guid, message_link, message_title) VALUES (?, ?, ?, ?)",
      [rssId, messageGuid, messageLink, messageTitle],
      function(err) {
        if (err) {
          return reject(err);
        }
        resolve(this.lastID);
      }
    );
  });
};

const fetchRss = async (url, keywords, blacklistKeywords, notificationChannelId) => {
  try {
    const now = new Date();
    
    // 获取数据库中该 RSS 源的 last_checked 和 monitor_interval
    const sourceData = await getSourceData(url);
    const lastChecked = new Date(sourceData.last_checked);
    const monitorInterval = sourceData.monitor_interval; // 单位是分钟

    // 判断是否达到监测间隔
    const diffInMinutes = (now - lastChecked) / (1000 * 60); // 转换为分钟
    if (diffInMinutes < monitorInterval) {
      console.log(`RSS source ${url} check interval not reached. Skipping.`);
      return;  // 如果间隔未到，则跳过抓取
    }

    const feed = await parser.parseURL(url);
    console.log(`Feed title: ${feed.title}`);

    for (const item of feed.items) {
      // 检查黑名单关键词
      const matchesBlacklist = blacklistKeywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) ||
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesBlacklist) {
        console.log(`Item with blacklisted keyword skipped: ${item.title}`);
        continue; // 如果匹配黑名单关键词，则跳过该条目
      }

      // 检查关键词匹配
      const matchesKeywords = keywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) || 
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesKeywords) {
        // 检查消息是否已经发送过
        const alreadySent = await isMessageAlreadySent(
          sourceData.id, 
          item.guid, 
          item.link, 
          item.title
        );

        if (alreadySent) {
          console.log(`Message already sent, skipping: ${item.title}`);
          continue;
        }

        console.log(`Matching item found: ${item.title}`);
        await sendToGotify(sourceData.name, item.title, item.content, item.link, notificationChannelId);
        
        // 记录已发送的消息
        await recordSentMessage(sourceData.id, item.guid, item.link, item.title);
      }
    }

    // 更新数据库中的 last_checked 时间
    await updateLastChecked(url, now);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    throw error;
  }
};

// 获取源的数据库数据
const getSourceData = (url) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM rss WHERE url = ?", [url], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
};

// 更新 last_checked 时间
const updateLastChecked = (url, date) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss SET last_checked = ? WHERE url = ?", [date.toISOString(), url], function(err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};

const sendToGotify = async (sourceName, itemTitle, itemContent, itemLink, channelId) => {
  try {
    if (!config.gotify.url || !config.gotify.token) {
      throw new Error('Gotify configuration is missing');
    }

    // 根据 channelId 获取通知渠道信息
    const channel = await getNotificationChannel(channelId);
    if (!channel || !channel.active) {
      console.warn(`Notification channel with ID ${channelId} not found or inactive`);
      return;
    }

    // 格式化标题为"xx名称更新了"
    const title = `${sourceName || 'RSS'} 更新了`;
    
    // 处理 itemContent 可能为 undefined 的情况
    let content = itemContent ? itemContent.trim() : '';
    
    // 提取所有图片链接
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    const imgLinks = [];
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      imgLinks.push(match[1]);
    }
    
    // 去除HTML标签
    content = content.replace(/<[^>]*>/g, '');
    
    // 添加提取的图片链接到内容末尾
    if (imgLinks.length > 0) {
      content += '\n\n图片链接:\n' + imgLinks.join('\n');
    }
    
    // 格式化内容为"RSS的标题+RSS的内容+RSS的链接"
    const message = `${itemTitle}\n\n${content}\n\n${itemLink}`;

    const response = await axios.post(channel.endpoint, {
      title: title,
      message: message,
      priority: config.gotify.priority
    }, {
      headers: {
        'X-Gotify-Key': config.gotify.token
      }
    });

    console.log('Notification sent to Gotify');
    return response.data;
  } catch (error) {
    console.error('Error sending to Gotify:', error.message);
    throw error;
  }
};

app.post('/api/add-rss', async (req, res) => {
  const { rssUrl, name, keywords, blacklistKeywords, monitorInterval, notificationChannelId } = req.body;

  try {
    // 输入验证
    if (!rssUrl || !keywords) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 处理关键词，确保不是 undefined
    const keywordsArray = Array.isArray(keywords) 
      ? keywords 
      : (keywords || '').split(',').map(k => k.trim()).filter(k => k);

    // 处理黑名单关键词，确保不是 undefined
    const blacklistArray = Array.isArray(blacklistKeywords) 
      ? blacklistKeywords 
      : (blacklistKeywords || '').split(',').map(k => k.trim()).filter(k => k);

    if (keywordsArray.length === 0) {
      return res.status(400).json({ error: 'At least one keyword is required' });
    }

    // 设置默认监测间隔为 30 分钟
    const interval = monitorInterval || 30;

    // 保存到数据库
    db.run(
      "INSERT INTO rss (url, name, keywords, blacklist_keywords, monitor_interval, notification_channel_id) VALUES (?, ?, ?, ?, ?, ?)",
      [rssUrl, name, keywordsArray.join(', '), blacklistArray.join(', '), interval, notificationChannelId],
      async function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to save RSS source' });
        }

        try {
          // 尝试首次抓取
          await fetchRss(rssUrl, keywordsArray, blacklistArray, notificationChannelId);
          res.json({ 
            message: 'RSS source added successfully',
            id: this.lastID 
          });
        } catch (fetchError) {
          // 即使抓取失败也保留数据库记录，但返回警告
          res.json({ 
            message: 'RSS source added but initial fetch failed',
            warning: fetchError.message,
            id: this.lastID
          });
        }
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取所有 RSS 源及其通知渠道信息
app.get('/api/rss-sources', (req, res) => {
  db.all(`
    SELECT 
      rss.*,
      notifications.name AS notification_channel_name
    FROM 
      rss
    LEFT JOIN 
      notifications ON rss.notification_channel_id = notifications.id
    ORDER BY 
      rss.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching RSS sources:', err);
      return res.status(500).json({ error: 'Failed to fetch RSS sources' });
    }
    res.json(rows);
  });
});

// 获取单个 RSS 源及其通知渠道信息
app.get('/api/rss-sources/:id', (req, res) => {
  const id = req.params.id;
  db.get(`
    SELECT 
      rss.*,
      notifications.name AS notification_channel_name
    FROM 
      rss
    LEFT JOIN 
      notifications ON rss.notification_channel_id = notifications.id
    WHERE 
      rss.id = ?
  `, [id], (err, row) => {
    if (err) {
      console.error('Error fetching RSS source:', err);
      return res.status(500).json({ error: 'Failed to fetch RSS source' });
    }
    if (!row) {
      return res.status(404).json({ error: 'RSS source not found' });
    }
    res.json(row);
  });
});

// 删除 RSS 源
app.delete('/api/rss-sources/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM rss WHERE id = ?", id, (err) => {
    if (err) {
      console.error('Error deleting RSS source:', err);
      return res.status(500).json({ error: 'Failed to delete RSS source' });
    }
    res.json({ message: 'RSS source deleted successfully' });
  });
});

// 批量更新 RSS 源
app.post('/api/bulk-update-rss', (req, res) => {
  const { ids, newName, newKeywords, newMonitorInterval, newBlacklistKeywords, newNotificationChannelId } = req.body;

  // 验证请求数据
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request. Please provide valid IDs.' });
  }

  let queryParts = [];
  let params = [];

  if (newName !== undefined) {
    queryParts.push('name = ?');
    params.push(newName);
  }

  if (newKeywords) {
    queryParts.push('keywords = ?');
    params.push(newKeywords);
  }

  if (typeof newMonitorInterval === 'number') {
    queryParts.push('monitor_interval = ?');
    params.push(newMonitorInterval);
  }

  if (newBlacklistKeywords) {
    queryParts.push('blacklist_keywords = ?');
    params.push(newBlacklistKeywords);
  }

  if (newNotificationChannelId !== undefined) {
    queryParts.push('notification_channel_id = ?');
    params.push(newNotificationChannelId);
  }

  if (queryParts.length === 0) {
    return res.status(400).json({ error: 'No fields to update provided.' });
  }

  // 构建完整的 SQL 查询
  const fullQuery = `UPDATE rss SET ${queryParts.join(', ')} WHERE id IN (${ids.map(() => '?').join(',')})`;
  params = [...params, ...ids];

  db.run(fullQuery, params, function(err) {
    if (err) {
      console.error('Error updating RSS sources:', err);
      return res.status(500).json({ error: 'Failed to update selected RSS sources' });
    }

    res.json({ message: 'RSS sources updated successfully', updatedCount: this.changes });
  });
});

// 添加通知渠道
app.post('/api/notifications', (req, res) => {
  const { name, endpoint, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认是否激活为 true
  const isActive = active !== undefined ? active : true;

  // 保存到数据库
  db.run(
    "INSERT INTO notifications (name, endpoint, active) VALUES (?, ?, ?)",
    [name, endpoint, isActive],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to save notification channel' });
      }

      res.json({ 
        message: '通知渠道添加成功',
        id: this.lastID 
      });
    }
  );
});

// 获取所有通知渠道
app.get('/api/notifications', (req, res) => {
  db.all("SELECT * FROM notifications ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error('Error fetching notification channels:', err);
      return res.status(500).json({ error: 'Failed to fetch notification channels' });
    }
    res.json(rows);
  });
});

// 删除通知渠道
app.delete('/api/notifications/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM notifications WHERE id = ?", id, (err) => {
    if (err) {
      console.error('Error deleting notification channel:', err);
      return res.status(500).json({ error: 'Failed to delete notification channel' });
    }
    res.json({ message: '通知渠道删除成功' });
  });
});

// 更新通知渠道
app.put('/api/notifications/:id', (req, res) => {
  const id = req.params.id;
  const { name, endpoint, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认是否激活为 true
  const isActive = active !== undefined ? active : true;

  // 更新数据库
  db.run(
    "UPDATE notifications SET name = ?, endpoint = ?, active = ? WHERE id = ?",
    [name, endpoint, isActive, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to update notification channel' });
      }

      res.json({ 
        message: '通知渠道修改成功',
        id: id 
      });
    }
  );
});

// 发送测试消息
app.post('/api/notifications/test/:id', async (req, res) => {
  const id = req.params.id;

  try {
    // 获取通知渠道信息
    const channel = await getNotificationChannel(id);
    if (!channel) {
      return res.status(404).json({ error: 'Notification channel not found' });
    }

    // 准备测试消息内容
    const testSourceName = `${channel.name}`;
    const testTitle = `测试标题`;
    const testContent = `这是一条测试内容`;
    const testLink = `https://example.com/test`;

    // 发送测试消息
    await sendToGotify(testSourceName, testTitle, testContent, testLink, id);

    res.json({ message: '测试消息发送成功' });
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

// 获取通知渠道信息
const getNotificationChannel = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM notifications WHERE id = ?", [id], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
};

// 测试单个 RSS 源
app.get('/api/test-rss/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 获取 RSS 源的数据
    const source = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM rss WHERE id = ?", [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });

    if (!source) {
      return res.status(404).json({ error: 'RSS 源未找到' });
    }

    const keywords = source.keywords.split(', ').map(k => k.trim());
    const blacklistKeywords = source.blacklist_keywords.split(', ').map(k => k.trim());

    // 进行测试抓取
    await testFetchRss(source.url, keywords, blacklistKeywords, source.notification_channel_id);

    res.json({ message: 'RSS 源测试成功' });
  } catch (error) {
    console.error('测试 RSS 源时出错:', error);
    res.status(500).json({ error: '测试 RSS 源失败' });
  }
});

const testFetchRss = async (url, keywords, blacklistKeywords, notificationChannelId) => {
  try {
    // 获取 RSS 源的数据，以便获取名称
    const sourceData = await getSourceData(url);
    
    const feed = await parser.parseURL(url);
    console.log(`Feed title: ${feed.title}`);

    for (const item of feed.items) {
      // 检查黑名单关键词
      const matchesBlacklist = blacklistKeywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) ||
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesBlacklist) {
        console.log(`Item with blacklisted keyword skipped: ${item.title}`);
        continue; // 如果匹配黑名单关键词，则跳过该条目
      }

      // 检查关键词匹配
      const matchesKeywords = keywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) || 
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesKeywords) {
        // 检查消息是否已经发送过
        const alreadySent = await isMessageAlreadySent(
          sourceData.id, 
          item.guid, 
          item.link, 
          item.title
        );

        if (alreadySent) {
          console.log(`Message already sent, skipping: ${item.title}`);
          continue;
        }

        console.log(`Matching item found: ${item.title}`);
        await sendToGotify(sourceData.name, item.title, item.content, item.link, notificationChannelId);
        
        // 记录已发送的消息
        await recordSentMessage(sourceData.id, item.guid, item.link, item.title);
      }
    }
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    throw error;
  }
};

// 编辑单个 RSS 源
app.put('/api/rss-sources/:id', async (req, res) => {
  const id = req.params.id;
  const { name, url, keywords, blacklist_keywords, monitor_interval, notification_channel_id } = req.body;

  try {
    // 输入验证
    if (!url || !keywords) {
      return res.status(400).json({ error: '缺少必需字段' });
    }

    // 处理关键词，确保不是 undefined
    const keywordsArray = Array.isArray(keywords) 
      ? keywords 
      : (keywords || '').split(',').map(k => k.trim()).filter(k => k);

    // 处理黑名单关键词，确保不是 undefined
    const blacklistArray = Array.isArray(blacklist_keywords) 
      ? blacklist_keywords 
      : (blacklist_keywords || '').split(',').map(k => k.trim()).filter(k => k);

    if (keywordsArray.length === 0) {
      return res.status(400).json({ error: '至少需要一个关键词' });
    }

    // 设置默认监测间隔为 30 分钟
    const interval = monitor_interval || 30;

    // 更新数据库中的 RSS 源
    db.run(
      "UPDATE rss SET name = ?, url = ?, keywords = ?, blacklist_keywords = ?, monitor_interval = ?, notification_channel_id = ? WHERE id = ?",
      [name, url, keywordsArray.join(', '), blacklistArray.join(', '), interval, notification_channel_id, id],
      async function(err) {
        if (err) {
          console.error('数据库错误:', err);
          return res.status(500).json({ error: '无法更新 RSS 源' });
        }

        // 尝试重新抓取以反映更改
        try {
          await fetchRss(url, keywordsArray, blacklistArray, notification_channel_id);
          res.json({ 
            message: 'RSS 源更新成功',
            id: id 
          });
        } catch (fetchError) {
          // 即使抓取失败也保留数据库记录，但返回警告
          res.json({ 
            message: 'RSS 源更新成功但重新抓取失败',
            warning: fetchError.message,
            id: id
          });
        }
      }
    );
  } catch (error) {
    console.error('处理请求时出错:', error);
    res.status(500).json({ error: '内部服务器错误' });
  }
});

// 批量删除 RSS 源
app.post('/api/bulk-delete-rss', (req, res) => {
  const { ids } = req.body;

  // 验证请求数据
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request. Please provide valid IDs.' });
  }

  const query = `DELETE FROM rss WHERE id IN (${ids.map(() => '?').join(',')})`;
  db.run(query, ids, function(err) {
    if (err) {
      console.error('Error deleting RSS sources:', err);
      return res.status(500).json({ error: 'Failed to delete selected RSS sources' });
    }

    res.json({ message: 'RSS sources deleted successfully', deletedCount: this.changes });
  });
});

// 清理旧的已发送消息记录（保留最近30天的记录）
const cleanupOldSentMessages = () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  db.run("DELETE FROM sent_messages WHERE sent_at < ?", [thirtyDaysAgo.toISOString()], function(err) {
    if (err) {
      console.error('Error cleaning up old sent messages:', err);
      return;
    }
    console.log(`Cleaned up ${this.changes} old sent message records`);
  });
};

// 启动定时任务：每隔一段时间检查所有 RSS 源
const checkAllRssSources = async () => {
  db.all("SELECT * FROM rss", [], async (err, rows) => {
    if (err) {
      console.error('Error fetching RSS sources for checking:', err);
      return;
    }

    for (const source of rows) {
      const keywords = source.keywords.split(', ').map(k => k.trim());
      const blacklistKeywords = source.blacklist_keywords.split(', ').map(k => k.trim());
      try {
        await fetchRss(source.url, keywords, blacklistKeywords, source.notification_channel_id);
      } catch (error) {
        console.error(`Error fetching RSS source ${source.url}:`, error);
      }
    }
  });
};

// 启动定时任务，每分钟检查一次（实际应用中可以根据需要调整）
setInterval(checkAllRssSources, 60 * 1000);

// 每天清理一次旧的消息记录
setInterval(cleanupOldSentMessages, 24 * 60 * 60 * 1000);

// 优雅关闭
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});