import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import config from './config';

const RssManagement = () => {
  const [sources, setSources] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); // 用来保存选中的RSS源ID
  const [bulkAction, setBulkAction] = useState(''); // 批量操作类型
  const [newMonitorInterval, setNewMonitorInterval] = useState(''); // 新的监控间隔
  const [newBlacklistKeywords, setNewBlacklistKeywords] = useState(''); // 新的黑名单关键词
  const [newKeywords, setNewKeywords] = useState(''); // 新的关键词
  const [newName, setNewName] = useState(''); // 新的名称
  const [newNotificationChannelIds, setNewNotificationChannelIds] = useState([]); // 新的通知方式ID数组
  const [newGroupName, setNewGroupName] = useState(''); // 新的分组名称
  const [notificationChannels, setNotificationChannels] = useState([]); // 存储通知渠道
  const [groups, setGroups] = useState([]); // 存储分组列表
  const [selectedGroup, setSelectedGroup] = useState(''); // 当前选中的分组
  const [groupedSources, setGroupedSources] = useState({}); // 按分组组织的RSS源
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const { getAuthHeaders } = useAuth();

  // 获取所有 RSS 源
  const fetchSources = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}${config.API_PREFIX}/rss-sources`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('获取RSS源失败');
      const data = await response.json();
      setSources(data);
      
      // 按分组组织数据
      const grouped = data.reduce((acc, source) => {
        const group = source.group_name || '未分组';
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(source);
        return acc;
      }, {});
      setGroupedSources(grouped);
    } catch (err) {
      setError('加载RSS源失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有通知渠道
  useEffect(() => {
    const fetchNotificationChannels = async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}${config.API_PREFIX}/notifications`, {
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

  // 初始加载
  useEffect(() => {
    fetchSources();
  }, []);

  // 删除单个 RSS 源
  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此RSS源吗?')) {
      return;
    }

    try {
      await fetch(`${config.API_BASE_URL}${config.API_PREFIX}/rss-sources/${id}`, { 
        method: 'DELETE',
        headers: {
          ...getAuthHeaders()
        }
      });
      setSuccess('RSS源删除成功');
      fetchSources(); // 刷新列表
    } catch (err) {
      setError('删除RSS源失败');
    }
  };

  // 删除选中的 RSS 源
  const handleDeleteSelected = async () => {
    if (!window.confirm('确定删除选中的RSS源吗?')) {
      return;
    }

    try {
      const promises = selectedIds.map(id =>
        fetch(`${config.API_BASE_URL}${config.API_PREFIX}/rss-sources/${id}`, { 
          method: 'DELETE',
          headers: {
            ...getAuthHeaders()
          }
        })
      );
      await Promise.all(promises);
      setSuccess('选中的RSS源删除成功');
      setSelectedIds([]); // 清空选中的ID
      fetchSources(); // 刷新列表
    } catch (err) {
      setError('删除选中的RSS源失败');
    }
  };

  // 批量修改选中的 RSS 源
  const handleBulkUpdate = async () => {
    if (selectedIds.length === 0) {
      setError('未选择任何RSS源');
      return;
    }

    let payload = {};
    switch (bulkAction) {
      case 'updateName':
        if (!newName) {
          setError('请输入新的名称进行批量更新');
          return;
        }
        payload = { ids: selectedIds, newName };
        break;
      case 'updateKeywords':
        if (!newKeywords) {
          setError('请输入新的关键词进行批量更新');
          return;
        }
        payload = { ids: selectedIds, newKeywords };
        break;
      case 'updateBlacklistKeywords':
        if (!newBlacklistKeywords) {
          setError('请输入新的黑名单关键词进行批量更新');
          return;
        }
        payload = { ids: selectedIds, newBlacklistKeywords };
        break;
      case 'updateMonitorInterval':
        if (!newMonitorInterval || isNaN(newMonitorInterval) || parseInt(newMonitorInterval) <= 0) {
          setError('请输入有效的监控间隔（分钟）');
          return;
        }
        payload = { ids: selectedIds, newMonitorInterval: parseInt(newMonitorInterval) };
        break;
      case 'updateNotificationChannel':
        if (!newNotificationChannelIds || newNotificationChannelIds.length === 0) {
          setError('请选择新的通知方式进行批量更新');
          return;
        }
        payload = { ids: selectedIds, newNotificationChannelIds: newNotificationChannelIds };
        break;
      case 'updateGroupName':
        payload = { ids: selectedIds, newGroupName };
        break;
      case 'deleteSelected':
        handleDeleteSelected();
        return;
      default:
        setError('请选择一个批量操作');
        return;
    }

    console.log('Sending payload:', payload); // 添加调试信息

    try {
      const response = await fetch(`${config.API_BASE_URL}${config.API_PREFIX}/bulk-update-rss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json(); // 尝试获取服务器返回的错误信息
        setError(errorData.error || '更新选中的RSS源失败');
        return;
      }

      const data = await response.json();
      setSuccess(`成功更新了${data.updatedCount}个RSS源`);
      setSelectedIds([]); // 清空选中的ID
      setBulkAction(''); // 清空批量操作类型
      setNewMonitorInterval(''); // 清空监控间隔输入框
      setNewBlacklistKeywords(''); // 清空黑名单关键词输入框
      setNewKeywords(''); // 清空关键词输入框
      setNewName(''); // 清空名称输入框
      setNewNotificationChannelIds([]); // 清空通知方式输入框
      setNewGroupName(''); // 清空分组名称输入框
      fetchSources(); // 刷新列表
    } catch (err) {
      setError('更新选中的RSS源失败');
    }
  };

  // 处理复选框变化
  const handleCheckboxChange = (id) => {
    setSelectedIds((prevSelectedIds) => {
      if (prevSelectedIds.includes(id)) {
        // 如果已经选中，取消选中
        return prevSelectedIds.filter((itemId) => itemId !== id);
      } else {
        // 如果未选中，添加到选中列表
        return [...prevSelectedIds, id];
      }
    });
  };

  // 全选或取消全选
  const handleSelectAll = () => {
    if (selectedIds.length === sources.length) {
      setSelectedIds([]); // 取消全选
    } else {
      setSelectedIds(sources.map(source => source.id)); // 全选
    }
  };

  // 辅助函数：验证日期字符串是否有效
  const isValidDate = (dateString) => {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };

  // 测试单个 RSS 源
  const handleTest = async (id) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}${config.API_PREFIX}/test-rss/${id}`, { 
        method: 'GET',
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('测试RSS源失败');
      const data = await response.json();
      setSuccess(`测试RSS源成功: ${data.message}`);
    } catch (err) {
      setError('测试RSS源失败');
    }
  };

  // 编辑单个 RSS 源
  const handleEdit = (id) => {
    window.location.href = `/edit-rss-source/${id}`;
  };

  return (
    <div className="max-w-full mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">RSS源管理</h1>

      {/* 导航链接 */}
      <Link to="/add-rss-source" className="inline-block mb-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 block w-full sm:inline-block sm:w-auto">
        添加新的RSS源
      </Link>

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

      {/* 列表部分 */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <h2 className="text-lg font-semibold p-4 border-b">RSS源</h2>

        {loading ? (
          <div className="p-4 text-center text-gray-500">正在加载...</div>
        ) : sources.length === 0 ? (
          <div className="p-4 text-center text-gray-500">尚未添加任何RSS源</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row justify-between items-center p-4 border-b">
              <div className="flex items-center mb-2 md:mb-0">
                <button
                  onClick={handleSelectAll}
                  className="mr-4 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300"
                >
                  {selectedIds.length === sources.length ? '取消全选' : '全选'}
                </button>

                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md mr-2"
                >
                  <option value="">选择批量操作</option>
                  <option value="updateName">更新名称</option>
                  <option value="updateKeywords">更新关键词</option>
                  <option value="updateBlacklistKeywords">更新黑名单关键词</option>
                  <option value="updateMonitorInterval">更新监控间隔</option>
                  <option value="updateNotificationChannel">更新通知方式</option>
                  <option value="updateGroupName">更新分组</option>
                  <option value="deleteSelected">删除选中项</option>
                </select>

                {bulkAction === 'updateName' && (
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="新名称"
                    className="p-2 border border-gray-300 rounded-md mr-2"
                  />
                )}

                {bulkAction === 'updateKeywords' && (
                  <input
                    type="text"
                    value={newKeywords}
                    onChange={(e) => setNewKeywords(e.target.value)}
                    placeholder="新关键词"
                    className="p-2 border border-gray-300 rounded-md mr-2"
                  />
                )}

                {bulkAction === 'updateBlacklistKeywords' && (
                  <input
                    type="text"
                    value={newBlacklistKeywords}
                    onChange={(e) => setNewBlacklistKeywords(e.target.value)}
                    placeholder="新黑名单关键词"
                    className="p-2 border border-gray-300 rounded-md mr-2"
                  />
                )}

                {bulkAction === 'updateMonitorInterval' && (
                  <input
                    type="number"
                    value={newMonitorInterval}
                    onChange={(e) => setNewMonitorInterval(e.target.value)}
                    placeholder="新监控间隔（分钟）"
                    className="p-2 border border-gray-300 rounded-md mr-2"
                  />
                )}

                {bulkAction === 'updateNotificationChannel' && (
                  <div className="flex flex-col space-y-2 p-3 border border-gray-300 rounded-md mr-2 bg-gray-50">
                    <label className="text-sm font-medium text-gray-700">选择通知方式：</label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {notificationChannels.map(channel => (
                        <label key={channel.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={channel.id}
                            checked={newNotificationChannelIds.includes(channel.id)}
                            onChange={(e) => {
                              const channelId = parseInt(e.target.value);
                              if (e.target.checked) {
                                setNewNotificationChannelIds(prev => [...prev, channelId]);
                              } else {
                                setNewNotificationChannelIds(prev => prev.filter(id => id !== channelId));
                              }
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                            {channel.name} ({channel.type === 'bark' ? 'Bark' : 'Gotify'})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {bulkAction === 'updateGroupName' && (
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="新分组名称"
                    className="p-2 border border-gray-300 rounded-md mr-2"
                  />
                )}

                <button
                  onClick={handleBulkUpdate}
                  disabled={selectedIds.length === 0 || !bulkAction}
                  className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
                >
                  执行批量操作
                </button>
              </div>
            </div>

            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    选择
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称/标题
                  </th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    分组
                  </th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    关键词
                  </th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    黑名单关键词
                  </th>
                  <th scope="col" className="table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    监控间隔（分钟）
                  </th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    通知方式
                  </th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    添加时间
                  </th>
                  <th scope="col" className="relative px-4 py-3">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(source.id)}
                        onChange={() => handleCheckboxChange(source.id)}
                        className="mr-2"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {source.name || source.title || '无名称/标题'}
                      </a>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap">
                      <div>{source.group_name || '未分组'}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap truncate max-w-sm">
                      <div>{source.keywords}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap truncate max-w-sm">
                      <div>{source.blacklist_keywords || '无'}</div> {/* 确保显示默认值 */}
                    </td>
                    <td className="table-cell px-4 py-4 whitespace-nowrap">
                      <div>{source.monitor_interval}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap">
                      <div>{source.notification_channel_names || '无'}</div> {/* 显示通知方式 */}
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isValidDate(source.created_at)
                        ? new Date(source.created_at).toLocaleString()
                        : '未知'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleTest(source.id)}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        测试
                      </button>
                      <button
                        onClick={() => handleEdit(source.id)}
                        className="text-yellow-600 hover:text-yellow-800 mr-2"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};

export default RssManagement;



