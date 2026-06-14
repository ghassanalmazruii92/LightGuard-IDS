# LightGuard IDS — دليل التشغيل الكامل
## Tadhamon Smart City | الطالب: Ghassan Said AlMazruii (11F8254)
## المشرف: Mr. Abdullah Abbasi | Middle East College, Knowledge Oasis Muscat

---

## المتطلبات الأساسية

| البرنامج | الإصدار المطلوب | الرابط |
|----------|-----------------|--------|
| Python | **3.11** (مُختبَر ومُوصى به) | python.org/downloads |
| Node.js | 18 أو أحدث | nodejs.org |
| GNS3 | 2.2 أو أحدث (اختياري) | gns3.com/software |
| Wireshark | أي إصدار (اختياري) | wireshark.org |
| Npcap | أحدث إصدار (Windows فقط) | npcap.com |

> **ملاحظة Windows:** Npcap مطلوب لـ Scapy وWireshark. GNS3 يتطلب Npcap أيضاً.

---

## الخطوة 1 — إعداد البيئة

```powershell
# انتقل لمجلد المشروع
cd C:\Users\Ghass\Downloads\lightguard11

# انسخ ملف الإعدادات
copy config\lightguard.env.example config\lightguard.env
```

**الإعدادات الرئيسية في `config/lightguard.env`:**

| المتغير | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `MOCK_MODE` | `true` | `true` = بدون Scapy (للعرض) / `false` = التقاط حقيقي (يحتاج root أو Administrator) |
| `NETWORK_CIDR` | `192.168.99.0/24` | الشبكة المستهدفة للمسح |
| `NETWORK_INTERFACE` | `eth0` | واجهة الشبكة للالتقاط (مثل `eth0` على Linux أو `Wi-Fi` على Windows) |
| `SCAN_INTERVAL` | `3600` | ثواني بين كل مسح شبكة |
| `JWT_SECRET` | auto | غيّره في الإنتاج |
| `JWT_EXPIRE_HOURS` | `24` | مدة صلاحية JWT بالساعات |
| `SNORT_LOG` | `/var/log/snort/alert` | مسار ملف سجل Snort |
| `GEMINI_API_KEY` | مُعبَّأ | مفتاح Google Gemini AI |
| `LIGHTGUARD_ENCRYPTION_KEY` | يُولَّد تلقائياً | مفتاح Fernet AES-128-CBC (يُحفظ تلقائياً عند أول تشغيل) |

---

## الخطوة 2 — تثبيت المكتبات (مرة واحدة فقط)

```powershell
cd C:\Users\Ghass\Downloads\lightguard11

# تثبيت مكتبات Python 3.11
py -3.11 -m pip install -r backend\requirements.txt
```

---

## الخطوة 3 — تشغيل النظام

### الطريقة الأسرع (أمر واحد)

```powershell
cd C:\Users\Ghass\Downloads\lightguard11
py -3.11 run.py
```

انتظر حتى تظهر:
```
╔══════════════════════════════════════════════════════════╗
║        LightGuard IDS — Tadhamon Smart City             ║
╠══════════════════════════════════════════════════════════╣
║  Dashboard  →  http://localhost:8000                    ║
║  API Docs   →  http://localhost:8000/docs               ║
║  Mode       →  MOCK (Demo)                              ║
║                                                         ║
║  Login: admin / lightguard123                           ║
╚══════════════════════════════════════════════════════════╝
INFO:     Uvicorn running on http://0.0.0.0:8000
[seeds] DB already has 17 devices – skipping seed.
[adaptive_optimizer] Started — tuning every 30 minutes
```

افتح المتصفح على: **http://localhost:8000**

### خيارات التشغيل

```powershell
# وضع Demo (افتراضي — بدون GNS3)
py -3.11 run.py

# وضع GNS3 الحقيقي (يحتاج GNS3 يعمل)
py -3.11 run.py --real

# منفذ مخصص
py -3.11 run.py --port 9000

# وضع التطوير (إعادة تحميل تلقائية عند تعديل الكود)
py -3.11 run.py --reload
```

---

## الخطوة 4 — تسجيل الدخول

افتح: **http://localhost:8000**

| الحساب | Username | Password | الصلاحيات |
|--------|----------|----------|-----------|
| Administrator | `admin` | `lightguard123` | كامل — جميع الصفحات والإعدادات وإدارة المستخدمين |
| SOC Analyst | `analyst` | `analyst123` | قراءة + Mark FP + تعديل التنبيهات |
| Read-Only Viewer | `viewer` | `viewer123` | Dashboard والتنبيهات — قراءة فقط |

> **اختبار RBAC:** سجّل دخول بـ viewer وحاول فتح `/users` — ستحصل على 403 Forbidden.

---

## الخطوة 5 — تشغيل Fog Node (اختياري)

```powershell
# في Terminal جديد منفصل
cd C:\Users\Ghass\Downloads\lightguard11
py -3.11 start_fog_node.py
```

يعمل على port **8001** بشكل مستقل عن الـ backend الرئيسي.

**3 مناطق:**
- **Zone A** (192.168.40.11): Transportation — HIGH_TRAFFIC_SPIKE, CAMERA_PACKET_FLOOD
- **Zone B** (192.168.40.12): Energy Grid — VOLTAGE_SPIKE, ABNORMAL_TEMP
- **Zone C** (192.168.40.21): Public Safety — HIGH_TRAFFIC_SPIKE, CAMERA_PACKET_FLOOD

**قواعد الكشف في الـ Fog:**

| القاعدة | الشرط | الخطورة | الإجراء |
|---------|-------|---------|---------|
| HIGH_TRAFFIC_SPIKE | > 800 packet/s | HIGH | يُحيل للـ Central IDS |
| VOLTAGE_SPIKE | voltage > 260V | CRITICAL | يُحيل للـ Central IDS |
| CAMERA_PACKET_FLOOD | bandwidth > 90 Mbps | HIGH | يُحيل للـ Central IDS |
| ABNORMAL_TEMP | temp > 80°C | MEDIUM | يُحيل للـ Central IDS |
| باقي الأحداث | LOW / MEDIUM | LOW/MED | يُسجّل محلياً في fog_node_log.json |

---

## الخطوة 6 — إعداد GNS3 (اختياري)

```
1. افتح GNS3
2. File → Open Project
3. اختر: C:\Users\Ghass\Downloads\lightguard11\gns3\LightGuard_Tadhamon.gns3
4. اضغط ▶ Start All nodes (الزر الأخضر في شريط الأدوات)
5. انتظر 30 ثانية حتى تصير كل النقاط خضراء
```

> **ملاحظة:** إذا ظهرت رسالة Dynamips error — اضغط OK وتجاهلها. المشروع يستخدم VPCS وليس Cisco IOS.

**عناوين IP المحفوظة تلقائياً (startup.vpc):**

| الجهاز | العنوان | VLAN |
|--------|---------|------|
| cam-traffic-01 | 192.168.10.11 | 10 — Transportation |
| cam-traffic-02 | 192.168.10.12 | 10 — Transportation |
| traffic-light-ctrl-01 | 192.168.10.13 | 10 — Transportation |
| smart-meter-01 | 192.168.20.11 | 20 — Energy Grid |
| smart-meter-02 | 192.168.20.12 | 20 — Energy Grid |
| power-distribution-01 | 192.168.20.21 | 20 — Energy Grid |
| env-sensor-air-01 | 192.168.30.11 | 30 — Environmental |
| env-sensor-water-01 | 192.168.30.12 | 30 — Environmental |
| water-pump-ctrl-01 | 192.168.30.20 | 30 — Environmental |
| fog-node-01 | 192.168.40.11 | 40 — Fog Compute |
| fog-node-02 | 192.168.40.12 | 40 — Fog Compute |
| fog-node-03 | 192.168.40.21 | 40 — Fog Compute |
| gateway-main | 192.168.50.1 | 50 — Core Network |
| switch-core-01 | 192.168.50.2 | 50 — Core Network |
| workstation-ops-01 | 192.168.99.11 | 99 — Control Centre |
| workstation-ops-02 | 192.168.99.12 | 99 — Control Centre |
| scada-server-01 | 192.168.99.20 | 99 — Control Centre |
| LightGuard-IDS-Server | 192.168.99.10 | 99 — Control Centre |

**اختبار الاتصال في GNS3:**
```
# في Console لـ cam-traffic-01
show                          # يظهر: 192.168.10.11/24
ping 192.168.10.12            # ping لـ cam-traffic-02
```

---

## صفحات النظام

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| Dashboard | `/` | نظرة عامة: 1,068 تنبيه، 17 جهاز، 6 zones، WebSocket live feed (~300ms) |
| Alerts | `/alerts` | سجل التنبيهات مع Filter وMark FP وExport CSV وExplain AI |
| Devices | `/devices` | جرد 17 جهاز IoT مع CVE وrisk score وopen ports |
| Topology | `/topology` | خريطة VLAN مع Firewall Rules وEncryption status وLive Logs |
| Fog Nodes | `/fog` | حالة 3 zones مع forwarding stats وheartbeat |
| Scenarios | `/scenarios` | 7 سيناريوهات MITRE ATT&CK — اضغط Run Simulation |
| Live Packets | `/live-packets` | تدفق الحزم لحظة بلحظة |
| Logs | `/logs` | سجلات SOC مع Export CSV |
| Users | `/users` | إدارة المستخدمين والأدوار (ADMIN فقط) |
| Network Health | `/network-health` | نتائج SocketScanner لاكتشاف الأجهزة |
| AI Detection | `/ai-detection` | إعدادات نموذج ML وAdaptive Optimizer |
| Settings | `/settings` | ML model toggle، Threshold، Encryption status، MFA |
| API Docs | `/docs` | Swagger UI — اختبار كل endpoint مباشرة |

---

## تشغيل هجمات تجريبية (gns3_traffic_feeder.py)

> **⚠️ مهم:** إذا كان MFA مُفعَّلاً على حساب admin، يجب تعطيله أولاً:
> ```powershell
> py -3.11 -c "from backend.database import SessionLocal, User; db=SessionLocal(); u=db.query(User).filter(User.username=='admin').first(); u.mfa_secret=None; db.commit(); print('MFA disabled')"
> ```

**الخطوة 1 — الحصول على Token:**
```powershell
$r = Invoke-RestMethod -Uri "http://localhost:8000/auth/login" `
  -Method POST `
  -Body "username=admin&password=lightguard123" `
  -ContentType "application/x-www-form-urlencoded"
$token = $r.access_token
Write-Host "Token: $($token.Substring(0,30))..."
```

**الخطوة 2 — تشغيل الهجمات:**
```powershell
# SSH Brute Force → HIGH alert (95% confidence)
py -3.11 scripts\gns3_traffic_feeder.py --token $token --attack ssh_bruteforce --count 15 --interval 0.3

# Port Scan → MEDIUM alert
py -3.11 scripts\gns3_traffic_feeder.py --token $token --attack port_scan --count 25 --interval 0.5

# ICMP Flood (DoS) → HIGH alert
py -3.11 scripts\gns3_traffic_feeder.py --token $token --attack icmp_flood --count 20 --interval 0.2

# CVE-2021-36260 Attack
py -3.11 scripts\gns3_traffic_feeder.py --token $token --attack cve_2021_36260 --count 5

# Mixed (جميع الأنواع)
py -3.11 scripts\gns3_traffic_feeder.py --token $token --attack mixed --count 30 --interval 0.5
```

---

## إعداد MFA (اختياري)

```
# الخطوة 1 — تفعيل MFA من الواجهة:
افتح Settings → Two-Factor Authentication → Generate QR Code
امسح الـ QR Code بـ Google Authenticator أو Authy
أدخل الـ 6 أرقام → اضغط Confirm & Enable

# الخطوة 2 — تسجيل الدخول بعد تفعيل MFA:
POST /auth/login
body: username=admin&password=lightguard123
→ يُعيد: {"mfa_required": true, "temp_token": "eyJ..."}

# الخطوة 3 — إكمال تسجيل الدخول:
POST /auth/login/verify
body: {"temp_token": "eyJ...", "totp_code": "123456"}
→ يُعيد: {"access_token": "eyJ...", "mfa_verified": true}

# تعطيل MFA من الواجهة:
Settings → DISABLE MFA button

# تعطيل MFA بـ API:
DELETE /auth/mfa/disable
Authorization: Bearer <access_token>

# التحقق من حالة MFA:
GET /auth/mfa/status
Authorization: Bearer <access_token>
→ يُعيد: {"mfa_enabled": true/false}
```

---

## تشغيل الاختبارات الآلية

```powershell
cd C:\Users\Ghass\Downloads\lightguard11
py -3.11 -m pytest tests\test_lightguard_smoke.py -v
```

النتيجة المتوقعة:
```
PASSED tests/test_lightguard_smoke.py::test_health_login_evaluation_summary
1 passed in X.XXs
```

---

## تشغيل HTTPS (للإنتاج)

```powershell
# توليد شهادة self-signed
.\scripts\start_https.sh

# أو يدوياً:
cd C:\Users\Ghass\Downloads\lightguard11\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8443 `
  --ssl-keyfile ..\certs\key.pem `
  --ssl-certfile ..\certs\cert.pem
```

افتح: **https://localhost:8443**

---

## إثبات RBAC أمام المُقيِّم

```powershell
# احصل على token لـ VIEWER
$rv = Invoke-RestMethod -Uri "http://localhost:8000/auth/login" `
  -Method POST `
  -Body "username=viewer&password=viewer123" `
  -ContentType "application/x-www-form-urlencoded"
$tviewer = $rv.access_token

# حاول الوصول لـ /api/users بـ VIEWER token
Invoke-WebRequest -Uri "http://localhost:8000/api/users" `
  -Headers @{Authorization="Bearer $tviewer"}

# النتيجة المتوقعة:
# StatusCode: 403
# {"detail": "Admin access required"}
```

---

## تصدير التنبيهات

```powershell
# Export CSV
Invoke-WebRequest `
  -Uri "http://localhost:8000/api/alerts/export/csv" `
  -Headers @{Authorization="Bearer $token"} `
  -OutFile "lightguard_alerts_export.csv"

# عرض أول 5 أسطر
Get-Content lightguard_alerts_export.csv | Select-Object -First 5
```

---

## إحصائيات النظام

```powershell
# System metrics (CPU, RAM, FP rate, alert totals)
Invoke-RestMethod `
  -Uri "http://localhost:8000/api/stats/evaluation-summary" `
  -Headers @{Authorization="Bearer $token"}
```

---

## معلومات المشروع

| البيان | التفاصيل |
|--------|---------|
| عنوان المشروع | LightGuard: A Resource-Conscious Intrusion Detection System for Smart IoT Environments |
| الطالب | Ghassan Said Ghassan AlMazruii — 11F8254 |
| المشرف | Mr. Abdullah Abbasi |
| المؤسسة | Middle East College, Knowledge Oasis Muscat, Oman |
| التخصص | Bachelor's of Computer Engineering — Cyber Security |
| المنهجية | Cisco PPDIOO |
| المعيار | NIST SP 800-207 Zero Trust Architecture |
| البيئة المستهدفة | Tadhamon Smart City — Oman Vision 2040 |
| GitHub | https://github.com/ghassanalmazruii92/LightGuard-IDS |
| نتائج الاختبار | 34 TC: 33 Pass (97%) + 1 Partial |
| دقة ML | 99.2% RandomForest على NSL-KDD |
| GNS3 Topology | 56 node + 56 link + 18 startup.vpc |
