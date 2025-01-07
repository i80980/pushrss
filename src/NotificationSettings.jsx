import React, { useState, useEffect } from 'react';

const NotificationSettings = () => {
  const [newChannel, setNewChannel] = useState({
    name: '',
    endpoint: '',
    active: true
  });
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 获取所有通知渠道
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('http://localhost:3000/notifications');
        if (!response.ok) throw new Error('获取通知渠道失败');
        const data = await response.json();
        setChannels(data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchChannels();
  }, []);

  // 添加通知渠道
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:3000/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newChannel),
      });

      if (!response.ok) throw new Error('添加通知渠道失败');

      const data = await response.json();
      setSuccess(data.message);
      setNewChannel({
        name: '',
        endpoint: '',
        active: true
      });

      // 更新通知列表
      setChannels([...channels, { ...data, ...newChannel }]);
    } catch (err) {
      setError(err.message);
    }
  };

  // 处理输入变化
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewChannel(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // 删除通知渠道
  const handleDelete = async (id) => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`http://localhost:3000/notifications/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('删除通知渠道失败');

      const data = await response.json();
      setSuccess(data.message);

      // 更新通知列表
      setChannels(channels.filter(channel => channel.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  // 发送测试消息
  const sendTestMessage = async (id) => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`http://localhost:3000/notifications/test/${id}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('发送测试消息失败');

      const data = await response.json();
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  // 编辑通知渠道
  const [editingId, setEditingId] = useState(null);
  const [editChannel, setEditChannel] = useState({
    name: '',
    endpoint: '',
    active: true
  });

  const startEdit = (channel) => {
    setEditingId(channel.id);
    setEditChannel(channel);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditChannel({
      name: '',
      endpoint: '',
      active: true
    });
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditChannel(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`http://localhost:3000/notifications/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editChannel),
      });

      if (!response.ok) throw new Error('更新通知渠道失败');

      const data = await response.json();
      setSuccess(data.message);

      // 更新通知列表
      setChannels(channels.map(channel => 
        channel.id === editingId ? { ...channel, ...editChannel } : channel
      ));

      cancelEdit();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">通知渠道管理</h1>

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

      {/* 表单部分 */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">名称</label>
            <input
              type="text"
              id="name"
              name="name"
              value={newChannel.name}
              onChange={handleChange}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>

          <div className={`md:block ${editingId !== null ? 'block' : 'hidden'}`}>
            <label htmlFor="endpoint" className="block text-sm font-medium text-gray-700">URL</label>
            <input
              type="text"
              id="endpoint"
              name="endpoint"
              value={newChannel.endpoint}
              onChange={handleChange}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>

          <div className="flex items-center mt-6">
            <input
              type="checkbox"
              id="active"
              name="active"
              checked={newChannel.active}
              onChange={handleChange}
              className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <label htmlFor="active" className="ml-2 block text-sm text-gray-900">是否激活</label>
          </div>
        </div>
        <button
          type="submit"
          className="mt-6 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          添加通知渠道
        </button>
      </form>

      {/* 现有通知渠道列表 */}
      <div className="bg-white shadow overflow-x-auto sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名称
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                是否激活
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {channels.map(channel => (
              <tr key={channel.id}>
                {editingId === channel.id ? (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        name="name"
                        value={editChannel.name}
                        onChange={handleEditChange}
                        className="border border-gray-300 rounded-md p-2"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        name="endpoint"
                        value={editChannel.endpoint}
                        onChange={handleEditChange}
                        className="border border-gray-300 rounded-md p-2"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        name="active"
                        checked={editChannel.active}
                        onChange={handleEditChange}
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex space-x-2">
                      <button
                        onClick={handleUpdate}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        取消
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap">{channel.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{channel.endpoint}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {channel.active ? '是' : '否'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex space-x-2">
                      <button
                        onClick={() => sendTestMessage(channel.id)}
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        测试
                      </button>
                      <button
                        onClick={() => startEdit(channel)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(channel.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        删除
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NotificationSettings;



