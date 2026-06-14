# LightGuard — قائمة التحقق للفصل الخامس
# Chapter 5 Verification Checklist
## Tadhamon Smart City | Ghassan Said AlMazruii (11F8254) | MEC 2026

---

## القسم 1 — لقطات الشاشة المطلوبة

| البند | الصفحة / الرابط | ملاحظات |
|-------|-----------------|---------|
| **لوحة التحكم الرئيسية ★** | `Dashboard` — `/` | يُظهر 1,068 تنبيه، 6 zones، 24-hour heatmap، WebSocket live feed |
| **مراقبة فورية للشبكة ★** | `Dashboard` + `Live Packets` — `/live-packets` | WebSocket يُحدَّث كل ~300ms بدون page refresh |
| **صفحة تنبيهات ★** | `Alerts` — `/alerts` | Filter + Sort + Mark FP + Export CSV + Explain AI |
| **تسجيل دخول ★** | `Login` — `/login` | JWT authentication — يرفض كلمة المرور الخاطئة بـ 401 |
| **MFA ★** | `Settings` — `/settings` | **مُطبَّق كاملاً** — TOTP RFC 6238 + QR Code + DISABLE MFA button |
| **أدوار المستخدمين ★** | `Users` — `/users` | Admin فقط — إنشاء + تعديل + RBAC (Admin / Analyst / Viewer) |
| **إحصاءات ورسوم** | `Dashboard` | Recharts: severity distribution + 24h heatmap + zone cards |
| **طوبولوجيا شبكة ★** | `Topology` — `/topology` | 6 VLANs ملوّنة + Firewall Rules + Encryption status + Live attack edges |
| **Fog Nodes** | `Fog Nodes` — `/fog` | 3 zones Online + forwarding stats + threshold 800 pkt/s |
| **سيناريوهات الهجوم** | `Scenarios` — `/scenarios` | 7 سيناريوهات MITRE ATT&CK — SSH, ARP, Port Scan, ICMP, DNS, MQTT, CVE |
| **أجهزة IoT + CVE** | `Devices` — `/devices` | 17 device + CVE-2021-36260 + CVE-2021-33044 + Risk Score |
| **سجلات SOC** | `Logs` — `/logs` | Event log كامل + Export CSV |
| **إعدادات ML** | `AI Detection` + `Settings` | RandomForest / TFLite toggle + Threshold + Adaptive Optimizer |
| **اختبارات آلية ★** | Terminal: `py -3.11 -m pytest tests/ -v` | TC-32: PASSED — 1 passed in X.XXs |
| **GNS3 Topology ★** | GNS3 Application | 56 node + 56 link + كل الأجهزة خضراء |
| **Wireshark Capture ★** | Wireshark على GNS3 link | ARP + ICMP packets بين 192.168.10.11 و 192.168.10.12 |
| **SSH Brute Force من GNS3** | `Alerts` — Method: GNS3 | 95% confidence + HIGH severity |
| **API Docs** | `http://localhost:8000/docs` | Swagger UI — كل endpoint موثَّق |

---

## القسم 2 — ما المُطبَّق فعلاً؟

| السؤال | الإجابة الفعلية |
|--------|----------------|
| **IDS المستخدم ★** | Hybrid: **Snort** (log parser) + **Scapy** (packet capture) + **RandomForest ML** (99.2% accuracy على NSL-KDD) + TFLite (اختياري) |
| **هل الكشف يعمل؟ ★** | **نعم** — 6 signature rules + ML anomaly + Fog rules. في MOCK_MODE: synthetic traffic. في REAL mode: Scapy يحتاج root/Administrator |
| **لوحة حقيقية؟ ★** | **نعم** — React 18 + Vite + Tailwind + WebSocket |
| **تقنية اللوحة ★** | **React 18 (Vite) + Tailwind CSS + Recharts + FastAPI backend** |
| **تعلم آلي؟ ★** | **نعم** — RandomForestClassifier على NSL-KDD، دقة 99.2%، runtime toggle لـ TFLite |
| **Fog Computing؟** | **نعم** — fog_node.py على port 8001، 3 zones، threshold 800 pkt/s، يُحيل HIGH/CRITICAL فقط |
| **GNS3؟** | **نعم** — 56 node + 56 link + 6 VLANs + 18 startup.vpc (IPs تلقائية) |
| **أدوات الشبكة** | Python 3.11 + Scapy + SocketScanner (TCP connect, بدون root) + GNS3 + Wireshark |

---

## القسم 3 — الميزات الأمنية المُطبَّقة

| الميزة | الحالة | التفاصيل |
|--------|--------|---------|
| **JWT Authentication** | ✅ مُطبَّق كاملاً | HS256 — 24 ساعة — scope-based |
| **RBAC** | ✅ مُطبَّق كاملاً | Admin / Analyst / Viewer — `admin_required()` Dependency |
| **MFA (TOTP)** | ✅ مُطبَّق كاملاً | pyotp RFC 6238 — 4 endpoints: setup/verify/disable/status |
| **Fernet Encryption** | ✅ مُطبَّق كاملاً | AES-128-CBC + HMAC-SHA256 — كل alert مشفَّر قبل الحفظ |
| **VLAN Segmentation** | ✅ مُطبَّق في GNS3 | 6 VLANs — 192.168.10-50-99.x |
| **Firewall / ACL Rules** | ✅ منطقي في التطبيق | 6 قواعد في قاعدة البيانات + واجهة إدارة |
| **SQL Injection Detection** | ✅ مُطبَّق كاملاً | SQLiMiddleware — passive/forensic — CRITICAL alert |
| **Brute-Force Detection** | ✅ مُطبَّق كاملاً | 5 محاولات في 60 ثانية → HIGH alert |
| **Adaptive Optimizer** | ✅ مُطبَّق كاملاً | كل 30 دقيقة — يضبط threshold تلقائياً |
| **WebSocket Real-time** | ✅ مُطبَّق كاملاً | ~300ms latency — بدون page refresh |
| **TLS/HTTPS** | ⚠️ اختياري | start_https.sh — self-signed cert — ليس افتراضياً |
| **Password Hashing** | ✅ مُطبَّق كاملاً | pbkdf2_sha256 + individual salt |

---

## القسم 4 — قواعد الكشف الدقيقة

### Signature Rules (packet_capture.py)

| القاعدة | الشرط | الخطورة | MITRE |
|---------|-------|---------|-------|
| ARP Spoofing | ARP Reply + IP→MAC مختلف | CRITICAL | T1557.002 |
| Port Scan | ≥ 15 SYN في 5 ثواني | MEDIUM | T1046 |
| SSH Brute Force | ≥ 10 TCP/22 في 10 ثواني | HIGH | T1110 |
| ICMP Flood | ≥ 100 ICMP في 3 ثواني | HIGH | T1498 |
| DNS Tunnelling | ≥ 20 UDP/DNS >512B في 10 ثواني | MEDIUM | T1048 |
| Unencrypted MQTT | أول TCP/1883 من مصدر جديد | MEDIUM | T1071 |

### Adaptive Optimizer Logic

```
كل 1800 ثانية (30 دقيقة):
  آخر 200 تنبيه (WINDOW_SIZE)
  FP_rate = FP_count ÷ 200
  إذا FP > 20%: threshold × 1.05 (أقل حساسية)
  إذا FP < 5%:  threshold × 0.95 (أكثر حساسية)
  يُحفظ في جدول DetectionConfig
```

---

## القسم 5 — النتائج الفعلية (أرقام)

| المقياس | القيمة | المصدر |
|---------|--------|--------|
| Test Cases | 34 TC: 33 Pass (97%) + 1 Partial | Manual testing — Table 5.11 |
| ML Accuracy | 99.2% | `ml/training_metrics.json` |
| False Positive Rate | 0.0% (في بيئة الاختبار) | `GET /api/stats/evaluation-summary` |
| Simulation Detection Rate | 100% (10 runs) | Table 5.12 |
| Total Events | 1,068 alerts | `lightguard.db` |
| CPU Usage | ~18% تحت الحمل | `GET /api/stats/system` |
| RAM Usage | ~280 MB | `GET /api/stats/system` |
| WebSocket Latency | ~300 ms | Browser DevTools → Network → WS |
| API Response | متوسط 120ms، أقصى 380ms | pytest + manual testing |
| GNS3 Nodes | 56 node + 56 link | `gns3/LightGuard_Tadhamon.gns3` |
| IoT Devices | 17 device | `backend/seeds.py` |
| VLAN Zones | 6 VLANs | `backend/seeds.py` + GNS3 |
| CVEs Documented | CVE-2021-36260 (CVSS 9.8) + CVE-2021-33044 (CVSS 9.8) | `backend/seeds.py` |

### للحصول على الأرقام الفعلية:

```powershell
# CPU / RAM / alerts / FP rate
Invoke-RestMethod -Uri "http://localhost:8000/api/stats/evaluation-summary" `
  -Headers @{Authorization="Bearer $token"}

# ML metrics
Get-Content ml\training_metrics.json
```

---

## القسم 6 — ملفات المستودع الرئيسية

| المطلوب | الموقع |
|---------|--------|
| Backend IDS Engine | `backend/ids/` |
| Security (JWT + MFA + Fernet) | `backend/auth.py` + `backend/security/` |
| ML Model + Training | `ml/train.py` + `ml/model.pkl` |
| Fog Node Server | `backend/fog/fog_node.py` + `start_fog_node.py` |
| GNS3 Topology | `gns3/LightGuard_Tadhamon.gns3` |
| GNS3 Device IPs | `gns3/project-files/vpcs/*/startup.vpc` |
| Seeds (17 devices + CVEs) | `backend/seeds.py` |
| React Frontend | `frontend/src/pages/` |
| Automated Tests | `tests/test_lightguard_smoke.py` |
| Network Documentation | `docs/NETWORK_TOPOLOGY_AND_FLOWS.md` |
| Configuration | `config/lightguard.env` |

---

## القسم 7 — نواقص موثَّقة (للتقييم النقدي)

| النقص | السبب | التوصية المستقبلية |
|-------|-------|-------------------|
| ML غير متصل بـ live traffic | Feature extraction غير مكتمل | تطوير real-time 41-feature pipeline |
| NSL-KDD قديم (1999) | لا يحتوي هجمات IoT الحديثة | إعادة التدريب على TON-IoT أو N-BaIoT |
| SQLite غير مناسب للإنتاج | Concurrent write bottleneck | الانتقال لـ PostgreSQL مع asyncpg |
| Raspberry Pi لم يُختبَر فعلياً | التطوير على Windows/Linux workstation | نشر prototype على Raspberry Pi 4 |
| VLAN enforcement محاكاة | GNS3 simulation وليس 802.1Q حقيقي | تثبيت على Cisco Catalyst switch حقيقي |
| TLS ليس افتراضياً | Prototype environment | تفعيل HTTPS في الإنتاج via start_https.sh |

---

*LightGuard IDS v3.0 — Tadhamon Smart City — MEC June 2026*
*Ghassan Said Ghassan AlMazruii | 11F8254 | Supervisor: Mr. Abdullah Abbasi*
