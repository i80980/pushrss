# PushRSS

PushRSS 是一个简单的 RSS 订阅和推送管理系统。它允许用户订阅 RSS 源并通过Gotify通知渠道接收更新。

> 建议搭配RSSHUB使用 

## 功能特点

- 多个RSS源管理
- 支持RSS源订阅
- RSS关键词监测
- 关键词定时监测推送
- 黑名单关键词屏蔽
- 通知渠道配置
- 用户认证系统
- 响应式界面设计

## 技术栈

### 前端
- React
- React Router
- Tailwind CSS

### 后端
- Node.js
- Express
- SQLite3
- RSS Parser

## Docker 安装


1. 确保已安装 Docker。
2. 创建 `rss.db` 文件和 `.env` 文件。
3. 运行以下命令以启动容器：
   ```bash
   docker run -d \
     --name pushrss \
     -p 6666:80 \
     -v ./rss.db:/app/rss.db \
     -v ./.env:/app/.env \
     i80980/pushrss:latest
   ```
4. 访问 `6666`端口 以使用 PushRSS。

## Docker Compose安装


1. 确保已安装 Docker 和 Docker Compose。
2. 将上述配置保存为 `docker-compose.yml` 文件。
3. 新建 `rss.db` 文件和 `.env` 文件。
```bash
services:
  pushrss:
    container_name: pushrss
    image: i80980/pushrss:latest
    ports:
      - "6666:80"
    volumes:
      - ./rss.db:/app/rss.db
      - ./.env:/app/.env
```
4. 在终端中导航到该文件所在目录。
5. 运行以下命令以启动服务：
   ```bash
   docker-compose up -d
   ```
6. 访问 `6666`端口 以使用 PushRSS。

> 默认密码：admin

## 修改密码
在.env文件中修改密码

```bash
ACCESS_PASSWORD=你的密码
``` 
修改后重启容器


# 搭配RssHub使用
```bash
services:
  pushrss:
    container_name: pushrss
    image: i80980/pushrss:latest
    ports:
      - "6666:80"
    volumes:
      - ./rss.db:/app/rss.db
      - ./.env:/app/.env
  rsshub:
    image: diygod/rsshub
    ports:
      - 1200:1200
    environment:
      - CACHE_EXPIRE=60
```
将rsshub缓存时间设置为60秒，及时收到rss更新推送








