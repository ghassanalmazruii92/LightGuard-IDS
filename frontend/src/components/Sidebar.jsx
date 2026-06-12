import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import HoverHint from './HoverHint';
import {
  Eye, LayoutDashboard, Bell, FileText, Settings, LogOut,
  User, Monitor, Play, Share2, Activity, Cpu, UserCog,
  ChevronLeft, ChevronRight, Radio, BrainCircuit, Wifi,
  Lock, Shield, Network, BarChart3
} from 'lucide-react';

const NAV = [
  { section:'MAIN' },
  { name:'Dashboard',      path:'/',             icon:LayoutDashboard, tip:'Central monitoring overview for Tadhamon Smart City IDS' },
  { name:'Topology',       path:'/topology',     icon:Share2,          tip:'Interactive cyber network map with VLAN zone visualization' },
  { name:'Live Traffic',   path:'/live-packets', icon:Activity,        badge:'LIVE', tip:'Real-time packet inspection and anomaly detection feed' },
  { name:'Alerts',         path:'/alerts',       icon:Bell,            badgeCount:true, tip:'All detected intrusion events with severity classification' },
  { name:'Logs',           path:'/logs',         icon:FileText,        tip:'SOC-grade audit logs with Source IP, Protocol, and Action' },
  { section:'MONITORING' },
  { name:'Devices',        path:'/devices',      icon:Monitor,         tip:'IoT device inventory with risk scores and trust levels' },
  { name:'Fog Nodes',      path:'/fog-nodes',    icon:Cpu,             tip:'Fog nodes inspect local IoT traffic near the edge before forwarding to central IDS' },
  { name:'Scenarios',      path:'/scenarios',    icon:Play,            tip:'Attack simulation with MITRE ATT&CK mapping for testing detection' },
  { section:'MANAGEMENT' },
  { name:'Users',          path:'/users',        icon:UserCog,         adminOnly:true, tip:'Role-based access control: SOC Admin, Analyst, Monitoring, Technical' },
  { name:'Settings',       path:'/settings',     icon:Settings,        tip:'AI model, detection thresholds, encryption, and notification config' },
  { section:'AI ENGINE' },
  { name:'AI Detection',   path:'/settings',     icon:BrainCircuit,    tip:'RandomForest anomaly detection engine — 98.7% accuracy' },
  { section:'SYSTEM' },
  { name:'Network Health', path:'/fog-nodes',    icon:Network,         tip:'Real-time network health monitoring across all VLAN zones' },
];

export default function Sidebar({ user, onLogout, alertCount = 0 }) {
  const loc = useLocation();
  const [col, setCol] = useState(false);
  const W = col ? 80 : 260;

  return (
    <aside style={{
      position:'fixed', top:0, left:0, bottom:0, width:W, zIndex:100,
      background:'#06101F',
      borderRight:'1px solid rgba(0,229,255,.10)',
      backdropFilter:'blur(12px)',
      display:'flex', flexDirection:'column',
      transition:'width .3s cubic-bezier(.4,0,.2,1)',
      boxShadow:'4px 0 32px rgba(0,0,0,.6)',
    }}>

      {/* ── Logo ──────────────────────────────────── */}
      <div style={{ padding:'22px 18px 18px', borderBottom:'1px solid rgba(0,229,255,.07)', position:'relative', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Shield + Eye logo */}
          <div style={{ position:'relative', width:42, height:42, flexShrink:0 }}>
            <div className="animate-spin-slow" style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid transparent', borderTopColor:'rgba(0,229,255,.6)', borderRightColor:'rgba(157,92,255,.3)' }}/>
            <div className="animate-spin-rev"  style={{ position:'absolute', inset:5, borderRadius:'50%', border:'1px dashed rgba(0,229,255,.18)' }}/>
            <div style={{ position:'absolute', inset:9, borderRadius:9, background:'linear-gradient(145deg,rgba(0,70,160,.7),rgba(0,15,50,.95))', border:'1px solid rgba(0,229,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 14px rgba(0,229,255,.2)' }}>
              <Eye style={{ width:13, height:13, color:'#00E5FF', filter:'drop-shadow(0 0 5px rgba(0,229,255,.9))' }}/>
            </div>
          </div>
          {!col && (
            <div>
              <p style={{ fontFamily:'Orbitron,sans-serif', fontSize:15, fontWeight:800, letterSpacing:'.06em', margin:0, lineHeight:1.1, background:'linear-gradient(135deg,#fff,#B8D4FF,#00E5FF)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>LightGuard</p>
              <p style={{ fontSize:8, letterSpacing:'.26em', color:'rgba(0,200,255,.38)', margin:'2px 0 0', textTransform:'uppercase', fontWeight:600 }}>IDS PLATFORM</p>
            </div>
          )}
        </div>
        {/* Collapse btn */}
        <button onClick={()=>setCol(!col)} style={{ position:'absolute', right:-13, top:'50%', transform:'translateY(-50%)', width:26, height:26, borderRadius:'50%', background:'#06101F', border:'1px solid rgba(0,229,255,.22)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(0,200,255,.6)', transition:'all .2s', boxShadow:'0 0 8px rgba(0,0,0,.4)' }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,229,255,.1)';e.currentTarget.style.color='#00E5FF';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#06101F';e.currentTarget.style.color='rgba(0,200,255,.6)';}}>
          {col?<ChevronRight style={{width:13,height:13}}/>:<ChevronLeft style={{width:13,height:13}}/>}
        </button>
      </div>

      {/* ── User badge ─────────────────────────────── */}
      {!col && (
        <div style={{ margin:'14px 14px 0', padding:'11px 13px', background:'rgba(0,229,255,.04)', border:'1px solid rgba(0,229,255,.09)', borderRadius:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,rgba(0,80,200,.6),rgba(0,25,80,.9))', border:'1px solid rgba(0,229,255,.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <User style={{ width:14, height:14, color:'#00E5FF' }}/>
            </div>
            <div style={{ overflow:'hidden', flex:1 }}>
              <p style={{ fontSize:12, fontWeight:600, color:'rgba(220,235,255,.9)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.username||'admin'}</p>
              <p style={{ fontSize:9, color:'rgba(0,200,255,.38)', margin:0, textTransform:'uppercase', letterSpacing:'.12em' }}>SOC Analyst</p>
            </div>
            <div className="animate-live" style={{ width:8, height:8, borderRadius:'50%', background:'#00FF9D', boxShadow:'0 0 6px rgba(0,255,157,.7)', flexShrink:0 }}/>
          </div>
        </div>
      )}

      {/* ── Nav ────────────────────────────────────── */}
      <nav style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'10px 10px' }}>
        {NAV.map((item, i) => {
          if (item.adminOnly && user?.role !== 'admin') return null;
          if (item.section) {
            if (col) return <div key={i} style={{ height:1, background:'rgba(0,229,255,.06)', margin:'8px 4px' }}/>;
            return <p key={i} style={{ fontSize:8, fontWeight:700, letterSpacing:'.22em', color:'rgba(0,200,255,.24)', textTransform:'uppercase', padding:'14px 8px 5px', margin:0 }}>{item.section}</p>;
          }
          const active = loc.pathname === item.path || (item.path !== '/' && loc.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <HoverHint key={item.path} hint={item.tip} followCursor={false} as="div" style={{ marginBottom:4 }}>
              <Link to={item.path} className={`sidebar-item ${active?'active':''}`}>
                <div style={{ width:34, height:34, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:active?'rgba(0,229,255,.14)':'rgba(0,50,100,.12)', border:active?'1px solid rgba(0,229,255,.28)':'1px solid rgba(0,80,160,.08)', transition:'all .2s' }}>
                  <Icon style={{ width:16, height:16, color:active?'#00E5FF':'rgba(120,155,200,.5)', filter:active?'drop-shadow(0 0 5px rgba(0,229,255,.8))':'none', transition:'all .2s' }}/>
                </div>
                {!col && (
                  <>
                    <span style={{ fontSize:13, fontWeight:active?600:400, color:active?'rgba(225,240,255,.95)':'rgba(120,155,200,.55)', flex:1, whiteSpace:'nowrap', transition:'color .2s' }}>{item.name}</span>
                    {item.badge && <span style={{ fontSize:8, fontWeight:700, padding:'2px 7px', background:'rgba(255,61,113,.1)', border:'1px solid rgba(255,61,113,.28)', borderRadius:20, color:'#FF3D71', letterSpacing:'.08em' }}>LIVE</span>}
                    {item.badgeCount && alertCount > 0 && <span style={{ minWidth:18, height:18, borderRadius:9, background:'rgba(255,61,113,.12)', border:'1px solid rgba(255,61,113,.3)', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', fontSize:9, fontWeight:700, color:'#FF3D71' }}>{alertCount}</span>}
                  </>
                )}
              </Link>
            </HoverHint>
          );
        })}
      </nav>

      {/* ── System Status ──────────────────────────── */}
      {!col && (
        <div style={{ margin:'0 10px 10px', padding:'11px 13px', background:'rgba(0,8,22,.5)', border:'1px solid rgba(0,229,255,.07)', borderRadius:12 }}>
          <p style={{ fontSize:8, fontWeight:700, letterSpacing:'.2em', color:'rgba(0,200,255,.25)', textTransform:'uppercase', margin:'0 0 9px' }}>SYSTEM STATUS</p>
          {[
            { l:'IDS Engine',  c:'#00FF9D', s:'ACTIVE', tip:'Detection engine is running and inspecting traffic in real-time' },
            { l:'AI Model',    c:'#00FF9D', s:'ONLINE', tip:'RandomForest model loaded — 98.7% accuracy on NSL-KDD validation set' },
            { l:'Fog Nodes',   c:'#FFB020', s:'3/3',    tip:'3 of 3 fog edge nodes connected — Zone A, B, and C are online' },
            { l:'TLS Status',  c:'#00E5FF', s:'VALID',  tip:'TLS 1.3 certificate is valid — AES-256-GCM encryption active on port 8443' },
          ].map(({ l,c,s })=>(
            <div key={l} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}` }}/>
                <span style={{ fontSize:9, color:'rgba(123,145,176,.45)' }}>{l}</span>
              </div>
              <span style={{ fontSize:9, fontWeight:700, color:c, letterSpacing:'.06em' }}>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Logout ─────────────────────────────────── */}
      <div style={{ padding:'8px 10px', borderTop:'1px solid rgba(0,229,255,.06)', flexShrink:0 }}>
        <button onClick={onLogout}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:col?'11px 0':'0 14px', height:48, justifyContent:col?'center':'flex-start', borderRadius:12, background:'transparent', border:'1px solid transparent', cursor:'pointer', transition:'all .2s' }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,61,113,.07)';e.currentTarget.style.borderColor='rgba(255,61,113,.15)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';}}>
          <div style={{ width:34, height:34, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,61,113,.07)', border:'1px solid rgba(255,61,113,.12)', flexShrink:0 }}>
            <LogOut style={{ width:14, height:14, color:'rgba(255,61,113,.6)' }}/>
          </div>
          {!col && <span style={{ fontSize:13, color:'rgba(255,61,113,.55)', fontWeight:500 }}>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
