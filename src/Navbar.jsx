import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const Navbar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div>
          <Link to="/" className="text-white text-lg font-bold">
            PushRSS
          </Link>
        </div>
        <ul className="flex space-x-4">
          <li>
            <Link to="/rss-management" className="text-gray-300 hover:text-white">
              RSS源
            </Link>
          </li>
          <li>
            <Link to="/notification-settings" className="text-gray-300 hover:text-white">
              通知渠道
            </Link>
          </li>
          <li>
            <button 
              onClick={handleLogout} 
              className="text-gray-300 hover:text-white cursor-pointer"
            >
              退出登录
            </button>
          </li>
          {/* 其他导航项 */}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;



