import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import config from './config';

const GroupManagement = () => {
  const [groups, setGroups] = useState([]);
  const [allGroupedSources, setAllGroupedSources] = useState({});
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupSources, setGroupSources] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newBlacklistKeywords, setNewBlacklistKeywords] = useState('');
  const [newMonitorInterval, setNewMonitorInterval] = useState('');
  const [newNotificationChannelIds, setNewNotificationChannelIds] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [notificationChannels, setNotificationChannels] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { getAuthHeaders } = useAuth();

  // 获取所有RSS源并按分组组织
  const fetchAllGroupedSources = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rss-sources`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('获取RSS源失败');
      const data = await response.json();
      
      // 按分组组织数据
      const grouped = data.reduce((acc, source) => {
        const group = source.group_name || '未分组';
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(source);
        return acc;
      }, {});
      
      setAllGroupedSources(grouped);
      setGroups(Object.keys(grouped).sort());
    } catch (err) {
      setError('加载RSS源失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取分组内的RSS源
  const fetchGroupSources = async (groupName) => {
    if (!groupName) {
      setGroupSources([]);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/rss-sources/group/${encodeURIComponent(groupName)}`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('获取分组RSS源失败');
      const data = await response.json();
      setGroupSources(data);
    } catch (err) {
      setError('加载分组RSS源失败');
    } finally {
      setLoading(false);
    }
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

    fetchAllGroupedSources();
    fetchNotificationChannels();
  }, [getAuthHeaders]);

  // 当选中分组改变时，获取该分组的RSS源
  useEffect(() => {
    fetchGroupSources(selectedGroup);
  }, [selectedGroup]);

  // 批量更新分组内的RSS源
  const handleBulkUpdateGroup = async () => {
    if (!selectedGroup) {
      setError('请先选择一个分组');
      return;
    }

    let payload = { groupName: selectedGroup };
    
    switch (bulkAction) {
      case 'updateName':
        if (!newName) {
          setError('请输入新的名称');
          return;
        }
        payload.newName = newName;
        break;
      case 'updateKeywords':
        if (!newKeywords) {
          setError('请输入新的关键词');
          return;
        }
        payload.newKeywords = newKeywords;
        break;
      case 'updateBlacklistKeywords':
        if (!newBlacklistKeywords) {
          setError('请输入新的黑名单关键词');
          return;
        }
        payload.newBlacklistKeywords = newBlacklistKeywords;
        break;
      case 'updateMonitorInterval':
        if (!newMonitorInterval || isNaN(newMonitorInterval) || parseInt(newMonitorInterval) <= 0) {
          setError('请输入有效的监控间隔（分钟）');
          return;
        }
        payload.newMonitorInterval = parseInt(newMonitorInterval);
        break;
      case 'updateNotificationChannel':
        if (!newNotificationChannelIds || newNotificationChannelIds.length === 0) {
          setError('请选择新的通知方式');
          return;
        }
        payload.newNotificationChannelIds = newNotificationChannelIds;
        break;
      case 'updateGroupName':
        if (!newGroupName) {
          setError('请输入新的分组名称');
          return;
        }
        payload.newGroupName = newGroupName;
        break;
      default:
        setError('请选择一个批量操作');
        return;
    }

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/bulk-update-group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || '更新分组失败');
        return;
      }

      const data = await response.json();
      setSuccess(`成功更新了${data.updatedCount}个RSS源`);
      
      // 清空表单
      setBulkAction('');
      setNewName('');
      setNewKeywords('');
      setNewBlacklistKeywords('');
      setNewMonitorInterval('');
      setNewNotificationChannelIds([]);
      setNewGroupName('');
      
      // 刷新数据
      fetchAllGroupedSources();
      if (selectedGroup) {
        fetchGroupSources(selectedGroup);
      }
    } catch (err) {
      setError('更新分组失败');
    }
  };

  return (
    <div className="max-w-full mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">分组管理</h1>

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

      {loading ? (
        <div className="p-8 text-center text-gray-500">正在加载...</div>
      ) : (
        <>
          {/* 统计信息 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4">
              <div className="text-2xl font-bold">{groups.length}</div>
              <div className="text-blue-100">总分组数</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4">
              <div className="text-2xl font-bold">
                {Object.values(allGroupedSources).reduce((total, sources) => total + sources.length, 0)}
              </div>
              <div className="text-green-100">总RSS源数</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg p-4">
              <div className="text-2xl font-bold">
                {Math.round(Object.values(allGroupedSources).reduce((total, sources) => total + sources.length, 0) / Math.max(groups.length, 1))}
              </div>
              <div className="text-purple-100">平均每组源数</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg p-4">
              <div className="text-2xl font-bold">
                {allGroupedSources['未分组']?.length || 0}
              </div>
              <div className="text-orange-100">未分组源数</div>
            </div>
          </div>

          {/* 所有分组概览 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {groups.map((groupName) => (
              <div key={groupName} className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-all duration-200 border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                    {groupName === '未分组' ? (
                      <span className="mr-2">📂</span>
                    ) : (
                      <span className="mr-2">📁</span>
                    )}
                    {groupName}
                  </h3>
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    groupName === '未分组' 
                      ? 'bg-gray-100 text-gray-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {allGroupedSources[groupName]?.length || 0} 个源
                  </span>
                </div>
                <div className="space-y-2 mb-4 min-h-[80px]">
                  {(allGroupedSources[groupName] || []).slice(0, 3).map((source) => (
                    <div key={source.id} className="text-sm text-gray-600 truncate flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2 flex-shrink-0"></span>
                      {source.name || source.title || '无名称'}
                    </div>
                  ))}
                  {(allGroupedSources[groupName]?.length || 0) > 3 && (
                    <div className="text-sm text-gray-500 italic">
                      ... 还有 {(allGroupedSources[groupName]?.length || 0) - 3} 个源
                    </div>
                  )}
                  {(allGroupedSources[groupName]?.length || 0) === 0 && (
                    <div className="text-sm text-gray-400 italic">暂无RSS源</div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedGroup(groupName)}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  管理此分组
                </button>
              </div>
            ))}
          </div>

          {/* 快速添加RSS源 */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">快速操作</h2>
            <div className="flex flex-wrap gap-2">
              <a
                href="/add-rss-source"
                className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 text-sm"
              >
                添加新RSS源
              </a>
              <a
                href="/rss-management"
                className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 text-sm"
              >
                RSS源管理
              </a>
              <a
                href="/notification-management"
                className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 text-sm"
              >
                通知管理
              </a>
            </div>
          </div>
        </>
      )}

      {/* 批量操作 */}
      {selectedGroup && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-4">批量操作分组：{selectedGroup}</h2>
          
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="p-2 border border-gray-300 rounded-md"
            >
              <option value="">选择批量操作</option>
              <option value="updateName">更新名称</option>
              <option value="updateKeywords">更新关键词</option>
              <option value="updateBlacklistKeywords">更新黑名单关键词</option>
              <option value="updateMonitorInterval">更新监控间隔</option>
              <option value="updateNotificationChannel">更新通知方式</option>
              <option value="updateGroupName">更新分组名称</option>
            </select>

            {bulkAction === 'updateName' && (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="新名称"
                className="p-2 border border-gray-300 rounded-md"
              />
            )}

            {bulkAction === 'updateKeywords' && (
              <input
                type="text"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="新关键词"
                className="p-2 border border-gray-300 rounded-md"
              />
            )}

            {bulkAction === 'updateBlacklistKeywords' && (
              <input
                type="text"
                value={newBlacklistKeywords}
                onChange={(e) => setNewBlacklistKeywords(e.target.value)}
                placeholder="新黑名单关键词"
                className="p-2 border border-gray-300 rounded-md"
              />
            )}

            {bulkAction === 'updateMonitorInterval' && (
              <input
                type="number"
                value={newMonitorInterval}
                onChange={(e) => setNewMonitorInterval(e.target.value)}
                placeholder="新监控间隔（分钟）"
                className="p-2 border border-gray-300 rounded-md"
              />
            )}

            {bulkAction === 'updateNotificationChannel' && (
              <div className="flex flex-col space-y-2 p-3 border border-gray-300 rounded-md bg-gray-50">
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
                className="p-2 border border-gray-300 rounded-md"
              />
            )}

            <button
              onClick={handleBulkUpdateGroup}
              disabled={!bulkAction}
              className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              执行批量操作
            </button>
          </div>
        </div>
      )}

      {/* 分组内RSS源列表 */}
      {selectedGroup && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <h2 className="text-lg font-semibold p-4 border-b">分组 "{selectedGroup}" 内的RSS源</h2>

          {loading ? (
            <div className="p-4 text-center text-gray-500">正在加载...</div>
          ) : groupSources.length === 0 ? (
            <div className="p-4 text-center text-gray-500">该分组内暂无RSS源</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupSources.map((source) => (
                  <tr key={source.id}>
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
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap truncate max-w-sm">
                      <div>{source.keywords}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap truncate max-w-sm">
                      <div>{source.blacklist_keywords || '无'}</div>
                    </td>
                    <td className="table-cell px-4 py-4 whitespace-nowrap">
                      <div>{source.monitor_interval}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap">
                      <div>{source.notification_channel_names || '无'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupManagement; 