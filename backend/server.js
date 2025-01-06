require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Parser = require('rss-parser');
const sqlite3 = require('sqlite3').verbose();

// 集中配置管理
const config = {
  port: process.env.PORT || 3000,
  gotify: {
    url: process.env.GOTIFY_URL,
    token: process.env.GOTIFY_TOKEN,
    priority: parseInt(process.env.GOTIFY_PRIORITY || '5')
  },
  db: {
    path: process.env.DB_PATH || './rss.db'
  }
};

const app = express();
const parser = new Parser();

// 中间件
app.use(cors());
app.use(express.json());

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 创建时间
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
      send_test_message BOOLEAN DEFAULT FALSE, -- 不发送测试消息
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
});

const fetchRss = async (url, keywords, blacklistKeywords) => {
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

    feed.items.forEach(item => {
      // 检查黑名单关键词
      const matchesBlacklist = blacklistKeywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) ||
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesBlacklist) {
        console.log(`Item with blacklisted keyword skipped: ${item.title}`);
        return; // 如果匹配黑名单关键词，则跳过该条目
      }

      // 检查关键词匹配
      const matchesKeywords = keywords.some(keyword => 
        (item.title?.toLowerCase() || '').includes(keyword.toLowerCase()) || 
        (item.content?.toLowerCase() || '').includes(keyword.toLowerCase())
      );

      if (matchesKeywords) {
        console.log(`Matching item found: ${item.title}`);
        sendToGotify(item.title, item.link);
      }
    });

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

const sendToGotify = async (title, link) => {
  try {
    if (!config.gotify.url || !config.gotify.token) {
      throw new Error('Gotify configuration is missing');
    }

    const response = await axios.post(config.gotify.url, {
      title: title,
      message: link,
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

app.post('/add-rss', async (req, res) => {
  const { rssUrl, name, keywords, blacklistKeywords, monitorInterval } = req.body;

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
      "INSERT INTO rss (url, name, keywords, blacklist_keywords, monitor_interval) VALUES (?, ?, ?, ?, ?)",
      [rssUrl, name, keywordsArray.join(', '), blacklistArray.join(', '), interval],
      async function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to save RSS source' });
        }

        try {
          // 尝试首次抓取
          await fetchRss(rssUrl, keywordsArray, blacklistArray);
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

// 定时任务：每隔一段时间检查所有 RSS 源
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
        await fetchRss(source.url, keywords, blacklistKeywords);
      } catch (error) {
        console.error(`Error fetching RSS source ${source.url}:`, error);
      }
    }
  });
};

// 启动定时任务，每分钟检查一次（实际应用中可以根据需要调整）
setInterval(checkAllRssSources, 60 * 1000);

// 优雅关闭
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});

// 获取所有 RSS 源
app.get('/rss-sources', (req, res) => {
  db.all("SELECT * FROM rss ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error('Error fetching RSS sources:', err);
      return res.status(500).json({ error: 'Failed to fetch RSS sources' });
    }
    res.json(rows);
  });
});

// 删除 RSS 源
app.delete('/rss-sources/:id', (req, res) => {
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
app.post('/bulk-update-rss', (req, res) => {
  const { ids, newName, newKeywords, newMonitorInterval, newBlacklistKeywords } = req.body;

  // 验证请求数据
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request. Please provide valid IDs.' });
  }

  let query = '';
  let params = [];

  if (newName !== undefined) {
    query += 'name = ?, ';
    params.push(newName);
  }

  if (newKeywords) {
    query += 'keywords = ?, ';
    params.push(newKeywords);
  }

  if (typeof newMonitorInterval === 'number') {
    query += 'monitor_interval = ?, ';
    params.push(newMonitorInterval);
  }

  if (newBlacklistKeywords) {
    query += 'blacklist_keywords = ?, ';
    params.push(newBlacklistKeywords);
  }

  if (query.length === 0) {
    return res.status(400).json({ error: 'No fields to update provided.' });
  }

  // 移除最后一个逗号和空格
  query = query.slice(0, -2);

  // 构建完整的 SQL 查询
  const fullQuery = `UPDATE rss SET ${query} WHERE id IN (${ids.map(() => '?').join(',')})`;
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
app.post('/notifications', (req, res) => {
  const { name, endpoint, sendTestMessage, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认是否发送测试消息为 false
  const testMessage = sendTestMessage !== undefined ? sendTestMessage : false;

  // 设置默认是否激活为 true
  const isActive = active !== undefined ? active : true;

  // 保存到数据库
  db.run(
    "INSERT INTO notifications (name, endpoint, send_test_message, active) VALUES (?, ?, ?, ?)",
    [name, endpoint, testMessage, isActive],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to save notification channel' });
      }

      res.json({ 
        message: 'Notification channel added successfully',
        id: this.lastID 
      });
    }
  );
});

// 获取所有通知渠道
app.get('/notifications', (req, res) => {
  db.all("SELECT * FROM notifications ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error('Error fetching notification channels:', err);
      return res.status(500).json({ error: 'Failed to fetch notification channels' });
    }
    res.json(rows);
  });
});

// 删除通知渠道
app.delete('/notifications/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM notifications WHERE id = ?", id, (err) => {
    if (err) {
      console.error('Error deleting notification channel:', err);
      return res.status(500).json({ error: 'Failed to delete notification channel' });
    }
    res.json({ message: 'Notification channel deleted successfully' });
  });
});

// 更新通知渠道
app.put('/notifications/:id', (req, res) => {
  const id = req.params.id;
  const { name, endpoint, sendTestMessage, active } = req.body;

  // 输入验证
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is a required field' });
  }

  // 设置默认是否发送测试消息为 false
  const testMessage = sendTestMessage !== undefined ? sendTestMessage : false;

  // 设置默认是否激活为 true
  const isActive = active !== undefined ? active : true;

  // 更新数据库
  db.run(
    "UPDATE notifications SET name = ?, endpoint = ?, send_test_message = ?, active = ? WHERE id = ?",
    [name, endpoint, testMessage, isActive, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to update notification channel' });
      }

      res.json({ 
        message: 'Notification channel updated successfully',
        id: id 
      });
    }
  );
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});



