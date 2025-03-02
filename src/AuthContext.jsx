import React, { createContext, useState, useEffect, useContext } from 'react';

// 创建身份验证上下文
const AuthContext = createContext();

// 自定义钩子，用于在组件中访问身份验证上下文
export const useAuth = () => useContext(AuthContext);

// 身份验证提供者组件
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authToken, setAuthToken] = useState(null);

  // 在组件挂载时检查本地存储中的令牌
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // 登录函数
  const login = (token) => {
    localStorage.setItem('authToken', token);
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  // 注销函数
  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // 获取带有授权头的请求选项
  const getAuthHeaders = () => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  // 提供身份验证上下文值
  const value = {
    isAuthenticated,
    isLoading,
    authToken,
    login,
    logout,
    getAuthHeaders
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext; 