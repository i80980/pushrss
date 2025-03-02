// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AddRssSource from './AddRssSource';
import RssManagement from './RssManagement';
import NotificationSettings from './NotificationSettings'; // 引入新的通知设置组件
import Navbar from './Navbar'; // 引入导航栏组件
import EditRssSource from './EditRssSource'; // 引入编辑 RSS 源组件
import Login from './Login'; // 引入登录组件
import { AuthProvider } from './AuthContext'; // 引入身份验证上下文
import ProtectedRoute from './ProtectedRoute'; // 引入受保护的路由组件

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen flex flex-col">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <main className="flex-1 p-6">
                    <RssManagement />
                  </main>
                </>
              </ProtectedRoute>
            } />
            <Route path="/add-rss-source" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <main className="flex-1 p-6">
                    <AddRssSource />
                  </main>
                </>
              </ProtectedRoute>
            } />
            <Route path="/rss-management" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <main className="flex-1 p-6">
                    <RssManagement />
                  </main>
                </>
              </ProtectedRoute>
            } />
            <Route path="/notification-settings" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <main className="flex-1 p-6">
                    <NotificationSettings />
                  </main>
                </>
              </ProtectedRoute>
            } />
            <Route path="/edit-rss-source/:id" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <main className="flex-1 p-6">
                    <EditRssSource />
                  </main>
                </>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;