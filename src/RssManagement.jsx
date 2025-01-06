import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const RssManagement = () => {
  const [sources, setSources] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); // 用来保存选中的RSS源ID
  const [bulkAction, setBulkAction] = useState(''); // 批量操作类型
  const [newMonitorInterval, setNewMonitorInterval] = useState(''); // 新的监控间隔
  const [newBlacklistKeywords, setNewBlacklistKeywords] = useState(''); // 新的黑名单关键词
  const [newKeywords, setNewKeywords] = useState(''); // 新的关键词
  const [newName, setNewName] = useState(''); // 新的名称
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  // 获取所有 RSS 源
  const fetchSources = async () => {
    try {
      const response = await fetch('http://localhost:3000/rss-sources');
      if (!response.ok) throw new Error('获取RSS源失败');
      const data = await response.json();
      setSources(data);
    } catch (err) {
      setError('加载RSS源失败');
    } finally {
      setLoading(false);
    }
  };

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
      await fetch(`http://localhost:3000/rss-sources/${id}`, { method: 'DELETE' });
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
        fetch(`http://localhost:3000/rss-sources/${id}`, { method: 'DELETE' })
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
      case 'updateMonitorInterval':
        if (!newMonitorInterval || isNaN(newMonitorInterval) || parseInt(newMonitorInterval) <= 0) {
          setError('请输入有效的监控间隔（分钟）');
          return;
        }
        payload = { ids: selectedIds, newMonitorInterval: parseInt(newMonitorInterval) };
        break;
      case 'updateBlacklistKeywords':
        if (!newBlacklistKeywords) {
          setError('请输入新的黑名单关键词进行批量更新');
          return;
        }
        payload = { ids: selectedIds, newBlacklistKeywords };
        break;
      case 'deleteSelected':
        handleDeleteSelected();
        return;
      default:
        setError('请选择一个批量操作');
        return;
    }

    try {
      const response = await fetch('http://localhost:3000/bulk-update-rss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('更新选中的RSS源失败');

      const data = await response.json();
      setSuccess(`成功更新了${data.updatedCount}个RSS源`);
      setSelectedIds([]); // 清空选中的ID
      setBulkAction(''); // 清空批量操作类型
      setNewMonitorInterval(''); // 清空监控间隔输入框
      setNewBlacklistKeywords(''); // 清空黑名单关键词输入框
      setNewKeywords(''); // 清空关键词输入框
      setNewName(''); // 清空名称输入框
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
      const response = await fetch(`http://localhost:3000/test-rss/${id}`, { method: 'GET' });
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
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">RSS源管理</h1>

      {/* 导航链接 */}
      <Link to="/add-rss-source" className="inline-block mb-6 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
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
        <h2 className="text-xl font-semibold p-6 border-b">RSS源</h2>

        {loading ? (
          <div className="p-6 text-center text-gray-500">正在加载...</div>
        ) : sources.length === 0 ? (
          <div className="p-6 text-center text-gray-500">尚未添加任何RSS源</div>
        ) : (
          <>
            <div className="flex justify-between items-center p-6 border-b">
              <div className="flex items-center">
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
                  <option value="updateMonitorInterval">更新监控间隔</option>
                  <option value="updateBlacklistKeywords">更新黑名单关键词</option>
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

                {bulkAction === 'updateMonitorInterval' && (
                  <input
                    type="number"
                    value={newMonitorInterval}
                    onChange={(e) => setNewMonitorInterval(e.target.value)}
                    placeholder="新监控间隔（分钟）"
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
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    选择
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称/标题
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    关键词
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    黑名单关键词
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    监控间隔（分钟）
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    通知方式
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    添加时间
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(source.id)}
                        onChange={() => handleCheckboxChange(source.id)}
                        className="mr-2"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {source.name || source.title || '无名称/标题'}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>{source.keywords}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>{source.blacklist_keywords || '无'}</div> {/* 确保显示默认值 */}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>{source.monitor_interval}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>{source.notification_channel_name || '无'}</div> {/* 显示通知方式 */}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isValidDate(source.created_at)
                        ? new Date(source.created_at).toLocaleString()
                        : '未知'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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



