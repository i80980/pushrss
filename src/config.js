// API配置
const isDevelopment = process.env.NODE_ENV === 'development';

// 在开发环境使用完整URL，在生产环境使用相对路径
const API_BASE_URL = isDevelopment ? 'http://localhost:3001' : '';

// API路径前缀（为空，因为后端路由没有使用/api前缀）
const API_PREFIX = '/api';

const config = {
  API_BASE_URL,
  API_PREFIX
};

export default config; 