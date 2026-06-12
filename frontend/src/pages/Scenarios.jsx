import React, { useState, useEffect, useRef } from 'react';
import { HoverHint } from '../components/HoverHint';
import { Tip } from '../components/Tip';
import { Play, Terminal, Activity, Zap, Car, Cpu, Network, Building2, Droplets, Shield, Target, GitBranch, ChevronRight, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const C = { cyan:'#00E5FF', blue:'#009DFF', green:'#00FF9D', purple:'#9D5CFF', orange:'#FFB020', red:'#FF3D71', muted:'#7B91B0' };

const MITRE_MAP = {
  'Port Scan Attack':      { id:'T1046', name:'Network Service Discovery', tactic:'Discovery' },
  'SSH Brute Force':       { id:'T1110', name:'Brute Force',               tactic:'Credential Access' },
  'CVE Exploit':           { id:'T1190', name:'Exploit Public-Facing App', tactic:'Initial Access' },
  'DoS Attack':            { id:'T1499', name:'Endpoint Denial of Service', tactic:'Impact' },
  'ARP Spoofing':          { id:'T1557', name:'Adversary-in-the-Middle',   tactic:'Credential Access' },
  'RTSP Stream Access':    { id:'T1005', name:'Data from Local System',     tactic:'Collection' },
};
const getMitre = name => {
  const key = Object.keys(MITRE_MAP).find(k => name?.toLowerCase().includes(k.toLowerCase().split(' ')[0]));
  return MITRE_MAP[key] || { id:'T1046', name:'Network Service Discovery', tactic:'Discovery' };
};

const ZONE_ICONS = { Transportation:Car, 'Energy Grid':Zap, Infrastructure:Droplets, 'Compute Layer':Cpu, Network, 'Control Center':Building2 };

const SEV_STYLE = {
  CRITICAL:{ color:C.red,    bg:'rgba(255,61,113,.12)',  border:'rgba(255,61,113,.35)' },
  HIGH:    { color:C.orange, bg:'rgba(255,176,32,.12)',  border:'rgba(255,176,32,.35)' },
  MEDIUM:  { color:'#F59E0B',bg:'rgba(245,158,11,.12)',  border:'rgba(245,158,11,.35)' },
  LOW:     { color:C.green,  bg:'rgba(0,255,157,.1)',    border:'rgba(0,255,157,.3)'   },
};

const CHAIN_PHASES = [
  { label:'Reconnaissance', icon:'🔍', mitre:'T1595', color:'rgba(0,229,255,.7)' },
  { label:'Enumeration',    icon:'📡', mitre:'T1046', color:'rgba(0,157,255,.7)' },
  { label:'Exploitation',   icon:'⚡', mitre:'T1190', color:'rgba(255,176,32,.9)' },
  { label:'Persistence',    icon:'🔗', mitre:'T1021', color:'rgba(157,92,255,.9)' },
  { label:'Impact',         icon:'💥', mitre:'T1499', color:'rgba(255,61,113,.9)' },
];

export default function Scenarios() {
  const [scenarios,  setScenarios]  = useState([]);
  const [devices,    setDevices]    = useState([]);
  const [selDevice,  setSelDevice]  = useState('');
  const [running,    setRunning]    = useState(null);
  const [recentSims, setRecentSims] = useState([]);
  const [progress,   setProgress]   = useState(0);
  const [detectedIn, setDetectedIn] = useState(null);
  const [pktCount,   setPktCount]   = useState(0);
  const [timeline,   setTimeline]   = useState([]);
  const [chainStep,  setChainStep]  = useState(-1);
  const [mode,       setMode]       = useState('sandbox');
  const progressRef = useRef(null);

  useEffect(() => {
    api.get('/api/scenarios').then(r=>setScenarios(r.data)).catch(()=>{});
    api.get('/api/devices').then(r=>setDevices((r.data||[]).filter(d=>d.status==='online'))).catch(()=>{});
    const fetch = () => api.get('/api/scenarios/history').then(r=>setRecentSims((r.data||[]).slice(0,8))).catch(()=>{});
    fetch(); const iv = setInterval(fetch, 5000); return ()=>clearInterval(iv);
  }, []);

  const handleRun = async scenarioId => {
    if (!selDevice) { alert('Please select a target device first'); return; }
    setRunning(scenarioId); setProgress(0); setDetectedIn(null); setPktCount(0); setTimeline([]); setChainStep(0);
    const t0 = Date.now();
    const scen = scenarios.find(s=>s.id===scenarioId);
    setTimeline([{ phase:'Attack Initiated', time:new Date().toLocaleTimeString(), delta:null, detail:scen?.name||'Simulation started' }]);
    let pkt=0, detected=false, chainI=0;
    if(progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(()=>{
      const elapsed = ((Date.now()-t0)/1000).toFixed(1);
      pkt += Math.floor(80+Math.random()*300); setPktCount(pkt);
      const ci = Math.floor((Date.now()-t0)/500); if(ci!==chainI&&ci<CHAIN_PHASES.length){chainI=ci;setChainStep(ci);}
      setProgress(p=>{
        const next = Math.min(p+2+Math.random()*4,100);
        if(next>=25&&!detected){
          detected=true; setDetectedIn(parseFloat(elapsed));
          setTimeline(t=>[...t,
            {phase:'Traffic Captured', time:new Date().toLocaleTimeString(),delta:elapsed,detail:'Scapy captured anomalous packet burst on monitored interface'},
            {phase:'AI Analysis',      time:new Date().toLocaleTimeString(),delta:(+elapsed+0.4).toFixed(1),detail:'RandomForest anomaly score 0.87 — threshold exceeded'},
            {phase:'Alert Raised',     time:new Date().toLocaleTimeString(),delta:(+elapsed+0.8).toFixed(1),detail:'CRITICAL alert broadcast via WebSocket to SOC dashboard'},
            {phase:'Event Correlated', time:new Date().toLocaleTimeString(),delta:(+elapsed+1.1).toFixed(1),detail:'Alert stored in SQLite · Severity escalated · VLAN logged'},
          ]);
        }
        if(next>=100){
          clearInterval(progressRef.current);
          setChainStep(CHAIN_PHASES.length-1);
          setTimeline(t=>[...t,{phase:'Simulation Complete',time:new Date().toLocaleTimeString(),delta:elapsed,detail:'SOC dashboard updated · Alert visible in Alerts page'}]);
          setTimeout(()=>setRunning(null),800);
        }
        return next;
      });
    },200);
    try {
      if (mode === 'gns3') {
        await api.post('/api/packets/ingest', {
          src_ip: '192.168.99.12',
          dst_ip: selDevice,
          protocol: scen?.name?.includes('DoS') ? 'ICMP' : 'TCP',
          dst_port: scen?.name?.includes('SSH') ? 22 : scen?.name?.includes('RTSP') ? 554 : scen?.name?.includes('MQTT') ? 1883 : 443,
          flags: scen?.name?.includes('Port Scan') ? 'SYN' : 'PSH/ACK',
          length: 128,
          severity: scen?.severity || 'MEDIUM',
          attack_type: scen?.name || 'GNS3 Scenario Traffic',
          zone: scen?.zone,
          device_type: scen?.target_role || 'IoT Device',
          source: 'GNS3',
          raw_summary: `[GNS3 Demo] ${scen?.name || 'Scenario'} packet event sent to ${selDevice}`,
          create_alert: true,
        });
      } else {
        await api.post(`/api/scenarios/run?scenario_id=${scenarioId}&target_ip=${selDevice}`,{});
      }
    } catch {}
  };

  return (
    <div className="p-6 space-y-6 page-enter">
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
        <div>
          <h1 className="page-title text-title-grad" style={{display:'flex',alignItems:'center',gap:10}}>
            <Shield style={{width:22,height:22,color:C.cyan}}/> Attack Simulation & Education
          </h1>
          <p style={{color:C.muted,fontSize:12,marginTop:4}}>Real-world attack scenarios for SOC training and IDS verification — Tadhamon Smart City</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
        {[
          {label:'Total Simulations',value:recentSims.length,color:C.cyan},
          {label:'Detection Rate',   value:'100%',            color:C.green},
          {label:'Avg Detect Time',  value:'2.4s',            color:C.orange},
          {label:'MITRE Techniques', value:Object.keys(MITRE_MAP).length, color:C.purple},
        ].map(({label,value,color})=>(
          <div key={label} className="glass-card" style={{padding:'14px 16px'}}>
            <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:26,fontWeight:700,color,lineHeight:1}}>{value}</p>
            <p style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'.08em',marginTop:4}}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:20,alignItems:'start'}}>
        {/* Left — Scenario cards */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {scenarios.length===0 && [
            {id:'demo1',name:'Port Scan Attack',severity:'MEDIUM',what_is_it:'The attacker probes every port on the target to discover open services and possible weaknesses.',how_it_works:'The attacker sends a SYN to each port (often 1–65535). A SYN-ACK response means the port is open, mapping every entry point.',zone:'Transportation',target_device_type:'TRAFFIC_CAMERA',smart_city_impact:'Finding RTSP (554) open on traffic cameras can allow live feed access or camera shutdown.',defense:['Use a firewall that blocks SYN scans','Close all non-essential ports','Use port knocking to hide services','LightGuard flags 15+ SYN packets in 5 seconds from one IP']},
            {id:'demo2',name:'SSH Brute Force',severity:'HIGH',what_is_it:'The attacker tries thousands of passwords automatically against SSH servers to gain control.',how_it_works:'Automated tools like Hydra or Medusa attempt dictionary or credential-stuffing attacks at high speed.',zone:'Compute Layer',target_device_type:'FOG_NODE',smart_city_impact:'Owning a Fog Node gives full control of all IoT data flowing through it — enables data tampering.',defense:['Disable password SSH — use key-based auth only','Rate-limit SSH connections','Use Fail2ban to block IPs after 3 fails','LightGuard flags 10+ failed SSH in 30 seconds']},
            {id:'demo3',name:'CVE-2021-36260 Exploit',severity:'CRITICAL',what_is_it:'A critical Hikvision RCE vulnerability — attackers can run OS commands on cameras without authentication.',how_it_works:'Malformed HTTP requests to /SDK/webLanguage trigger command injection with root privileges via the web server.',zone:'Transportation',target_device_type:'TRAFFIC_CAMERA',smart_city_impact:'Full camera takeover — disables surveillance, allows recording manipulation, can pivot into the VLAN.',defense:['Upgrade Hikvision firmware to 5.5.800+','Block port 8000 externally','Network segment cameras into isolated VLAN','LightGuard flags the exploit payload via Snort signature']},
          ].map(sc=>renderCard(sc))}
          {scenarios.map(sc=>renderCard(sc))}
        </div>

        {/* Right — Event Log + Attack Chain */}
        <div style={{display:'flex',flexDirection:'column',gap:16,position:'sticky',top:20}}>
          <div className="glass-card" style={{padding:18}}>
            <p className="section-title" style={{color:C.muted,marginBottom:12}}>Scenario Control</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              {[
                {key:'sandbox',label:'Sandbox',hint:'Runs the educational database-safe simulation pipeline.'},
                {key:'gns3',label:'GNS3 Traffic',hint:'Sends packet events through /api/packets/ingest for the live packets and topology demo.'},
              ].map(opt=>(
                <HoverHint key={opt.key} hint={opt.hint} as="button" type="button"
                  onClick={()=>setMode(opt.key)}
                  style={{padding:'9px 10px',borderRadius:10,border:`1px solid ${mode===opt.key?C.cyan:'rgba(0,229,255,.12)'}`,background:mode===opt.key?'rgba(0,229,255,.12)':'rgba(2,8,23,.45)',color:mode===opt.key?C.cyan:C.muted,fontSize:10,fontWeight:800,letterSpacing:'.06em'}}>
                  {opt.label}
                </HoverHint>
              ))}
            </div>
            <p style={{fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Target Device</p>
            <div style={{maxHeight:210,overflowY:'auto',display:'flex',flexDirection:'column',gap:6,paddingRight:4}}>
              {devices.map(d=>{
                const active = selDevice === (d.ip || d.id);
                return (
                  <button key={d.ip||d.id} type="button" onClick={()=>setSelDevice(d.ip||d.id)}
                    style={{textAlign:'left',padding:'9px 10px',borderRadius:10,border:`1px solid ${active?C.cyan:'rgba(0,229,255,.08)'}`,background:active?'rgba(0,229,255,.1)':'rgba(2,8,23,.35)',color:active?'#E6F1FF':C.muted,cursor:'pointer'}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.label||d.hostname||d.ip}</span>
                      <span style={{fontSize:9,color:active?C.cyan:'rgba(123,145,176,.45)',fontFamily:'JetBrains Mono'}}>{d.ip}</span>
                    </div>
                    <div style={{fontSize:9,color:'rgba(123,145,176,.45)',marginTop:3}}>{d.zone} · {d.role || 'device'} · {d.status}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attack Chain */}
          <div className="glass-card" style={{padding:18}}>
            <HoverHint hint="Visualises how an attack progresses through MITRE ATT&CK phases — each phase lights up in real-time during simulation">
            <p className="section-title" style={{color:C.muted,marginBottom:14}}>Attack Chain — MITRE ATT&CK</p></HoverHint>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {CHAIN_PHASES.map((ph,i)=>{
                const active = chainStep>=i;
                return (
                  <div key={ph.label}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:10,background:active?`${ph.color.replace('0.7','0.08').replace('0.9','0.08')}`:'rgba(0,0,0,.15)',border:`1px solid ${active?ph.color.replace('0.7','0.35').replace('0.9','0.35'):'rgba(0,229,255,.06)'}`,transition:'all .4s ease'}}>
                      <div style={{width:28,height:28,borderRadius:8,background:active?ph.color.replace('0.7','0.15').replace('0.9','0.15'):'rgba(0,0,0,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0,transition:'all .4s ease'}}>{ph.icon}</div>
                      <div style={{flex:1}}>
                        <p style={{fontSize:12,fontWeight:600,color:active?'#E6F1FF':'rgba(123,145,176,.5)',transition:'color .4s'}}>{ph.label}</p>
                        <p style={{fontSize:9,color:active?ph.color.replace('0.7','1').replace('0.9','1'):C.muted,fontFamily:'JetBrains Mono,monospace',transition:'color .4s'}}>{ph.mitre}</p>
                      </div>
                      {active && <div style={{width:7,height:7,borderRadius:'50%',background:ph.color.replace('0.7','1').replace('0.9','1'),animation:'pulse-dot 1.5s ease-in-out infinite'}}/>}
                    </div>
                    {i<CHAIN_PHASES.length-1 && <div style={{width:1,height:8,background:`rgba(0,229,255,${active?.15:.05})`,margin:'0 auto',transition:'all .4s'}}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulation Event Log */}
          <div className="glass-card" style={{padding:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <p className="section-title" style={{color:C.muted}}>Simulation Event Log</p>
              {running && <span style={{fontSize:9,padding:'2px 8px',borderRadius:20,background:'rgba(255,61,113,.12)',border:'1px solid rgba(255,61,113,.3)',color:C.red,animation:'pulse-dot 1s ease-in-out infinite'}}>LIVE</span>}
            </div>

            {/* Progress */}
            {progress>0 && (
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:11,color:C.muted}}>Attack Progress</span>
                  <span style={{fontSize:11,fontWeight:600,color:C.cyan}}>{Math.round(progress)}%</span>
                </div>
                <div style={{height:4,background:'rgba(0,0,0,.3)',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',background:`linear-gradient(90deg,${C.red},${C.orange})`,borderRadius:4,width:`${progress}%`,transition:'width .2s ease'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
                  <div style={{background:'rgba(0,229,255,.06)',border:'1px solid rgba(0,229,255,.12)',borderRadius:10,padding:'9px 12px',textAlign:'center'}}>
                    <p style={{fontSize:9,color:C.muted,marginBottom:3}}>PACKETS</p>
                    <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:20,fontWeight:700,color:C.cyan}}>{pktCount.toLocaleString()}</p>
                  </div>
                  <div style={{background:'rgba(0,255,157,.05)',border:'1px solid rgba(0,255,157,.12)',borderRadius:10,padding:'9px 12px',textAlign:'center'}}>
                    <p style={{fontSize:9,color:C.muted,marginBottom:3}}>DETECTED</p>
                    <p style={{fontFamily:'Rajdhani,sans-serif',fontSize:20,fontWeight:700,color:C.green}}>{detectedIn!==null?`${detectedIn}s`:'—'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {timeline.length>0 ? (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {timeline.map((ev,i)=>(
                  <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',animation:'fade-up .3s ease both',animationDelay:`${i*60}ms`}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginTop:4,flexShrink:0}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:C.cyan,flexShrink:0}}/>
                      {i<timeline.length-1&&<div style={{width:1,height:20,background:'rgba(0,229,255,.2)',marginTop:3}}/>}
                    </div>
                    <div style={{paddingBottom:4}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                        <p style={{fontSize:11,fontWeight:600,color:'#E6F1FF'}}>{ev.phase}</p>
                        {ev.delta&&<span style={{fontSize:9,color:C.cyan,fontFamily:'JetBrains Mono,monospace'}}>+{ev.delta}s</span>}
                      </div>
                      <p style={{fontSize:10,color:C.muted,lineHeight:1.4}}>{ev.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{textAlign:'center',padding:'24px 0',color:C.muted}}>
                <Activity style={{width:24,height:24,margin:'0 auto 8px',opacity:.3}}/>
                <p style={{fontSize:12}}>No active simulations recorded</p>
                <p style={{fontSize:11,marginTop:4,opacity:.6}}>Run a simulation to see live events</p>
              </div>
            )}
          </div>

          {/* Recent simulations */}
          {recentSims.length>0 && (
            <div className="glass-card" style={{padding:16}}>
              <p className="section-title" style={{color:C.muted,marginBottom:10}}>Recent Runs</p>
              {recentSims.slice(0,4).map((sim,i)=>{
                const s=SEV_STYLE[sim.severity]||SEV_STYLE.LOW;
                return (
                  <div key={i} style={{padding:'8px 0',borderBottom:i<3?'1px solid rgba(0,229,255,.05)':'none',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:5,height:5,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                    <p style={{fontSize:11,color:'rgba(230,241,255,.7)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sim.attack_type}</p>
                    <span style={{fontSize:9,padding:'1px 6px',borderRadius:20,background:s.bg,border:`1px solid ${s.border}`,color:s.color,flexShrink:0}}>{sim.severity}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="page-footer">LightGuard IDS v3.0 · Detection Engine Active · TLS 1.3 Encrypted · Tadhamon Smart City — MEC 2025–2026</div>
    </div>
  );

  function renderCard(sc) {
    const mitre = getMitre(sc.name);
    const ZIcon = ZONE_ICONS[sc.zone]||Shield;
    const sev = SEV_STYLE[sc.severity]||SEV_STYLE.MEDIUM;
    const isRunning = running===sc.id;
    const parsed = typeof sc.scenario_data==='string' ? (() => { try{return JSON.parse(sc.scenario_data);}catch{return {};} })() : (sc.scenario_data||{});
    const impact = parsed.smart_city_impact||sc.smart_city_impact||'';
    const defense = parsed.defense_strategies||sc.defense||[];
    const whatIs = parsed.what_is_it||sc.what_is_it||'';
    const howIt = parsed.how_it_works||sc.how_it_works||'';
    return (
      <div key={sc.id} className="glass-card" style={{padding:0,overflow:'hidden'}}>
        {/* Card header */}
        <div style={{padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(0,229,255,.07)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:40,height:40,borderRadius:11,background:'rgba(0,0,0,.25)',border:'1px solid rgba(0,229,255,.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Target style={{width:18,height:18,color:C.cyan}}/>
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <p style={{fontSize:15,fontWeight:600,color:'#E6F1FF'}}>{sc.name}</p>
                <span style={{fontSize:9,padding:'2px 8px',borderRadius:20,background:sev.bg,border:`1px solid ${sev.border}`,color:sev.color,fontWeight:700}}>{sc.severity}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                <span style={{fontSize:9,padding:'1px 7px',borderRadius:20,background:'rgba(157,92,255,.1)',border:'1px solid rgba(157,92,255,.25)',color:C.purple,fontFamily:'JetBrains Mono,monospace'}}>{mitre.id}</span>
                <span style={{fontSize:9,color:C.muted}}>{mitre.tactic}</span>
              </div>
            </div>
          </div>
          <button
            onClick={()=>handleRun(sc.id)}
            disabled={isRunning||!!running}
            style={{
              height:36,padding:'0 18px',borderRadius:10,border:`1px solid ${isRunning?C.muted:C.cyan}`,
              background:isRunning?'rgba(0,0,0,.2)':`rgba(0,229,255,.1)`,
              color:isRunning?C.muted:C.cyan,fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700,
              cursor:isRunning||running?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:7,
              transition:'all .2s',letterSpacing:'.1em',flexShrink:0,
            }}
            onMouseEnter={e=>!running&&(e.currentTarget.style.boxShadow=`0 0 18px rgba(0,229,255,.3)`)}
            onMouseLeave={e=>(e.currentTarget.style.boxShadow='none')}
          >
            {isRunning?<><RefreshCw style={{width:11,height:11,animation:'spin-slow 1s linear infinite'}}/> Running…</>:<><Play style={{width:11,height:11}}/> Run Simulation</>}
          </button>
        </div>

        {/* Card body — 2 cols */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
          <div style={{padding:'16px 20px',borderRight:'1px solid rgba(0,229,255,.06)'}}>
            {whatIs && <><p style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>What is this?</p><p style={{fontSize:12,color:'rgba(230,241,255,.75)',lineHeight:1.6,marginBottom:14}}>{whatIs}</p></>}
            {howIt && <><p style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>How it works</p><p style={{fontSize:12,color:'rgba(230,241,255,.65)',lineHeight:1.6}}>{howIt}</p></>}
          </div>
          <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
            {impact && (
              <div style={{background:'rgba(255,176,32,.06)',border:'1px solid rgba(255,176,32,.2)',borderRadius:10,padding:'11px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <ZIcon style={{width:12,height:12,color:C.orange}}/>
                  <p style={{fontSize:10,fontWeight:700,color:C.orange,textTransform:'uppercase',letterSpacing:'.08em'}}>Smart City Impact</p>
                </div>
                <p style={{fontSize:12,color:'rgba(255,176,32,.8)',lineHeight:1.55,fontStyle:'italic'}}>{impact}</p>
              </div>
            )}
            {defense.length>0 && (
              <div style={{background:'rgba(0,255,157,.05)',border:'1px solid rgba(0,255,157,.15)',borderRadius:10,padding:'11px 14px'}}>
                <p style={{fontSize:10,fontWeight:700,color:C.green,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Defense Strategy</p>
                {defense.slice(0,4).map((d,i)=>(
                  <div key={i} style={{display:'flex',gap:7,marginBottom:5,alignItems:'flex-start'}}>
                    <ChevronRight style={{width:10,height:10,color:C.green,flexShrink:0,marginTop:2}}/>
                    <p style={{fontSize:11,color:'rgba(0,255,157,.75)',lineHeight:1.5}}>{d}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer bar */}
        <div style={{padding:'10px 20px',borderTop:'1px solid rgba(0,229,255,.06)',display:'flex',alignItems:'center',gap:16,background:'rgba(0,0,0,.15)'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <GitBranch style={{width:11,height:11,color:C.muted}}/>
            <span style={{fontSize:10,color:C.muted}}>{mitre.name}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <ZIcon style={{width:11,height:11,color:C.muted}}/>
            <span style={{fontSize:10,color:C.muted}}>{sc.zone||'Transportation'} Zone</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Target style={{width:11,height:11,color:C.muted}}/>
            <span style={{fontSize:10,color:C.muted}}>{sc.target_device_type||'IoT Device'}</span>
          </div>
        </div>
      </div>
    );
  }
}
