import React from 'react';
import { LayoutDashboard, Play, TrendingUp, User, ChevronDown, MoreHorizontal, Timer as TimerIcon, Dumbbell } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import './BottomNavigation.css';

const BottomNavigation = () => {
    const [isMinimized, setIsMinimized] = React.useState(false);
    const [showMore, setShowMore] = React.useState(false);
    const moreRef = React.useRef(null);
    const location = useLocation();

    // Highlight "More" when one of its routes is active.
    const moreActive = ['/timer', '/exercises'].includes(location.pathname);

    const toggleNav = () => {
        setIsMinimized(!isMinimized);
    };

    // Close the More menu when clicking outside of it.
    React.useEffect(() => {
        if (!showMore) return undefined;
        const handleClickOutside = (e) => {
            if (moreRef.current && !moreRef.current.contains(e.target)) {
                setShowMore(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMore]);

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

            {/* More overflow — keeps the nav at 5 slots while exposing Timer & Exercises */}
            <div className="nav-more-wrap" ref={moreRef}>
                <button
                    className={`nav-item nav-more-btn ${moreActive ? 'active' : ''}`}
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={showMore}
                    aria-label="More"
                >
                    <MoreHorizontal size={24} />
                    <span className="nav-label">More</span>
                </button>

                {showMore && (
                    <div className="nav-more-menu">
                        <NavLink
                            to="/exercises"
                            className={({ isActive }) => `nav-more-item ${isActive ? 'active' : ''}`}
                            onClick={() => setShowMore(false)}
                        >
                            <Dumbbell size={20} />
                            <span>Exercises</span>
                        </NavLink>
                        <NavLink
                            to="/timer"
                            className={({ isActive }) => `nav-more-item ${isActive ? 'active' : ''}`}
                            onClick={() => setShowMore(false)}
                        >
                            <TimerIcon size={20} />
                            <span>Timer</span>
                        </NavLink>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default BottomNavigation;
