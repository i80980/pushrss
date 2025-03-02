import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import config from './config';

const AddRssSource = () => {
  const [formData, setFormData] = useState({ 
    rssUrl: '', 
    name: '',
    keywords: '', 
    blacklistKeywords: '', 
    monitorInterval: '', 
    notificationChannelId: '' // 新增字段用于存储选中的通知渠道ID
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notificationChannels, setNotificationChannels] = useState([]); // 存储通知渠道列表
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // 获取所有通知渠道
  useEffect(() => {
    const fetchNotificationChannels = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/notifications`, {
          headers: {
            ...getAuthHeaders()
          }
        });
        if (!response.ok) throw new Error('Failed to fetch notification channels');
        const data = await response.json();
        setNotificationChannels(data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchNotificationChannels();
  }, [getAuthHeaders]);

  // 添加新的 RSS 源
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/add-rss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ...formData,
          notificationChannelId: formData.notificationChannelId // 包含选中的通知渠道ID
        }),
      });

      if (!response.ok) throw new Error('添加RSS源失败');

      const data = await response.json();
      setSuccess('RSS源添加成功');
      setFormData({ rssUrl: '', name: '', keywords: '', blacklistKeywords: '', monitorInterval: '', notificationChannelId: '' });
      setTimeout(() => {
        navigate('/rss-management'); // 成功后跳转到RSS管理页面
      }, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">添加新的RSS源</h1>

      {error && (
        <div className="p-4 mb-4 text-center text-red-700 bg-red-100 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 mb-4 text-center text-green-700 bg-green-100 rounded-md">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            名称
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            placeholder="RSS源名称"
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        <div>
          <label htmlFor="rssUrl" className="block text-sm font-medium text-gray-700 mb-1">
            RSS URL
          </label>
          <input
            id="rssUrl"
            name="rssUrl"
            type="text"
            value={formData.rssUrl}
            onChange={handleChange}
            placeholder="https://example.com/feed.xml"
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        <div>
          <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-1">
            关键词（逗号分隔）
          </label>
          <input
            id="keywords"
            name="keywords"
            type="text"
            value={formData.keywords}
            onChange={handleChange}
            placeholder="关键词1, 关键词2, 关键词3"
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        <div>
          <label htmlFor="blacklistKeywords" className="block text-sm font-medium text-gray-700 mb-1">
            黑名单关键词（逗号分隔）
          </label>
          <input
            id="blacklistKeywords"
            name="blacklistKeywords"
            type="text"
            value={formData.blacklistKeywords}
            onChange={handleChange}
            placeholder="黑名单关键词1, 黑名单关键词2"
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="monitorInterval" className="block text-sm font-medium text-gray-700 mb-1">
            监控间隔（分钟）
          </label>
          <input
            id="monitorInterval"
            name="monitorInterval"
            type="number"
            value={formData.monitorInterval}
            onChange={handleChange}
            min="1"
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="notificationChannelId" className="block text-sm font-medium text-gray-700 mb-1">
            通知方式
          </label>
          <select
            id="notificationChannelId"
            name="notificationChannelId"
            value={formData.notificationChannelId}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">请选择通知方式</option>
            {notificationChannels.map(channel => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          添加RSS源
        </button>
      </form>
    </div>
  );
};

export default AddRssSource;



