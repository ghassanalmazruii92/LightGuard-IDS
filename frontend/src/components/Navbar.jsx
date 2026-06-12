import { Link, useLocation } from 'react-router-dom';
import { Shield, LayoutDashboard, Bell, FileText, Settings, LogOut, User, Monitor, Play, Cpu, Share2, UserCog, Activity } from 'lucide-react';
import HoverHint from './HoverHint';

const Navbar = ({ user, onLogout }) => {
  const location = useLocation();

  const navLinks = [
    { name: 'Dashboard',     path: '/',             icon: LayoutDashboard, hint: 'Overview: KPIs, zones, heatmap, topology, live feed.' },
    { name: 'Devices',       path: '/devices',      icon: Monitor,         hint: 'Inventory of discovered and seeded IoT assets with risk and actions.' },
    { name: 'Scenarios',     path: '/scenarios',    icon: Play,            hint: 'Run or manage attack scenarios for demo and testing.' },
    { name: 'Live Packets',  path: '/live-packets', icon: Activity,        hint: 'Real-time packet analysis: src/dst IP, protocol, port, anomaly score.' },
    { name: 'Alerts',        path: '/alerts',       icon: Bell,            hint: 'Full alert list, filters, and drill-down details.' },
    { name: 'Logs',          path: '/logs',         icon: FileText,        hint: 'SOC-grade audit trail: source, destination, protocol, action taken.' },
    { name: 'Fog Nodes',     path: '/fog-nodes',    icon: Cpu,             hint: 'Edge / fog workers with real CPU, RAM, and network metrics.' },
    { name: 'Topology',      path: '/topology',     icon: Share2,          hint: 'Interactive network graph with attack animation.' },
    ...(user?.role === 'admin' ? [{ name: 'Users', path: '/users', icon: UserCog, hint: 'Manage operator accounts (admin only).' }] : []),
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-6">
      <HoverHint hint="LightGuard IDS — hybrid signature + ML intrusion detection for Tadhamon Smart City." className="flex items-center space-x-3 shrink-0">
        <Shield className="w-8 h-8 text-accent" />
        <span className="text-xl font-bold text-text">LightGuard <span className="text-accent">IDS</span></span>
      </HoverHint>

      <div className="flex items-center space-x-6 overflow-x-auto">
        {navLinks.map((link) => (
          <HoverHint key={link.path} hint={link.hint} className="inline-flex shrink-0">
            <Link
              to={link.path}
              className={`flex items-center space-x-1.5 transition-colors text-sm ${
                location.pathname === link.path ? 'text-accent' : 'text-text/70 hover:text-text'
              }`}
            >
              <link.icon className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">{link.name}</span>
            </Link>
          </HoverHint>
        ))}
      </div>

      <div className="flex items-center space-x-4">
        {user.role === 'admin' && (
          <HoverHint hint="Application settings (roles, keys, tuning — admin only)." className="inline-flex">
            <Link
              to="/settings"
              className={`p-2 transition-colors ${location.pathname === '/settings' ? 'text-accent' : 'text-text/70 hover:text-accent'}`}
            >
              <Settings className="w-5 h-5" />
            </Link>
          </HoverHint>
        )}
        <div className="flex items-center space-x-3 pl-4 border-l border-border">
          <HoverHint
            hint={`Signed in as ${user.username} (${user.role}). JWT session from login.`}
            className="flex flex-col items-end min-w-0"
          >
            <span className="text-sm font-medium truncate max-w-[140px]">{user.username}</span>
            <span className="text-xs text-text/50 capitalize">{user.role}</span>
          </HoverHint>
          <HoverHint hint="Your account avatar." className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-accent" />
          </HoverHint>
          <HoverHint hint="End this session and clear local tokens." as="button" type="button" className="p-2 text-text/70 hover:text-critical transition-colors shrink-0 bg-transparent border-0 cursor-pointer font-[inherit]" onClick={onLogout}>
            <LogOut className="w-5 h-5" />
          </HoverHint>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
