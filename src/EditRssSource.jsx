// src/EditRssSource.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import config from './config';

const EditRssSource = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ 
    rssUrl: '', 
    name: '',
    keywords: '', 
    blacklistKeywords: '', 
    monitorInterval: '', 
    notificationChannelIds: [], // 修改为数组，支持多个通知渠道
    groupName: '' // 新增分组字段
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notificationChannels, setNotificationChannels] = useState([]); // 存储通知渠道列表
  const [groups, setGroups] = useState([]); // 存储分组列表
  const { getAuthHeaders } = useAuth();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'notificationChannelIds') {
      // 处理复选框
      const channelId = parseInt(value);
      setFormData((prev) => {
        const currentIds = prev.notificationChannelIds || [];
        if (checked) {
          // 添加到选中列表
          return {
            ...prev,
            notificationChannelIds: [...currentIds, channelId]
          };
        } else {
          // 从选中列表移除
          return {
            ...prev,
            notificationChannelIds: currentIds.filter(id => id !== channelId)
          };
        }
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // 获取所有通知渠道和分组
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

    const fetchGroups = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/rss-groups`, {
          headers: {
            ...getAuthHeaders()
          }
        });
        if (!response.ok) throw new Error('Failed to fetch groups');
        const data = await response.json();
        setGroups(data);
      } catch (err) {
        console.error('Error fetching groups:', err);
      }
    };

    fetchNotificationChannels();
    fetchGroups();
  }, [getAuthHeaders]);

  // 获取现有的 RSS 源数据
  useEffect(() => {
    const fetchRssSource = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/rss-sources/${id}`, {
          headers: {
            ...getAuthHeaders()
          }
        });
        if (!response.ok) throw new Error('Failed to fetch RSS source');
        const data = await response.json();
        setFormData({
          rssUrl: data.url,
          name: data.name,
          keywords: data.keywords || '',
          blacklistKeywords: data.blacklist_keywords || '',
          monitorInterval: data.monitor_interval.toString(),
          notificationChannelIds: data.notification_channel_ids || [],
          groupName: data.group_name || ''
        });
      } catch (err) {
        setError(err.message);
      }
    };

    fetchRssSource();
  }, [id, getAuthHeaders]);

  // 更新现有的 RSS 源
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 验证至少选择一个通知方式
    if (!formData.notificationChannelIds || formData.notificationChannelIds.length === 0) {
      setError('请至少选择一个通知方式');
      return;
    }

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rss-sources/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          url: formData.rssUrl,
          name: formData.name,
          keywords: formData.keywords,
          blacklist_keywords: formData.blacklistKeywords,
          monitor_interval: parseInt(formData.monitorInterval),
          notification_channel_ids: formData.notificationChannelIds,
          group_name: formData.groupName
        }),
      });

      if (!response.ok) throw new Error('更新RSS源失败');

      const data = await response.json();
      setSuccess('RSS源更新成功');
      setTimeout(() => {
        navigate('/rss-management'); // 成功后跳转到RSS管理页面
      }, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">编辑RSS源</h1>

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
          <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">
            分组
          </label>
          <input
            id="groupName"
            name="groupName"
            type="text"
            value={formData.groupName}
            onChange={handleChange}
            placeholder="输入分组名称（可选）"
            list="groupsList"
            className="w-full p-2 border border-gray-300 rounded-md"
          />
          <datalist id="groupsList">
            {groups.map((group, index) => (
              <option key={index} value={group} />
            ))}
          </datalist>
          <p className="mt-1 text-sm text-gray-500">
            可以输入新的分组名称，或从现有分组中选择
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            通知方式（可多选）
          </label>
          <div className="space-y-2">
            {notificationChannels.map(channel => (
              <label key={channel.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="notificationChannelIds"
                  value={channel.id}
                  checked={formData.notificationChannelIds.includes(channel.id)}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {channel.name} ({channel.type === 'bark' ? 'Bark' : 'Gotify'})
                </span>
              </label>
            ))}
          </div>
          {formData.notificationChannelIds.length === 0 && (
            <p className="mt-2 text-sm text-red-500">
              请至少选择一个通知方式
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          更新RSS源
        </button>
      </form>
    </div>
  );
};

export default EditRssSource;