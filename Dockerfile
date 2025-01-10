# 使用 Node.js 作为基础镜像
FROM node:16-alpine

# 安装 nginx
RUN apk add --no-cache nginx

# 设置工作目录
WORKDIR /app

# 复制前端构建文件
COPY dist/ /usr/share/nginx/html/

# 创建 nginx 配置目录
RUN mkdir -p /etc/nginx/conf.d

# 复制自定义的 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 设置后端目录并安装后端依赖
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install

# 复制后端文件
COPY backend/server.js ./
COPY backend/.env ./
COPY backend/rss.db ./

# 安装 serve 包
RUN npm install -g serve

# 设置环境变量
ENV PORT=5173
ENV NODE_ENV=production

# 暴露端口
EXPOSE 80

# 复制启动脚本
COPY start.sh /app/
RUN chmod +x /app/start.sh

# 运行启动脚本
CMD ["/app/start.sh"]