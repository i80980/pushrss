import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// 受保护的路由组件
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  // 如果正在加载，显示加载指示器
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 如果未经身份验证，重定向到登录页面
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 如果已经通过身份验证，渲染子组件
  return children;
};

export default ProtectedRoute; 