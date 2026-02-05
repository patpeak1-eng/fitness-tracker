import React from 'react';
import { LayoutDashboard, Play, TrendingUp, User, ChevronDown } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import './BottomNavigation.css';

const BottomNavigation = () => {
    const [isMinimized, setIsMinimized] = React.useState(false);
    // Auto-minimize on scroll could be added later, but manual for now is safer.

    const toggleNav = () => {
        setIsMinimized(!isMinimized);
    };

    return (
        <nav className={`bottom-nav ${isMinimized ? 'minimized' : ''}`}>
            {/* Toggle Button */}
            <button className="nav-toggle-btn" onClick={toggleNav} aria-label={isMinimized ? "Show Menu" : "Hide Menu"}>
                <div style={{ transform: isMinimized ? 'rotate(180deg)' : 'rotate(0deg)', display: 'flex', transition: 'transform 0.3s ease' }}>
                    <ChevronDown size={20} />
                </div>
            </button>

            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={24} />
                <span className="nav-label">Home</span>
            </NavLink>

            <NavLink to="/track" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Play size={24} fill="currentColor" fillOpacity={0.2} /> {/* Distinctive Play Icon */}
                <span className="nav-label">Workout</span>
            </NavLink>

            <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <TrendingUp size={24} />
                <span className="nav-label">Progress</span>
            </NavLink>

            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <User size={24} />
                <span className="nav-label">Profile</span>
            </NavLink>
        </nav>
    );
};

export default BottomNavigation;
