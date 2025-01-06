import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div>
          <Link to="/" className="text-white text-lg font-bold">
            RSS Manager
          </Link>
        </div>
        <ul className="flex space-x-4">
          <li>
            <Link to="/rss-management" className="text-gray-300 hover:text-white">
              RSS源管理
            </Link>
          </li>
          <li>
            <Link to="/notification-settings" className="text-gray-300 hover:text-white">
              通知渠道管理
            </Link>
          </li>
          {/* 其他导航项 */}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;



