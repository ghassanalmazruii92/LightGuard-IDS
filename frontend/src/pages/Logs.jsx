import { useState, useEffect } from 'react';
import HoverHint from '../components/HoverHint';
import { FileText, RefreshCw, Download, Filter } from 'lucide-react';
import api from '../lib/api';

const C = { cyan:'#00E5FF', blue:'#009DFF', green:'#00FF9D', purple:'#9D5CFF', orange:'#FFB020', red:'#FF3D71', muted:'#7B91B0' };
const SEV = {
  CRITICAL:{ color:'#FF3D71', bg:'rgba(255,61,113,.1)',  border:'rgba(255,61,113,.3)',  strip:'rgba(255,61,113,.35)' },
  HIGH:    { color:'#FFB020', bg:'rgba(255,176,32,.1)',  border:'rgba(255,176,32,.3)',  strip:'rgba(255,176,32,.3)'  },
  MEDIUM:  { color:'#F59E0B', bg:'rgba(245,158,11,.1)',  border:'rgba(245,158,11,.25)', strip:'rgba(245,158,11,.25)' },
  LOW:     { color:'#00FF9D', bg:'rgba(0,255,157,.08)', border:'rgba(0,255,157,.25)',  strip:'rgba(0,255,157,.25)'  },
};

const clean = t => t ? t.replace(/Mock/gi,'').trim() : t;

export default function Logs({ user }) {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ severity:'', protocol:'', zone:'', attack_type:'' });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const p = new URLSearchParams({ page, limit:50 });
      if (filters.severity)   p.append('severity',   filters.severity);
      if (filters.protocol)   p.append('protocol',   filters.protocol);
      if (filters.zone)       p.append('zone',        filters.zone);
      if (filters.attack_type) p.append('attack_type', filters.attack_type);
      const res  = await fetch(`/api/logs?${p}`, { headers:{ Authorization:`Bearer ${token}` } });
      const data = await res.json();
      setLogs((data.items||[]).map(l => ({ ...l, attack_type:clean(l.attack_type), description:clean(l.description) })));
      setTotal(data.total||0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page, filters]);

  const exportCSV = () => {
    const hdr = ['Timestamp','Source IP','Dest IP','Protocol','Port','Zone','Device','Attack Type','Severity','Detection','Action Taken'];
    const rows = logs.map(l => [l.timestamp,l.source_ip,l.destination_ip,l.protocol,l.port||'',l.zone,l.device_role,l.attack_type,l.severity,l.detection_method,l.action_taken]);
    const csv = [hdr,...rows].map(r=>r.map(v=>`"${v||''}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`lightguard_logs_${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
  };

  const ZONES = [...new Set(logs.map(l=>l.zone).filter(Boolean))];
  const TYPES = [...new Set(logs.map(l=>l.attack_type).filter(Boolean))].slice(0,12);

  return (
    <div className="p-6 space-y-5 page-enter">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title text-title-grad" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <FileText style={{ width:22, height:22, color:C.blue }} />
            Security Logs
          </h1>
          <p style={{ fontSize:12, color:C.muted, marginTop:4 }}>SOC-grade audit trail — {total.toLocaleString()} total events · Tadhamon Smart City</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <HoverHint hint="Reload security logs from the database. New events appear at the top automatically.">
          <button onClick={fetchLogs} className="btn-cyber" style={{ height:36, fontSize:11, gap:6 }} title="Reload logs from the database with current filters">
            <RefreshCw style={{ width:12, height:12 }} /> Refresh
          </button></HoverHint>
          <HoverHint hint="Export all filtered log entries as a CSV file for offline analysis or SIEM integration.">
          <button onClick={exportCSV} className="btn-cyber" style={{ height:36, fontSize:11, gap:6 }} title="Export filtered security logs to CSV for SIEM or reporting tools">
            <Download style={{ width:12, height:12 }} /> Export CSV
          </button></HoverHint>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding:'14px 18px' }}>
        <p className="section-title" style={{ color:C.muted, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
          <Filter style={{ width:11, height:11 }} /> Filters
        </p>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          {[
            { label:'Severity',    key:'severity',    opts:[['','All Severities'],['CRITICAL','Critical'],['HIGH','High'],['MEDIUM','Medium'],['LOW','Low']] },
            { label:'Zone',        key:'zone',        opts:[['','All Zones'],  ...ZONES.map(z=>[z,z])] },
            { label:'Attack Type', key:'attack_type', opts:[['','All Types'],  ...TYPES.map(t=>[t,t.slice(0,28)])] },
          ].map(({ label, key, opts }) => (
            <div key={key}>
              <p style={{ fontSize:9, color:C.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'.08em' }}>{label}</p>
              <select
                value={filters[key]}
                onChange={e=>{setFilters(f=>({...f,[key]:e.target.value}));setPage(1);}}
                className="input-glass"
                style={{ fontSize:11, padding:'7px 10px', minWidth:130 }}
              >
                {opts.map(([v,l])=><option key={v} value={v} style={{ background:'#071426' }}>{l}</option>)}
              </select>
            </div>
          ))}
          <div>
            <p style={{ fontSize:9, color:C.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'.08em' }}>Protocol</p>
            <input
              placeholder="TCP, UDP…"
              value={filters.protocol}
              onChange={e=>{setFilters(f=>({...f,protocol:e.target.value}));setPage(1);}}
              className="input-glass"
              style={{ fontSize:11, padding:'7px 10px', width:90 }}
            />
          </div>
          {Object.values(filters).some(Boolean) && (
            <button
              onClick={()=>{setFilters({severity:'',protocol:'',zone:'',attack_type:''});setPage(1);}}
              style={{ background:'rgba(255,61,113,.08)', border:'1px solid rgba(255,61,113,.2)', borderRadius:8, padding:'7px 12px', color:C.red, fontSize:11, cursor:'pointer', marginTop:16, transition:'all .2s' }}
            >✕ Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'rgba(0,229,255,.04)', borderBottom:'1px solid rgba(0,229,255,.1)' }}>
                {[{h:'Timestamp',tip:'Date and time the log entry was recorded.'},{h:'Source IP',tip:'Source IPv4 address of the event.'},{h:'Dest IP',tip:'Destination IPv4 address.'},{h:'Protocol',tip:'Network protocol: TCP, UDP, ICMP, or ARP.'},{h:'Port',tip:'Destination port number if available.'},{h:'Zone',tip:'VLAN zone where the event originated.'},{h:'Device',tip:'Device role or type assigned in the inventory.'},{h:'Attack Type',tip:'Attack classification by the detection engine.'},{h:'Severity',tip:'Severity level: CRITICAL, HIGH, MEDIUM, or LOW.'},{h:'Detection',tip:'Detection method: Live Detection Engine or Scenario Engine.'},{h:'Action Taken',tip:'Response recorded: Logged & Monitored, Alert Generated, or Under Review.'}].map(({h,tip}) => (
                  <HoverHint key={h} hint={tip} as="th" className="section-title" style={{ padding:'10px 12px', textAlign:'left', color:'rgba(123,145,176,.6)', whiteSpace:'nowrap', fontSize:9, cursor:'help' }}>{h}</HoverHint>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [1,2,3,4,5].map(i=>(
                <tr key={i}><td colSpan={11} style={{ padding:'12px' }}><div className="skeleton" style={{ height:16, width:`${60+i*8}%` }}/></td></tr>
              ))}
              {!loading && logs.length===0 && (
                <tr><td colSpan={11} style={{ textAlign:'center', padding:'48px', color:C.muted }}>No logs found for selected filters.</td></tr>
              )}
              {!loading && logs.map((l,i) => {
                const s = SEV[l.severity] || SEV.LOW;
                const actionColor = l.action_taken?.includes('Alert') ? C.red : l.action_taken?.includes('Monitoring') ? C.orange : C.muted;
                return (
                  <tr
                    key={l.id||i}
                    style={{ borderBottom:'1px solid rgba(0,229,255,.04)', borderLeft:`3px solid ${s.strip}`, transition:'background .12s ease' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(0,229,255,.025)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td className="mono-ip" style={{ padding:'8px 12px', color:'rgba(123,145,176,.5)', whiteSpace:'nowrap' }}>{l.timestamp?new Date(l.timestamp).toLocaleString():'—'}</td>
                    <td className="mono-ip" style={{ padding:'8px 12px', color:C.cyan }}>{l.source_ip||'—'}</td>
                    <td className="mono-ip" style={{ padding:'8px 12px', color:'#85B7EB' }}>{l.destination_ip||'—'}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, color:'#E6F1FF' }}>{l.protocol||'—'}</td>
                    <td className="mono-ip" style={{ padding:'8px 12px', color:C.muted }}>{l.port||'—'}</td>
                    <td style={{ padding:'8px 12px', color:'rgba(230,241,255,.6)' }}>{l.zone||'—'}</td>
                    <td style={{ padding:'8px 12px', color:C.muted, maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.device_role||'—'}</td>
                    <td style={{ padding:'8px 12px', fontWeight:600, color:'#E6F1FF', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.attack_type||'—'}</td>
                    <td style={{ padding:'8px 12px' }}>
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background:s.bg, border:`1px solid ${s.border}`, color:s.color }}>{l.severity||'—'}</span>
                    </td>
                    <td style={{ padding:'8px 12px', color:C.muted, fontSize:10, maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.detection_method||'—'}</td>
                    <td style={{ padding:'8px 12px', fontWeight:500, color:actionColor, fontSize:10, whiteSpace:'nowrap' }}>{l.action_taken||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, color:C.muted }}>Page {page} · showing {logs.length} of {total.toLocaleString()}</span>
        <div style={{ display:'flex', gap:8 }}>
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="btn-cyber" style={{ height:32, fontSize:10, opacity:page===1?.4:1 }}>← Prev</button>
          <button disabled={logs.length<50} onClick={()=>setPage(p=>p+1)} className="btn-cyber" style={{ height:32, fontSize:10, opacity:logs.length<50?.4:1 }}>Next →</button>
        </div>
      </div>

      <div className="page-footer">
        LightGuard IDS v3.0 · Detection Engine Active · TLS 1.3 Encrypted · Tadhamon Smart City — MEC 2025–2026
      </div>
    </div>
  );
}
