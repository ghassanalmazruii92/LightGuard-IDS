# LightGuard IDS — دليل التشغيل الكامل
## Tadhamon Smart City | Student: Ghassan Said AlMazruii (11F8254)
## Supervisor: Abdullah Abbasi | Middle East College, Knowledge Oasis Muscat

---

## المتطلبات الأساسية

| البرنامج | الإصدار المطلوب | الرابط |
|----------|-----------------|--------|
| Python | 3.10 أو أحدث | python.org/downloads |
| Node.js | 18 أو أحدث | nodejs.org |
| GNS3 | 2.2 أو أحدث (اختياري) | gns3.com/software |

---

## الخطوة 1 — إعداد البيئة

```bash
# نسخ ملف الإعدادات
cp config/lightguard.env.example config/lightguard.env
```

**الإعدادات الرئيسية في `config/lightguard.env`:**

| المتغير | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `MOCK_MODE` | `true` | `true` = بدون Scapy (للعرض) / `false` = التقاط حقيقي (يحتاج root) |
| `JWT_SECRET` | غيّره في الإنتاج | مفتاح توقيع JWT |
| `NETWORK_INTERFACE` | `en0` | واجهة الشبكة للالتقاط (مثل `eth0` على Linux) |
| `GEMINI_API_KEY` | مُعبَّأ | مفتاح Gemini AI للتحليل |
| `LIGHTGUARD_ENCRYPTION_KEY` | يُولَّد تلقائياً | مفتاح Fernet AES-128-CBC |

---

## الخطوة 2 — تشغيل Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

انتظر حتى تظهر:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
[startup] Database initialised and seeded — 17 Tadhamon IoT devices ready
[startup] Adaptive optimizer started (30-min cycle)
[startup] Fernet encryption key loaded
```

---

## الخطوة 3 — تشغيل Frontend

```bash
# في Terminal جديد
cd frontend
npm install
npm run dev
```

انتظر حتى تظهر:
```
VITE v5.x ready in Xs
➜  Local:   http://localhost:5173/
```

---

## الخطوة 4 — تسجيل الدخول

افتح: **http://localhost:5173**

| الحساب | Username | Password | الصلاحيات |
|--------|----------|----------|-----------|
| Administrator | `admin` | `lightguard123` | كامل — جميع الصفحات والإعدادات |
| Viewer | `viewer` | `viewer123` | قراءة فقط — Dashboard والتنبيهات |

---

## الخطوة 5 — إعداد GNS3 (اختياري)

```
1. افتح GNS3
2. File → Open project → gns3/LightGuard_Tadhamon.gns3
3. Start All من الـ toolbar
4. كل الأجهزة نوعها VPCS — لا تحتاج images إضافية
```

**عناوين IP الرئيسية في GNS3:**

| الجهاز | العنوان | VLAN |
|--------|---------|------|
| cam-traffic-01 | 192.168.10.11 | 10 — Transportation |
| smart-meter-01 | 192.168.20.11 | 20 — Energy Grid |
| fog-node-01 | 192.168.40.11 | 40 — Compute |
| LightGuard-IDS-Server | 192.168.99.10 | 99 — Control Centre |

---

## صفحات النظام

| الصفحة | الرابط | الوصف |
|--------|--------|-------|
| Dashboard | `/` | نظرة عامة: 557 تنبيه، 17 جهاز، 6 zones، WebSocket live feed |
| Alerts | `/alerts` | سجل التنبيهات مع Filter وMark FP وExport CSV |
| Devices | `/devices` | جرد أجهزة IoT مع CVE وrisk score وAI Analysis |
| Topology | `/topology` | شبكة VLAN مع Firewall Rules وLive Logs |
| Fog Nodes | `/fog` | حالة 3 nodes مع forwarding وheartbeat |
| Scenarios | `/scenarios` | 7 سيناريوهات MITRE ATT&CK — اضغط Run Simulation |
| Live Packets | `/live-packets` | تحليل الحزم لحظة بلحظة |
| Logs | `/logs` | سجلات SOC مع Export CSV |
| Users | `/users` | إدارة المستخدمين والأدوار (ADMIN فقط) |
| Settings | `/settings` | ML model، Adaptive Optimizer، Encryption status |

---

## تشغيل Fog Node بشكل منفصل

```bash
# في Terminal جديد
python start_fog_node.py
```

يعمل على port 8001 — يدعم 3 مناطق:
- Zone A: Transportation (HIGH_TRAFFIC_SPIKE, CAMERA_PACKET_FLOOD)
- Zone B: Energy Grid (VOLTAGE_SPIKE, ABNORMAL_TEMP)
- Zone C: Public Safety (HIGH_TRAFFIC_SPIKE, CAMERA_PACKET_FLOOD)

---

## إعداد MFA (اختياري)

```bash
# 1. بعد تسجيل الدخول كـ admin، اطلب QR code:
POST http://localhost:8000/auth/mfa/setup
Authorization: Bearer <access_token>

# 2. امسح QR بـ Google Authenticator أو Authy

# 3. تحقق من الإعداد:
POST http://localhost:8000/auth/mfa/verify
{"totp_code": "123456"}

# 4. عند تسجيل الدخول مجدداً (بعد الإعداد):
POST http://localhost:8000/auth/login
→ يُعيد: {"mfa_required": true, "temp_token": "..."}

# 5. أكمل المصادقة:
POST http://localhost:8000/auth/login/verify
{"temp_token": "...", "totp_code": "123456"}
→ يُعيد: {"access_token": "...", "mfa_verified": true}
```

---

## تشغيل HTTPS (للإنتاج)

```bash
./scripts/start_https.sh
```

أو يدوياً:
```bash
cd backend
python -m uvicorn main:app \
  --host 0.0.0.0 \
  --port 443 \
  --ssl-keyfile ../certs/key.pem \
  --ssl-certfile ../certs/cert.pem
```

---

## تشغيل الاختبارات

```bash
cd backend
python -m pytest ../tests/test_lightguard_smoke.py -v
```

النتيجة المتوقعة:
```
PASSED tests/test_lightguard_smoke.py::test_health_login_evaluation_summary
2 passed in X.XXs
```

---

## تدريب نموذج ML (اختياري)

```bash
# تحميل NSL-KDD أولاً من: https://www.unb.ca/cic/datasets/nsl.html
# ضع KDDTrain+.txt في مجلد ml/

python ml/train.py
# يُنشئ: ml/model.pkl + ml/training_metrics.json
```

---

## معلومات المشروع

| البيان | التفاصيل |
|--------|---------|
| عنوان المشروع | LightGuard: A Resource-Conscious Intrusion Detection System for Smart IoT Environments |
| الطالب | Ghassan Said Ghassan AlMazruii — 11F8254 |
| المشرف | Abdullah Abbasi |
| المؤسسة | Middle East College, Knowledge Oasis Muscat, Oman |
| التخصص | Computer Engineering — Cyber Security |
| المنهجية | Cisco PPDIOO |
| المعيار | NIST SP 800-207 Zero Trust Architecture |
| البيئة المستهدفة | Tadhamon Smart City — Oman Vision 2040 |
