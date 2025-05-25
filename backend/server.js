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
      type TEXT DEFAULT 'gotify', -- 通知类型: gotify, bark
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

  // 为现有的notifications表添加type字段（如果不存在）
  db.run(`
    ALTER TABLE notifications ADD COLUMN type TEXT DEFAULT 'gotify';
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding type column to notifications table:', err);
    } else if (!err) {
      console.log('Added type column to notifications table');
    }
  });

  // 为现有的rss表添加group_name字段（如果不存在）
  db.run(`
    ALTER TABLE rss ADD COLUMN group_name TEXT DEFAULT '';
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding group_name column to rss table:', err);
    } else if (!err) {
      console.log('Added group_name column to rss table');
    }
  });

  // 数据迁移：将现有的notification_channel_id迁移到关联表
  db.all("SELECT id, notification_channel_id FROM rss WHERE notification_channel_id IS NOT NULL", [], (err, rows) => {
    if (err) {
      console.error('Error fetching RSS sources for migration:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log(`Migrating ${rows.length} RSS sources to new notification system...`);
      
      rows.forEach(row => {
        db.run(
          "INSERT OR IGNORE INTO rss_notification_channels (rss_id, notification_channel_id) VALUES (?, ?)",
          [row.id, row.notification_channel_id],
          (err) => {
            if (err) {
              console.error(`Error migrating RSS source ${row.id}:`, err);
            }
          }
        );
      });
      
      console.log('Migration completed');
    }
  });

  // 创建 rss_notification_channels 关联表，支持多对多关系
  db.run(`
    CREATE TABLE IF NOT EXISTS rss_notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rss_id INTEGER NOT NULL,
      notification_channel_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(rss_id) REFERENCES rss(id) ON DELETE CASCADE,
      FOREIGN KEY(notification_channel_id) REFERENCES notifications(id) ON DELETE CASCADE,
      UNIQUE(rss_id, notification_channel_id)
    );
  `, (err) => {
    if (err) {
      console.error('Error creating rss_notification_channels table:', err);
    } else {
      console.log('rss_notification_channels table created or already exists');
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

const fetchRss = async (url, keywords, blacklistKeywords, notificationChannelIds) => {
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
        // 发送到所有关联的通知渠道
        await sendNotificationToMultipleChannels(sourceData.name, item.title, item.content, item.link, notificationChannelIds);
        
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

const sendNotification = async (sourceName, itemTitle, itemContent, itemLink, channelId) => {
  try {
    // 根据 channelId 获取通知渠道信息
    const channel = await getNotificationChannel(channelId);
    if (!channel || !channel.active) {
      console.warn(`Notification channel with ID ${channelId} not found or inactive`);
      return;
    }

    // 格式化标题为"xx名称更新了"，添加emoji
    const title = `📢 ${sourceName || 'RSS'} 更新了`;
    
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

    // 根据通知类型发送消息
    if (channel.type === 'bark') {
      return await sendToBark(channel, title, itemTitle, content, itemLink, imgLinks);
    } else {
      // 默认为Gotify
      return await sendToGotify(channel, title, itemTitle, content, itemLink, imgLinks);
    }
  } catch (error) {
    console.error('Error sending notification:', error.message);
    throw error;
  }
};

// 发送通知到多个渠道
const sendNotificationToMultipleChannels = async (sourceName, itemTitle, itemContent, itemLink, channelIds) => {
  if (!channelIds || channelIds.length === 0) {
    console.warn('No notification channels specified');
    return;
  }

  const results = [];
  for (const channelId of channelIds) {
    try {
      const result = await sendNotification(sourceName, itemTitle, itemContent, itemLink, channelId);
      results.push({ channelId, success: true, result });
      console.log(`Notification sent successfully to channel ${channelId}`);
    } catch (error) {
      results.push({ channelId, success: false, error: error.message });
      console.error(`Failed to send notification to channel ${channelId}:`, error.message);
    }
  }
  
  return results;
};

const sendToGotify = async (channel, title, itemTitle, content, itemLink, imgLinks) => {
  try {
    if (!config.gotify.url || !config.gotify.token) {
      throw new Error('Gotify configuration is missing');
    }

    // 使用Markdown格式化消息
    // 标题加粗并添加emoji
    let markdownMessage = `#### **${itemTitle}**\n\n`;
    
    // 内容部分添加引用格式
    markdownMessage += `> ${content}\n\n`;
    
    // 添加链接部分，使用emoji美化
    markdownMessage += `🔗 **链接**: [查看详情](${itemLink})\n\n`;
    
    // 添加提取的图片链接到内容末尾，作为超链接而非图片
    if (imgLinks.length > 0) {
      markdownMessage += `📷 **图片**:\n`;
      imgLinks.forEach((link, index) => {
        markdownMessage += `[图片${index + 1}](${link})\n`;
      });
    }
    
    // 添加时间戳
    const now = new Date();
    markdownMessage += `\n⏱️ ${now.toLocaleString('zh-CN')}`;

    const response = await axios.post(channel.endpoint, {
      title: title,
      message: markdownMessage,
      priority: config.gotify.priority,
      extras: {
        "client::display": {
          "contentType": "text/markdown"
        }
      }
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

const sendToBark = async (channel, title, itemTitle, content, itemLink, imgLinks) => {
  try {
    // Bark消息格式化
    let barkMessage = `${itemTitle}\n\n`;
    barkMessage += `${content}\n\n`;
    barkMessage += `🔗 链接: ${itemLink}`;
    
    // 添加图片链接
    if (imgLinks.length > 0) {
      barkMessage += `\n\n📷 图片:\n`;
      imgLinks.forEach((link, index) => {
        barkMessage += `图片${index + 1}: ${link}\n`;
      });
    }
    
    // 添加时间戳
    const now = new Date();
    barkMessage += `\n⏱️ ${now.toLocaleString('zh-CN')}`;

    // 发送POST请求到Bark
    const response = await axios.post(channel.endpoint, {
      title: title,
      body: barkMessage,
      url: itemLink,
      group: 'RSS推送',
      isArchive: 1
    });

    console.log('Notification sent to Bark');
    return response.data;
  } catch (error) {
    console.error('Error sending to Bark:', error.message);
    throw error;
  }
};

app.post('/api/add-rss', async (req, res) => {
  const { rssUrl, name, keywords, blacklistKeywords, monitorInterval, notificationChannelIds, groupName } = req.body;

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

    // 处理通知渠道ID
    const channelIds = Array.isArray(notificationChannelIds) 
      ? notificationChannelIds.filter(id => id && !isNaN(id)).map(id => parseInt(id))
      : (notificationChannelIds ? [parseInt(notificationChannelIds)] : []);

    // 设置默认监测间隔为 30 分钟
    const interval = monitorInterval || 30;
    const group = groupName || '';

    // 保存到数据库（不再保存notification_channel_id字段）
    db.run(
      "INSERT INTO rss (url, name, keywords, blacklist_keywords, monitor_interval, group_name) VALUES (?, ?, ?, ?, ?, ?)",
      [rssUrl, name, keywordsArray.join(', '), blacklistArray.join(', '), interval, group],
      async function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to save RSS source' });
        }

        const rssId = this.lastID;

        try {
          // 设置通知渠道关联
          if (channelIds.length > 0) {
            await setRssNotificationChannels(rssId, channelIds);
          }

          // 尝试首次抓取
          await fetchRss(rssUrl, keywordsArray, blacklistArray, channelIds);
          res.json({ 
            message: 'RSS source added successfully',
            id: rssId 
          });
        } catch (fetchError) {
          // 即使抓取失败也保留数据库记录，但返回警告
          res.json({ 
            message: 'RSS source added but initial fetch failed',
            warning: fetchError.message,
            id: rssId
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
app.get('/api/rss-sources', async (req, res) => {
  try {
    const sources = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM rss ORDER BY rss.group_name, rss.created_at DESC
      `, [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      });
    });

    // 为每个RSS源获取关联的通知渠道
    const sourcesWithChannels = await Promise.all(sources.map(async (source) => {
      const channelIds = await getRssNotificationChannels(source.id);
      
      // 获取通知渠道详细信息
      const channels = await Promise.all(channelIds.map(async (channelId) => {
        return await getNotificationChannel(channelId);
      }));
      
      return {
        ...source,
        notification_channels: channels.filter(channel => channel), // 过滤掉null值
        notification_channel_names: channels.filter(channel => channel).map(channel => channel.name).join(', ')
      };
    }));

    res.json(sourcesWithChannels);
  } catch (err) {
    console.error('Error fetching RSS sources:', err);
    res.status(500).json({ error: 'Failed to fetch RSS sources' });
  }
});

// 获取所有分组
app.get('/api/rss-groups', (req, res) => {
  db.all(`
    SELECT DISTINCT group_name 
    FROM rss 
    WHERE group_name != '' 
    ORDER BY group_name
  `, [], (err, rows) => {
    if (err) {
      console.error('Error fetching RSS groups:', err);
      return res.status(500).json({ error: 'Failed to fetch RSS groups' });
    }
    const groups = rows.map(row => row.group_name);
    res.json(groups);
  });
});

// 根据分组获取RSS源
app.get('/api/rss-sources/group/:groupName', async (req, res) => {
  const groupName = req.params.groupName;
  
  try {
    const sources = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM rss WHERE group_name = ? ORDER BY created_at DESC
      `, [groupName], (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      });
    });

    // 为每个RSS源获取关联的通知渠道
    const sourcesWithChannels = await Promise.all(sources.map(async (source) => {
      const channelIds = await getRssNotificationChannels(source.id);
      
      // 获取通知渠道详细信息
      const channels = await Promise.all(channelIds.map(async (channelId) => {
        return await getNotificationChannel(channelId);
      }));
      
      return {
        ...source,
        notification_channels: channels.filter(channel => channel),
        notification_channel_names: channels.filter(channel => channel).map(channel => channel.name).join(', ')
      };
    }));

    res.json(sourcesWithChannels);
  } catch (err) {
    console.error('Error fetching RSS sources by group:', err);
    res.status(500).json({ error: 'Failed to fetch RSS sources by group' });
  }
});

// 批量更新分组内的RSS源
app.post('/api/bulk-update-group', async (req, res) => {
  const { groupName, newName, newKeywords, newMonitorInterval, newBlacklistKeywords, newNotificationChannelIds, newGroupName } = req.body;

  // 验证请求数据
  if (!groupName) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  try {
    // 首先获取该分组内所有RSS源的ID
    const rssIds = await new Promise((resolve, reject) => {
      db.all("SELECT id FROM rss WHERE group_name = ?", [groupName], (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows.map(row => row.id));
      });
    });

    if (rssIds.length === 0) {
      return res.status(404).json({ error: 'No RSS sources found in this group.' });
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

    if (newGroupName !== undefined) {
      queryParts.push('group_name = ?');
      params.push(newGroupName);
    }

    let updatedCount = 0;

    // 如果有基本字段需要更新
    if (queryParts.length > 0) {
      const fullQuery = `UPDATE rss SET ${queryParts.join(', ')} WHERE group_name = ?`;
      const fullParams = [...params, groupName];

      await new Promise((resolve, reject) => {
        db.run(fullQuery, fullParams, function(err) {
          if (err) {
            return reject(err);
          }
          updatedCount = this.changes;
          resolve();
        });
      });
    }

    // 如果需要更新通知渠道
    if (newNotificationChannelIds && Array.isArray(newNotificationChannelIds)) {
      const channelIds = newNotificationChannelIds.filter(id => id && !isNaN(id)).map(id => parseInt(id));
      
      // 为该分组内的每个RSS源更新通知渠道关联
      for (const rssId of rssIds) {
        await setRssNotificationChannels(rssId, channelIds);
      }
      
      if (updatedCount === 0) {
        updatedCount = rssIds.length; // 如果只更新了通知渠道，设置更新数量为RSS源数量
      }
    }

    if (queryParts.length === 0 && (!newNotificationChannelIds || newNotificationChannelIds.length === 0)) {
      return res.status(400).json({ error: 'No fields to update provided.' });
    }

    res.json({ message: 'RSS sources in group updated successfully', updatedCount: updatedCount });
  } catch (err) {
    console.error('Error updating RSS sources in group:', err);
    res.status(500).json({ error: 'Failed to update RSS sources in group' });
  }
});

// 获取单个 RSS 源及其通知渠道信息
app.get('/api/rss-sources/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    const source = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM rss WHERE id = ?", [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });

    if (!source) {
      return res.status(404).json({ error: 'RSS source not found' });
    }

    // 获取关联的通知渠道
    const channelIds = await getRssNotificationChannels(source.id);
    const channels = await Promise.all(channelIds.map(async (channelId) => {
      return await getNotificationChannel(channelId);
    }));

    const sourceWithChannels = {
      ...source,
      notification_channels: channels.filter(channel => channel),
      notification_channel_ids: channelIds
    };

    res.json(sourceWithChannels);
  } catch (err) {
    console.error('Error fetching RSS source:', err);
    res.status(500).json({ error: 'Failed to fetch RSS source' });
  }
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
app.post('/api/bulk-update-rss', async (req, res) => {
  const { ids, newName, newKeywords, newMonitorInterval, newBlacklistKeywords, newNotificationChannelIds, newGroupName } = req.body;

  // 验证请求数据
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request. Please provide valid IDs.' });
  }

  try {
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

    if (newGroupName !== undefined) {
      queryParts.push('group_name = ?');
      params.push(newGroupName);
    }

    let updatedCount = 0;

    // 如果有基本字段需要更新
    if (queryParts.length > 0) {
      const fullQuery = `UPDATE rss SET ${queryParts.join(', ')} WHERE id IN (${ids.map(() => '?').join(',')})`;
      const fullParams = [...params, ...ids];

      await new Promise((resolve, reject) => {
        db.run(fullQuery, fullParams, function(err) {
          if (err) {
            return reject(err);
          }
          updatedCount = this.changes;
          resolve();
        });
      });
    }

    // 如果需要更新通知渠道
    if (newNotificationChannelIds && Array.isArray(newNotificationChannelIds)) {
      const channelIds = newNotificationChannelIds.filter(id => id && !isNaN(id)).map(id => parseInt(id));
      
      // 为每个RSS源更新通知渠道关联
      for (const rssId of ids) {
        await setRssNotificationChannels(rssId, channelIds);
      }
      
      if (updatedCount === 0) {
        updatedCount = ids.length; // 如果只更新了通知渠道，设置更新数量为RSS源数量
      }
    }

    if (queryParts.length === 0 && (!newNotificationChannelIds || newNotificationChannelIds.length === 0)) {
      return res.status(400).json({ error: 'No fields to update provided.' });
    }

    res.json({ message: 'RSS sources updated successfully', updatedCount: updatedCount });
  } catch (err) {
    console.error('Error updating RSS sources:', err);
    res.status(500).json({ error: 'Failed to update selected RSS sources' });
  }
});

// 添加通知渠道
app.post('/api/notifications', (req, res) => {
  const { name, type, endpoint, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认值
  const channelType = type || 'gotify';
  const isActive = active !== undefined ? active : true;

  // 保存到数据库
  db.run(
    "INSERT INTO notifications (name, type, endpoint, active) VALUES (?, ?, ?, ?)",
    [name, channelType, endpoint, isActive],
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
  const { name, type, endpoint, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认值
  const channelType = type || 'gotify';
  const isActive = active !== undefined ? active : true;

  // 更新数据库
  db.run(
    "UPDATE notifications SET name = ?, type = ?, endpoint = ?, active = ? WHERE id = ?",
    [name, channelType, endpoint, isActive, id],
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
    const testTitle = `Markdown格式测试`;
    const testContent = `
这是一条测试内容，支持**加粗**、*斜体*和~~删除线~~格式。

- 列表项1
- 列表项2
- 列表项3

> 这是引用文本
> 可以有多行

\`\`\`
这是代码块
console.log('Hello World');
\`\`\`

表格示例：
| 名称 | 值 |
|------|-----|
| 测试1 | 数据1 |
| 测试2 | 数据2 |

📷 **图片链接示例**:
[图片1](https://example.com/image1.jpg)
[图片2](https://example.com/image2.jpg)
`;
    const testLink = `https://example.com/test`;

    // 发送测试消息
    await sendNotification(testSourceName, testTitle, testContent, testLink, id);

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

// 获取RSS源关联的所有通知渠道ID
const getRssNotificationChannels = (rssId) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT notification_channel_id FROM rss_notification_channels WHERE rss_id = ?", 
      [rssId], 
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows.map(row => row.notification_channel_id));
      }
    );
  });
};

// 设置RSS源的通知渠道
const setRssNotificationChannels = (rssId, channelIds) => {
  return new Promise((resolve, reject) => {
    // 先删除现有的关联
    db.run("DELETE FROM rss_notification_channels WHERE rss_id = ?", [rssId], (err) => {
      if (err) {
        return reject(err);
      }
      
      // 如果没有新的渠道ID，直接返回
      if (!channelIds || channelIds.length === 0) {
        return resolve();
      }
      
      // 插入新的关联
      const placeholders = channelIds.map(() => '(?, ?)').join(', ');
      const values = [];
      channelIds.forEach(channelId => {
        values.push(rssId, channelId);
      });
      
      db.run(
        `INSERT INTO rss_notification_channels (rss_id, notification_channel_id) VALUES ${placeholders}`,
        values,
        function(err) {
          if (err) {
            return reject(err);
          }
          resolve();
        }
      );
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

    // 获取该RSS源关联的所有通知渠道
    const channelIds = await getRssNotificationChannels(source.id);

    // 进行测试抓取
    await testFetchRss(source.url, keywords, blacklistKeywords, channelIds);

    res.json({ message: 'RSS 源测试成功' });
  } catch (error) {
    console.error('测试 RSS 源时出错:', error);
    res.status(500).json({ error: '测试 RSS 源失败' });
  }
});

const testFetchRss = async (url, keywords, blacklistKeywords, notificationChannelIds) => {
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
        // 发送到所有关联的通知渠道
        await sendNotificationToMultipleChannels(sourceData.name, item.title, item.content, item.link, notificationChannelIds);
        
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
  const { name, url, keywords, blacklist_keywords, monitor_interval, notification_channel_ids, group_name } = req.body;

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

    // 处理通知渠道ID
    const channelIds = Array.isArray(notification_channel_ids) 
      ? notification_channel_ids.filter(id => id && !isNaN(id)).map(id => parseInt(id))
      : (notification_channel_ids ? [parseInt(notification_channel_ids)] : []);

    // 设置默认监测间隔为 30 分钟
    const interval = monitor_interval || 30;
    const group = group_name || '';

    // 更新数据库中的 RSS 源（不再更新notification_channel_id字段）
    db.run(
      "UPDATE rss SET name = ?, url = ?, keywords = ?, blacklist_keywords = ?, monitor_interval = ?, group_name = ? WHERE id = ?",
      [name, url, keywordsArray.join(', '), blacklistArray.join(', '), interval, group, id],
      async function(err) {
        if (err) {
          console.error('数据库错误:', err);
          return res.status(500).json({ error: '无法更新 RSS 源' });
        }

        try {
          // 更新通知渠道关联
          await setRssNotificationChannels(id, channelIds);

          // 尝试重新抓取以反映更改
          await fetchRss(url, keywordsArray, blacklistArray, channelIds);
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
        // 获取该RSS源关联的所有通知渠道
        const channelIds = await getRssNotificationChannels(source.id);
        await fetchRss(source.url, keywords, blacklistKeywords, channelIds);
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