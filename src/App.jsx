import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AddRssSource from './AddRssSource';
import RssManagement from './RssManagement';
import NotificationSettings from './NotificationSettings'; // 引入新的通知设置组件
import Navbar from './Navbar'; // 引入导航栏组件

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Navbar /> {/* 添加导航栏 */}
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" exact element={<RssManagement />} />
            <Route path="/add-rss-source" element={<AddRssSource />} />
            <Route path="/rss-management" element={<RssManagement />} />
            <Route path="/notification-settings" element={<NotificationSettings />} /> {/* 添加新路由 */}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;



