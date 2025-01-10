#!/bin/sh

# 启动后端服务
cd /app/backend
node server.js &

# 前台运行 nginx
nginx -g 'daemon off;'