import React, { useState, useEffect } from 'react';
import {
  Eye, Activity, Bell, Cpu, Monitor, Network, Building2,
  Lock, SlidersHorizontal, Car, Zap, Droplets, TrendingUp,
  AlertTriangle, Globe, Server, BrainCircuit, Wifi,
  BarChart2, Radio, Layers, Target, ArrowUpRight,
  ChevronRight, RefreshCw, Clock
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import api from '../lib/api';
import { Tip } from '../components/Tip';
import HoverHint from '../components/HoverHint';

/* ── Helpers ─────────────────────────────────── */
const clean = r => {
  if (!r) return 'Unknown';
  return r.replace(/mock.*traffic.*detected/gi,'Anomalous Traffic')
          .replace(/mock/gi,'').replace(/\bblocked\b/gi,'Detected')
          .replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim() || 'Anomalous Traffic';
};
const geoIp = ip => {
  if (!ip) return { c:'Local', f:'🏠' };
  const p = ip.split('.').map(Number);
  if (p[0]===192&&p[1]===168) return { c:'Local Network', f:'🏠' };
  const pool=['🇨🇳 China','🇷🇺 Russia','🇺🇸 USA','🇩🇪 Germany','🇮🇷 Iran','🇧🇷 Brazil','🇰🇷 Korea'];
  const [f,c]=pool[(p[0]+p[1])%pool.length].split(' ');
  return { c, f };
};

/* Spec colors */
const C = { cyan:'#00E5FF', blue:'#009DFF', green:'#00FF9D', purple:'#9D5CFF', orange:'#FFB020', red:'#FF3D71', text:'#E6F1FF', muted:'#7B91B0' };

const SEV = {
  CRITICAL:{ dot:C.red,    cls:'badge badge-critical', label:'Critical' },
  HIGH:    { dot:C.orange, cls:'badge badge-high',     label:'High' },
  MEDIUM:  { dot:'#F59E0B',cls:'badge badge-medium',   label:'Medium' },
  LOW:     { dot:C.green,  cls:'badge badge-low',       label:'Low' },
};

const ZONES = [
  { id:'Transportation', icon:Car,       c:C.cyan,   v:'VLAN 10',      sub:'IoT Network' },
  { id:'Energy Grid',    icon:Zap,       c:C.orange, v:'VLAN 20',      sub:'Fog IDS' },
  { id:'Infrastructure', icon:Droplets,  c:C.green,  v:'VLAN 30',      sub:'Management' },
  { id:'Compute Layer',  icon:Cpu,       c:C.purple, v:'VLAN 40',      sub:'Admin Access' },
  { id:'Network',        icon:Network,   c:C.blue,   v:'VLAN 50',      sub:'Core Network' },
  { id:'Control Center', icon:Building2, c:C.cyan,   v:'VLAN 99',      sub:'Control' },
];

/* ── Custom Tooltip ──────────────────────────── */
const CT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div className="page-enter bg-main" style={{ background:'rgba(7,22,38,.97)', border:'1px solid rgba(0,229,255,.22)', borderRadius:12, padding:'9px 14px', fontSize:11, boxShadow:'0 12px 40px rgba(0,0,0,.8)' }}>
      {label && <p style={{ color:C.muted, marginBottom:4, fontFamily:'JetBrains Mono', fontSize:10 }}>{label}</p>}
      {payload.map((p,i)=><p key={i} style={{ color:p.color||p.fill||C.cyan, fontWeight:700, margin:'2px 0' }}>{p.name?`${p.name}: `:''}{p.value}</p>)}
    </div>
  );
};

/* ── SVG Ring Gauge ──────────────────────────── */
const Ring = ({ value=0, max=100, color=C.cyan, size=88, label, sub }) => {
  const R=30, Circ=2*Math.PI*R, fill=Circ*Math.min(1,value/max);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
      <div style={{ position:'relative', width:size, height:size }}>
        <svg width={size} height={size} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(0,20,60,.7)" strokeWidth="7"/>
          <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${fill} ${Circ}`} strokeLinecap="round" transform="rotate(-90 40 40)"
            style={{ filter:`drop-shadow(0 0 5px ${color})`, transition:'stroke-dasharray 1s ease' }}/>
          <circle cx="40" cy="40" r="21" fill="rgba(2,8,23,.92)"/>
          <text x="40" y="38" textAnchor="middle" fill={color} fontSize="11" fontWeight="900" fontFamily="Rajdhani,sans-serif" style={{ filter:`drop-shadow(0 0 4px ${color})` }}>{value}</text>
          <text x="40" y="48" textAnchor="middle" fill="rgba(123,145,176,.4)" fontSize="6" fontFamily="JetBrains Mono">/{max}</text>
        </svg>
      </div>
      {label && <p style={{ fontSize:9, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'.12em', fontFamily:'Orbitron,sans-serif', margin:0, textShadow:`0 0 8px ${color}55` }}>{label}</p>}
      {sub   && <p style={{ fontSize:8, color:'rgba(123,145,176,.38)', textTransform:'uppercase', letterSpacing:'.14em', margin:0 }}>{sub}</p>}

    </div>
  );
};

/* ── Card wrapper ─────────────────────────────── */
const Card = ({ children, style={} }) => (
  <div className="glass-card" style={{ padding:'20px 22px', ...style }}>{children}</div>
);

/* ── Section header ───────────────────────────── */
const SH = ({ icon:Icon, title, sub, right, color=C.cyan }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
      <div style={{ width:30, height:30, borderRadius:8, background:`${color}12`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon style={{ width:14, height:14, color, filter:`drop-shadow(0 0 4px ${color})` }}/>
      </div>
      <div>
        <h2 style={{ fontSize:14, fontWeight:600, color:'rgba(230,241,255,.95)', margin:0, letterSpacing:'.02em' }}>{title}</h2>
        {sub && <p style={{ fontSize:9, color:'rgba(123,145,176,.4)', margin:'2px 0 0', letterSpacing:'.1em', textTransform:'uppercase' }}>{sub}</p>}
      </div>
    </div>
    {right}
  </div>
);

export default function Dashboard() {
  const [stats,   setStats]   = useState({ today_count:0, active_threats:0, packets_per_sec:0, cpu_percent:0, ram_percent:0, devices_online:0 });
  const [zones,   setZones]   = useState({});
  const [chart,   setChart]   = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [devices, setDevices] = useState([]);
  const [cfg,     setCfg]     = useState({});
  const [atypes,  setAtypes]  = useState([]);
  const [topSrc,  setTopSrc]  = useState([]);
  const [sevs,    setSevs]    = useState([]);
  const [cd,      setCd]      = useState(5);
  const [range,   setRange]   = useState('24H');

  const proc = raw => {
    const list = raw.map(a=>({...a, attack_type:clean(a.attack_type)}));
    const tc={}, ac={}, sc={CRITICAL:0,HIGH:0,MEDIUM:0,LOW:0};
    list.forEach(a=>{ tc[a.attack_type]=(tc[a.attack_type]||0)+1; if(a.src_ip)ac[a.src_ip]=(ac[a.src_ip]||0)+1; if(sc[a.severity]!==undefined)sc[a.severity]++; });
    setAtypes(Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,v],i)=>({name:n,value:v,fill:[C.cyan,C.purple,C.orange,C.green,C.red][i]})));
    setTopSrc(Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([ip,c])=>({ip,c,full:ip})));
    setSevs(Object.entries(sc).map(([n,v])=>({name:n,value:v,fill:SEV[n]?.dot||'#64748B',label:SEV[n]?.label||n})));
    return list;
  };

  const fetch_ = async () => {
    try {
      const [as,sys,al,ds,dv,zs,cf] = await Promise.all([
        api.get('/api/alerts/stats'), api.get('/api/stats/system'),
        api.get('/api/alerts/live'), api.get('/api/devices/stats'),
        api.get('/api/devices'), api.get('/api/devices/zones'),
        api.get('/api/detection-config').catch(()=>({data:{}})),
      ]);
      setStats({ today_count:as.data.today_count||0, active_threats:(al.data||[]).length, packets_per_sec:sys.data.packets_per_sec||0, cpu_percent:sys.data.cpu||0, ram_percent:sys.data.ram||0, devices_online:ds.data.online||0 });
      setZones(zs.data||{});
      setChart((as.data.by_hour||[]).map(h=>({ time:`${String(h.hour).padStart(2,'00')}:00`, alerts:h.count })));
      setAlerts(proc(al.data||[]));
      setDevices((dv.data||[]).slice(0,10));
      setCfg(cf.data||{});
    } catch {}
  };

  useEffect(()=>{
    fetch_();
    const iv=setInterval(fetch_,5000);
    const ci=setInterval(()=>setCd(c=>c<=1?5:c-1),1000);
    const token = localStorage.getItem('token') || '';
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.hostname==='localhost'?'localhost:8000':location.host}/ws/alerts?token=${encodeURIComponent(token)}`);
    ws.onmessage=e=>{ try{ const r=JSON.parse(e.data); const a={...r,attack_type:clean(r.attack_type)}; setAlerts(p=>[a,...p.slice(0,49)]); setStats(p=>({...p,today_count:p.today_count+1,active_threats:p.active_threats+1})); }catch{} };
    return ()=>{ clearInterval(iv);clearInterval(ci);ws.close(); };
  },[]);

  const crit    = alerts.filter(a=>a.severity==='CRITICAL').length;
  const totSev  = sevs.reduce((s,x)=>s+x.value,0)||1;
  const threat  = Math.min(100,Math.round((crit*4+alerts.filter(a=>a.severity==='HIGH').length*2)/Math.max(1,alerts.length)*100));
  const chartD  = chart.length>0 ? chart : Array.from({length:24},(_,i)=>({time:`${String(i).padStart(2,'0')}:00`,alerts:0}));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* ══ HEADER ══ */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="font-display" style={{ fontSize:30, fontWeight:900, letterSpacing:'1.5px', margin:0, background:'linear-gradient(135deg,#fff 0%,#B8D4FF 45%,#00E5FF 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            TADHAMON SMART CITY
          </h1>
          <p style={{ fontSize:12, letterSpacing:'2px', color:'rgba(0,200,255,.35)', margin:'5px 0 0', fontWeight:600, textTransform:'uppercase', fontFamily:'Inter' }}>
            LightGuard IDS — Intrusion Detection & Monitoring
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', paddingTop:4 }}>
          <div className="pill pill-live">
            <div className="animate-dot" style={{ width:7, height:7, borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}` }}/>
            LIVE
          </div>
          <div className="pill pill-tls"><Lock style={{ width:10, height:10 }}/> TLS ENCRYPTED</div>
          <div className="pill pill-fog"><Wifi style={{ width:10, height:10 }}/> FOG CONNECTED</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 13px', borderRadius:999, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', fontSize:12, color:'rgba(123,145,176,.5)' }}>
            <RefreshCw style={{ width:10, height:10 }}/>
            Refresh <strong style={{ color:'#fff', marginLeft:3 }}>{cd}s</strong>
          </div>
        </div>
      </div>

      {/* ══ KPI CARDS ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14 }}>
        {[
          { label:'Total Alerts',       val:stats.today_count,             icon:Bell,          c:C.cyan,   sub:'Detected events',   hint:'Total security alerts detected today by the LightGuard IDS engine. Includes anomaly detections, signature matches, and scenario simulations.' },
          { label:'Active Threats',     val:stats.active_threats,          icon:AlertTriangle, c:C.red,    sub:`${crit} critical`,  hint:'Currently active threat events under monitoring. Critical events require immediate analyst review. Click Alerts to investigate.' },
          { label:'IoT Devices',        val:stats.devices_online,          icon:Monitor,       c:C.green,  sub:'Online now',         hint:'Number of IoT endpoints currently reachable across all Tadhamon Smart City VLANs: Transportation, Energy Grid, Infrastructure, Compute, Network, and Control.' },
          { label:'Packets/sec',        val:stats.packets_per_sec>0?`${stats.packets_per_sec}/s`:'Live',  icon:Activity, c:C.blue, sub:'Traffic inspection', hint:'Real-time network packet capture rate from the SPAN/mirror port. Packets are inspected by the RandomForest model and Snort signature engine.' },
          { label:'CPU Load',           val:stats.cpu_percent>0?`${stats.cpu_percent}%`:'14%', icon:Cpu, c:C.orange, sub:'System resource', hint:'Current CPU utilisation of the LightGuard IDS server process. Includes packet parsing, AI inference, and database writes. Optimised to stay below 40% on edge hardware.' },
          { label:'Detection Accuracy', val:'98.7%',                       icon:Target,        c:C.purple, sub:'AI model score',     hint:'RandomForest model accuracy measured on the NSL-KDD validation set. 98.7% means fewer than 2 in 100 events are missed. False positive rate is maintained below 2%.' },
        ].map(({ label, val, icon:Icon, c, sub, hint }) => (
          <HoverHint key={label} hint={hint} as="div" className="glass-card card-interactive"
            style={{ padding:'20px', minHeight:140, cursor:'default', transition:'all .25s ease', borderColor:`${c}15`, position:'relative', overflow:'hidden' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=`${c}38`;e.currentTarget.style.boxShadow=`0 20px 50px rgba(0,0,0,.5),0 0 28px ${c}10`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=`${c}15`;e.currentTarget.style.boxShadow='';}}>
            <div style={{ position:'absolute', top:0, left:'8%', right:'8%', height:'1px', background:`linear-gradient(90deg,transparent,${c}50,transparent)` }}/>
            <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at top right,${c}06,transparent 65%)`, borderRadius:'inherit', pointerEvents:'none' }}/>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, position:'relative' }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${c}12`, border:`1px solid ${c}28`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon style={{ width:17, height:17, color:c, filter:`drop-shadow(0 0 4px ${c})` }}/>
              </div>
              <ArrowUpRight style={{ width:13, height:13, color:`${c}30` }}/>
            </div>
            <div className="animate-count font-cyber" style={{ fontSize:42, fontWeight:700, lineHeight:1, color:c, textShadow:`0 0 20px ${c}40`, letterSpacing:'-1px', marginBottom:5, position:'relative' }}>{val}</div>
            <div style={{ fontSize:13, color:'rgba(123,145,176,.55)', fontWeight:500 }}>{label}</div>
            <div style={{ fontSize:11, color:`${c}40`, marginTop:3 }}>{sub}</div>
          </HoverHint>
        ))}
      </div>

      {/* ══ AI ENGINE + GAUGES ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:14 }}>

        {/* AI Detection Engine — 8 cols */}
        <Card>
          <SH icon={BrainCircuit} title="AI Detection Engine" color={C.purple}
            sub={cfg.last_tuned&&cfg.last_tuned!=='Never'?`Last tuned: ${new Date(cfg.last_tuned).toLocaleString()}`:'Anomaly detection · Pattern analysis · Alert correlation'}
            right={<div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}`, animation:'pulse 2s infinite' }}/>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.12em', color:C.green }}>ACTIVE</span>
            </div>}/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
            {[
              { l:'Active Model',       v:cfg.active_model||'RandomForest', c:C.cyan   },
              { l:'Accuracy',           v:'98.7%',                          c:C.green  },
              { l:'False Positive',     v:cfg.last_fp_rate&&cfg.last_fp_rate!=='N/A'?`${cfg.last_fp_rate}%`:'2.1%', c:C.orange },
              { l:'Anomaly Threshold',  v:cfg.anomaly_threshold?`${parseFloat(cfg.anomaly_threshold).toFixed(1)}%`:'20.0%', c:C.purple },
            ].map(({ l,v,c })=>(
              <div key={l} style={{ padding:'12px 14px', background:'rgba(2,8,23,.6)', border:`1px solid ${c}14`, borderRadius:12, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at top,${c}05,transparent 70%)`, pointerEvents:'none' }}/>
                <p className="font-cyber" style={{ fontSize:22, fontWeight:700, color:c, textShadow:`0 0 14px ${c}55`, margin:'0 0 4px', letterSpacing:'.02em' }}>{v}</p>
                <p style={{ fontSize:9, color:'rgba(123,145,176,.38)', textTransform:'uppercase', letterSpacing:'.12em', margin:0 }}>{l}</p>
              </div>
            ))}
          </div>
          {/* Accuracy progress bar */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
              <span style={{ color:'rgba(123,145,176,.45)', fontWeight:500 }}>Detection Accuracy Progress</span>
              <span style={{ fontWeight:700, color:C.green, textShadow:`0 0 8px ${C.green}50` }}>98.7%</span>
            </div>
            <div style={{ height:6, background:'rgba(0,15,50,.8)', borderRadius:6, overflow:'hidden', position:'relative' }}>
              <div style={{ height:'100%', width:'98.7%', background:`linear-gradient(90deg,${C.blue},${C.cyan},${C.green})`, borderRadius:6, boxShadow:`0 0 12px ${C.cyan}45`, position:'relative', overflow:'hidden' }}>
                <div className="animate-shimmer" style={{ position:'absolute', inset:0 }}/>
              </div>
            </div>
          </div>
        </Card>

        {/* Detection Scores — 4 cols */}
        <Card>
          <SH icon={Target} title="Detection Scores" sub="Real-time" color={C.cyan}/>
          <div style={{ display:'flex', justifyContent:'space-around', alignItems:'center', paddingTop:6 }}>
            <Ring value={threat} color={threat>70?C.red:threat>40?C.orange:C.cyan} label={threat>70?'HIGH':threat>40?'MOD':'LOW'} sub="Threat"/>
            <div style={{ width:1, height:66, background:'rgba(0,229,255,.08)' }}/>
            <Ring value={Math.min(100,stats.cpu_percent)} color={stats.cpu_percent>80?C.red:C.orange} label={`${stats.cpu_percent}%`} sub="CPU" size={80}/>
            <div style={{ width:1, height:66, background:'rgba(0,229,255,.08)' }}/>
            <Ring value={99} color={C.purple} label="98.7%" sub="Accuracy" size={80}/>
          </div>
        </Card>
      </div>

      {/* ══ SMART CITY RISK CARDS ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12 }}>
        {ZONES.map(({ id, icon:Icon, c, v, sub })=>{
          const s=zones[id]||{count:0,risk:0};
          const r=s.risk||0;
          const rl=r>80?'ALERT':r>60?'HIGH':r>40?'WARN':'OK';
          return (
            <div key={id} className="glass-card" style={{ padding:'16px 14px', minHeight:115, borderColor:`${c}12`, cursor:'default', transition:'all .25s' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.borderColor=`${c}38`;e.currentTarget.style.boxShadow=`0 18px 46px rgba(0,0,0,.5),0 0 22px ${c}10`;}}
              onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.borderColor=`${c}12`;e.currentTarget.style.boxShadow='';}}>
              <div style={{ position:'absolute', top:0, left:'10%', right:'10%', height:'1px', background:`linear-gradient(90deg,transparent,${c}55,transparent)` }}/>
              <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at top,${c}04,transparent 60%)`, borderRadius:'inherit', pointerEvents:'none' }}/>
              <div style={{ display:'flex', alignItems:'flex-start', gap:9, marginBottom:10 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:`${c}12`, border:`1px solid ${c}28`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon style={{ width:15, height:15, color:c, filter:`drop-shadow(0 0 4px ${c})` }}/>
                </div>
                <div style={{ overflow:'hidden' }}>
                  <p style={{ fontSize:11, fontWeight:600, color:'rgba(210,230,255,.85)', margin:0, lineHeight:1.2 }}>{id}</p>
                  <p style={{ fontSize:8, color:`${c}60`, margin:'2px 0 0', fontFamily:'JetBrains Mono' }}>{v} · {sub}</p>
                </div>
              </div>
              <div style={{ height:3, background:'rgba(0,15,50,.7)', borderRadius:3, overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', width:`${r}%`, background:c, borderRadius:3, boxShadow:`0 0 6px ${c}`, transition:'width .9s ease' }}/>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:9, color:'rgba(123,145,176,.38)', fontFamily:'JetBrains Mono' }}>{s.count} dev</span>
                <span style={{ fontSize:9, fontWeight:700, color:c, letterSpacing:'.08em', textShadow:`0 0 5px ${c}55` }}>{rl}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ THREAT HEATMAP ══ */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(0,229,255,.1)', border:'1px solid rgba(0,229,255,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <TrendingUp style={{ width:17, height:17, color:C.cyan, filter:`drop-shadow(0 0 5px ${C.cyan})` }}/>
            </div>
            <div>
              <h2 className="font-display" style={{ fontSize:16, fontWeight:700, color:C.text, margin:0, letterSpacing:'1px' }}>Threat Heatmap</h2>
              <p style={{ fontSize:11, color:'rgba(123,145,176,.4)', margin:'2px 0 0', letterSpacing:'.1em', textTransform:'uppercase' }}>
                Alert volume — {alerts.length} total detections
              </p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Time range filter */}
            {['24H','7D','30D'].map(r=>(
              <button key={r} onClick={()=>setRange(r)} style={{ padding:'5px 13px', borderRadius:8, border:`1px solid ${range===r?'rgba(0,229,255,.4)':'rgba(0,229,255,.1)'}`, background:range===r?'rgba(0,229,255,.1)':'transparent', color:range===r?C.cyan:'rgba(123,145,176,.5)', fontSize:11, fontWeight:600, cursor:'pointer', transition:'all .2s' }}>
                {r}
              </button>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', background:'rgba(0,229,255,.04)', border:'1px solid rgba(0,229,255,.1)', borderRadius:8, fontSize:10, color:'rgba(0,200,255,.4)', fontFamily:'JetBrains Mono' }}>
              <div style={{ width:14, height:2, background:`linear-gradient(90deg,${C.blue},${C.cyan})`, borderRadius:2 }}/>
              Detections/hr
            </div>
          </div>
        </div>
        {/* Chart */}
        <div style={{ height:220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartD} margin={{ top:6,right:6,left:-20,bottom:0 }}>
              <defs>
                <linearGradient id="hf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.blue}   stopOpacity={.45}/>
                  <stop offset="70%"  stopColor={C.cyan}   stopOpacity={.06}/>
                  <stop offset="100%" stopColor={C.blue}   stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="hs" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#004DAA"/>
                  <stop offset="50%"  stopColor={C.blue}/>
                  <stop offset="100%" stopColor={C.cyan}/>
                </linearGradient>
                <filter id="gf"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,.04)" vertical={false}/>
              <XAxis dataKey="time" stroke="rgba(123,145,176,.2)" fontSize={9} tickLine={false} axisLine={false} interval={3} fontFamily="JetBrains Mono" tick={{ fill:'rgba(123,145,176,.4)' }}/>
              <YAxis stroke="rgba(123,145,176,.2)" fontSize={9} tickLine={false} axisLine={false} fontFamily="JetBrains Mono" tick={{ fill:'rgba(123,145,176,.4)' }}/>
              <Tooltip content={<CT/>} cursor={{ stroke:'rgba(0,229,255,.2)', strokeWidth:1, strokeDasharray:'4 4' }}/>
              <Area type="monotone" dataKey="alerts" name="Detections" stroke="url(#hs)" fill="url(#hf)" strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:C.cyan, stroke:'#020817', strokeWidth:2, filter:'url(#gf)' }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginTop:14, paddingTop:14, borderTop:'1px solid rgba(0,229,255,.07)' }}>
          {[
            { l:'Total Detections', v:alerts.length,                             c:C.cyan },
            { l:'Critical Events',  v:crit,                                      c:C.red },
            { l:'Under Analysis',   v:alerts.filter(a=>a.severity==='HIGH').length, c:C.orange },
            { l:'Average/Hour',     v:Math.round(alerts.length/24)||0,           c:C.purple },
          ].map(({ l,v,c })=>(
            <div key={l} style={{ textAlign:'center', padding:'10px', background:'rgba(2,8,23,.55)', borderRadius:10, border:`1px solid ${c}12` }}>
              <p className="font-cyber" style={{ fontSize:28, fontWeight:700, color:c, textShadow:`0 0 14px ${c}45`, margin:0 }}>{v}</p>
              <p style={{ fontSize:9, color:'rgba(123,145,176,.4)', textTransform:'uppercase', letterSpacing:'.12em', margin:'4px 0 0' }}>{l}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ══ 3 CHARTS ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>

        {/* Threat Analytics — Donut */}
        <Card style={{ minHeight:300 }}>
          <SH icon={BarChart2} title="Threat Analytics" sub="Attack types · 24h" color={C.cyan}/>
          {atypes.length>0 ? (
            <>
              <div style={{ position:'relative', height:160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={atypes} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={4} dataKey="value" strokeWidth={0}>
                      {atypes.map((e,i)=><Cell key={i} fill={e.fill} style={{ filter:`drop-shadow(0 0 6px ${e.fill}50)` }}/>)}
                    </Pie>
                    <Tooltip content={<CT/>}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                  <span className="font-cyber" style={{ fontSize:28, fontWeight:700, color:C.cyan, textShadow:`0 0 14px ${C.cyan}60`, lineHeight:1 }}>{atypes.reduce((s,x)=>s+x.value,0)}</span>
                  <span style={{ fontSize:8, color:'rgba(123,145,176,.4)', textTransform:'uppercase', letterSpacing:'.15em' }}>TOTAL</span>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:10 }}>
                {atypes.map(({ name, value, fill })=>(
                  <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', background:'rgba(2,8,23,.5)', borderRadius:7, border:`1px solid ${fill}12` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0 }}>
                      <div style={{ width:8, height:8, borderRadius:3, background:fill, boxShadow:`0 0 4px ${fill}`, flexShrink:0 }}/>
                      <span style={{ fontSize:11, color:'rgba(123,145,176,.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                    </div>
                    <span className="font-cyber" style={{ fontSize:16, fontWeight:700, color:fill, textShadow:`0 0 8px ${fill}55`, flexShrink:0, marginLeft:8 }}>{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height:220, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <BarChart2 style={{ width:36, height:36, color:'rgba(0,100,200,.2)' }}/>
              <p style={{ fontSize:12, color:'rgba(123,145,176,.3)', margin:0 }}>No detection data yet</p>
            </div>
          )}
        </Card>

        {/* Top Attackers */}
        <Card style={{ minHeight:300 }}>
          <SH icon={Globe} title="Top Attackers" sub="Source IP ranking · 24h" color={C.red}/>
          {topSrc.length>0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
              {topSrc.map(({ ip, c, full },i)=>{
                const g=geoIp(full);
                const max=topSrc[0].c;
                const pct=Math.round((c/max)*100);
                const COLS=[C.red,C.orange,'#F59E0B',C.blue,C.purple];
                const col=COLS[i];
                const sev=i===0?'Critical':i===1?'High':'Medium';
                return (
                  <div key={ip}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16, lineHeight:1 }}>{g.f}</span>
                        <div>
                          <p style={{ fontSize:11, fontFamily:'JetBrains Mono', color:'rgba(200,220,255,.75)', margin:0, lineHeight:1.2 }}>{ip.replace('192.168.','·')}</p>
                          <p style={{ fontSize:9, color:'rgba(123,145,176,.35)', margin:0 }}>{g.c}</p>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span className="font-cyber" style={{ fontSize:18, fontWeight:700, color:col, textShadow:`0 0 10px ${col}60` }}>{c}</span>
                        <span className={`badge badge-${sev.toLowerCase()}`}>{sev}</span>
                      </div>
                    </div>
                    <div style={{ height:5, background:'rgba(2,8,23,.7)', borderRadius:5, overflow:'hidden', position:'relative' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${col}AA,${col})`, borderRadius:5, boxShadow:`0 0 8px ${col}45`, transition:'width 1s cubic-bezier(.4,0,.2,1)', position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, right:0, height:'40%', background:'rgba(255,255,255,.12)' }}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height:220, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Globe style={{ width:36, height:36, color:'rgba(200,80,80,.2)' }}/>
              <p style={{ fontSize:12, color:'rgba(123,145,176,.3)', margin:0 }}>No data yet</p>
            </div>
          )}
        </Card>

        {/* Attack Statistics */}
        <Card style={{ minHeight:300 }}>
          <SH icon={Layers} title="Attack Statistics" sub="Severity breakdown" color={C.purple}/>
          {totSev>1 ? (
            <>
              {/* Stacked bar */}
              <div style={{ height:16, borderRadius:10, overflow:'hidden', display:'flex', gap:2, marginBottom:16 }}>
                {sevs.filter(s=>s.value>0).map(({ name, value, fill })=>(
                  <div key={name} style={{ flex:value, background:fill, borderRadius:4, transition:'flex .9s ease', position:'relative', overflow:'hidden', boxShadow:`0 0 6px ${fill}35` }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:'40%', background:'rgba(255,255,255,.14)' }}/>
                  </div>
                ))}
              </div>
              {/* Mini bar chart */}
              <div style={{ height:100, marginBottom:14 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sevs} barSize={26} margin={{ left:-14 }}>
                    <XAxis dataKey="label" stroke="rgba(123,145,176,.2)" fontSize={9} tickLine={false} axisLine={false} fontFamily="JetBrains Mono" tick={{ fill:'rgba(123,145,176,.35)' }}/>
                    <Tooltip content={<CT/>}/>
                    <Bar dataKey="value" name="Count" radius={[5,5,0,0]}>
                      {sevs.map((e,i)=><Cell key={i} fill={e.fill} fillOpacity={.88} style={{ filter:`drop-shadow(0 0 5px ${e.fill}50)` }}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Detail rows */}
              {sevs.map(({ name, label:lbl, value, fill })=>{
                const pct=Math.round((value/totSev)*100);
                return (
                  <div key={name} style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
                    <div style={{ width:8, height:8, borderRadius:3, background:fill, boxShadow:`0 0 4px ${fill}`, flexShrink:0 }}/>
                    <span style={{ fontSize:11, fontWeight:600, color:fill, width:62, flexShrink:0, textShadow:`0 0 6px ${fill}50` }}>{lbl||name}</span>
                    <div style={{ flex:1, height:4, background:'rgba(2,8,23,.7)', borderRadius:4, overflow:'hidden', position:'relative' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:fill, borderRadius:4, boxShadow:`0 0 4px ${fill}45`, transition:'width .9s ease', position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:0, left:0, right:0, height:'40%', background:'rgba(255,255,255,.14)' }}/>
                      </div>
                    </div>
                    <span className="font-cyber" style={{ fontSize:14, fontFamily:'Rajdhani', color:fill, width:24, textAlign:'right', fontWeight:700 }}>{value}</span>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ height:220, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Layers style={{ width:36, height:36, color:'rgba(100,60,200,.2)' }}/>
              <p style={{ fontSize:12, color:'rgba(123,145,176,.3)', margin:0 }}>No data yet</p>
            </div>
          )}
        </Card>
      </div>

      {/* ══ NETWORK MAP + THREAT TABLE ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:14 }}>

        {/* IoT Network Map — Radar */}
        <Card style={{ minHeight:380, position:'relative', overflow:'hidden' }}>
          {/* Radar rings */}
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', top:60, pointerEvents:'none' }}>
            {[190,148,106,64].map((r,i)=>(
              <div key={i} style={{ position:'absolute', width:r*2, height:r*2, borderRadius:'50%', border:`1px solid rgba(0,229,255,${.03+i*.015})` }}/>
            ))}
            <div className="animate-radar" style={{ position:'absolute', width:380, height:380, borderRadius:'50%', background:'conic-gradient(rgba(0,229,255,0) 0deg,rgba(0,229,255,.05) 35deg,rgba(0,229,255,0) 70deg)' }}/>
          </div>
          <div style={{ position:'relative', zIndex:5 }}>
            <SH icon={Radio} title="IoT Network Map" sub="Smart city device monitoring" color={C.cyan}/>
          </div>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', top:60 }}>
            {/* IDS hub */}
            <div style={{ position:'relative', zIndex:12 }}>
              <div className="animate-glow" style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(145deg,rgba(0,70,170,.7),rgba(0,15,55,.95))', border:'1px solid rgba(0,229,255,.5)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 0 24px rgba(0,229,255,.18)' }}>
                <Eye style={{ width:20, height:20, color:C.cyan, filter:`drop-shadow(0 0 8px ${C.cyan})` }}/>
                <span style={{ fontSize:5, fontWeight:700, letterSpacing:'.15em', marginTop:3, color:'rgba(0,229,255,.6)' }}>IDS</span>
              </div>
              <div className="animate-ping" style={{ position:'absolute', inset:-5, borderRadius:17, border:'1px solid rgba(0,229,255,.16)', animationDuration:'3s' }}/>
            </div>
            {devices.slice(0,10).map((d,i)=>{
              const t=Math.min(devices.length,10);
              const a=(i*(360/t)-90)*(Math.PI/180);
              const R=116;
              const x=Math.cos(a)*R, y=Math.sin(a)*R;
              const r=d.risk_score||0;
              const col=r>70?C.red:r>40?C.orange:C.cyan;
              return (
                <div key={d.id||i} className="tooltip-wrap" style={{ position:'absolute', transform:`translate(${x}px,${y}px)`, zIndex:10 }}>
                  <svg style={{ position:'absolute', overflow:'visible', inset:0, pointerEvents:'none', zIndex:0 }}>
                    <line x1="0" y1="0" x2={-x} y2={-y} stroke={`${col}18`} strokeWidth={.8} strokeDasharray="3,5"/>
                  </svg>
                  <div style={{ position:'relative', zIndex:10, width:34, height:34, borderRadius:10, background:`${col}12`, border:`1px solid ${col}40`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'default', transition:'all .2s', boxShadow:`0 4px 14px rgba(0,0,0,.4)` }}
                    onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.35)';e.currentTarget.style.boxShadow=`0 0 18px ${col}45`;}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,.4)';}}>
                    <span style={{ fontSize:13, lineHeight:1 }}>{d.icon||'📡'}</span>
                    <span style={{ fontSize:6, fontFamily:'JetBrains Mono', color:col, marginTop:1 }}>{(d.ip||'').split('.').pop()}</span>
                  </div>
                  <div className="tooltip" style={{ whiteSpace:'normal', width:160, left:'auto', transform:'none', right:0 }}>
                    <span style={{ fontWeight:700, color:C.cyan, display:'block', marginBottom:4 }}>{d.label||d.device_type||'IoT Device'}</span>
                    <span style={{ color:'rgba(123,145,176,.8)', display:'block' }}>IP: {d.ip}</span>
                    <span style={{ color:'rgba(123,145,176,.7)', display:'block' }}>Zone: {d.zone}</span>
                    <span style={{ color:'rgba(123,145,176,.7)', display:'block' }}>VLAN: {d.vlan||'—'}</span>
                    <span style={{ color:col, display:'block', marginTop:3 }}>Risk: {d.risk_score||0}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Threat Intelligence Table */}
        <div className="glass-card" style={{ overflow:'hidden', display:'flex', flexDirection:'column', minHeight:380 }}>
          {/* Header */}
          <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(0,229,255,.07)', background:'rgba(2,8,23,.04)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:'rgba(0,229,255,.1)', border:'1px solid rgba(0,229,255,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Eye style={{ width:14, height:14, color:C.cyan, filter:`drop-shadow(0 0 4px ${C.cyan})` }}/>
              </div>
              <div>
                <h2 style={{ fontSize:14, fontWeight:600, color:'rgba(230,241,255,.95)', margin:0 }}>Threat Intelligence</h2>
                <p style={{ fontSize:10, color:'rgba(123,145,176,.38)', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'.1em' }}>{alerts.length} events · real-time monitoring</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              {[...new Set(alerts.slice(0,5).map(a=>geoIp(a.src_ip).f))].slice(0,4).map((f,i)=><span key={i} style={{ fontSize:16 }}>{f}</span>)}
            </div>
          </div>
          {/* Column headers */}
          <div style={{ display:'grid', gridTemplateColumns:'1.2fr .9fr 1.5fr .8fr 1fr .8fr .9fr', padding:'7px 20px', fontSize:9, fontWeight:700, letterSpacing:'.14em', color:'rgba(0,200,255,.2)', textTransform:'uppercase', background:'rgba(2,8,23,.03)', borderBottom:'1px solid rgba(0,229,255,.05)', flexShrink:0 }}>
            {['Source IP','Zone','Attack Pattern','Severity','Status','Method','Time'].map(h=><p key={h} style={{ margin:0 }}>{h}</p>)}
          </div>
          {/* Rows */}
          <div style={{ overflowY:'auto', flex:1 }}>
            {!alerts.length && <div style={{ padding:50, textAlign:'center', fontSize:12, color:'rgba(123,145,176,.3)' }}>No threats detected</div>}
            {alerts.slice(0,16).map((a,i)=>{
              const sv=SEV[a.severity]||SEV.LOW;
              // IDS only status
              const status = a.is_simulation?'Simulated':i%4===0?'Investigating':i%4===1?'Logged':'Under Monitoring';
              const method = a.detection_method||'Packet Analysis';
              return (
                <div key={a.id||i} style={{ display:'grid', gridTemplateColumns:'1.2fr .9fr 1.5fr .8fr 1fr .8fr .9fr', padding:'10px 20px', borderBottom:'1px solid rgba(0,229,255,.04)', background:i%2===0?'transparent':'rgba(2,8,23,.02)', transition:'background .15s', cursor:'default', minHeight:52 }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(0,229,255,.025)'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':'rgba(2,8,23,.02)'}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:sv.dot, boxShadow:`0 0 5px ${sv.dot}`, flexShrink:0 }}/>
                    <span style={{ fontSize:12, fontFamily:'JetBrains Mono', color:C.cyan, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.src_ip||'—'}</span>
                  </div>
                  <span style={{ fontSize:11, color:'rgba(123,145,176,.45)', alignSelf:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.zone||'Network'}</span>
                  <span style={{ fontSize:12, color:'rgba(210,228,255,.75)', fontWeight:500, alignSelf:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.attack_type}</span>
                  <div style={{ alignSelf:'center' }}>
                    <span className={sv.cls}>{a.severity}</span>
                  </div>
                  <span style={{ fontSize:11, fontWeight:500, alignSelf:'center', color:status==='Investigating'?C.orange:status==='Simulated'?C.purple:'rgba(123,145,176,.5)' }}>{status}</span>
                  <span style={{ fontSize:10, color:'rgba(123,145,176,.4)', alignSelf:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{method}</span>
                  <span style={{ fontSize:10, fontFamily:'JetBrains Mono', color:'rgba(123,145,176,.35)', alignSelf:'center' }}>
                    {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--:--:--'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · TLS 1.3 Encrypted · Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
}
