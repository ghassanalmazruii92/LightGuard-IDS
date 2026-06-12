"""
LightGuard IDS — Feature Extraction for NSL-KDD RandomForest Model
Extracts 11 statistical flow-level features from Scapy packets.
These features align with the NSL-KDD dataset used to train ml/model.pkl.

Note (Chapter 5 §5.5.4):
    Full per-IP flow aggregation (count, srv_count, serror_rate, etc.) requires
    a stateful flow table maintained over a sliding window. The current
    implementation provides a best-effort extraction from individual packets.
    A complete flow aggregation engine is planned as the primary future improvement.
"""
from scapy.all import IP, TCP, UDP, ICMP  # noqa: F401

# ── Per-IP sliding-window counters (shared with packet_capture.py) ──────────
_flow_table: dict = {}   # src_ip → {"count": int, "srv_count": int,
                          #           "serror": int, "rerror": int,
                          #           "last_port": int}

_SERVICE_MAP = {
    80:   "http",   443:  "https",   22:  "ssh",    21:  "ftp",
    25:   "smtp",   53:  "domain",   110: "pop_3",   143: "imap4",
    23:   "telnet", 1883: "mqtt",    554: "rtsp",    3389: "rdp",
}


def _update_flow(src_ip: str, dst_port: int, has_error: bool) -> dict:
    """Update in-memory flow counter for src_ip and return current stats."""
    if src_ip not in _flow_table:
        _flow_table[src_ip] = {
            "count": 0, "srv_count": 0, "serror": 0,
            "rerror": 0, "last_port": dst_port
        }
    f = _flow_table[src_ip]
    f["count"]     += 1
    if dst_port == f["last_port"]:
        f["srv_count"] += 1
    else:
        f["srv_count"] = 1
        f["last_port"] = dst_port
    if has_error:
        f["serror"] += 1
    return f


def extract_features(packet) -> dict:
    """
    Extract NSL-KDD compatible features from a Scapy packet.

    Returns a dict with 11 features used by the RandomForest classifier:
        duration, protocol_type, service, flag, src_bytes, dst_bytes,
        land, wrong_fragment, urgent, count, srv_count, error_rate
    """
    features = {
        "duration":       0.0,
        "protocol_type":  "tcp",
        "service":        "http",
        "flag":           "SF",
        "src_bytes":      0,
        "dst_bytes":      0,
        "land":           0,
        "wrong_fragment": 0,
        "urgent":         0,
        "count":          1,
        "srv_count":      1,
        "error_rate":     0.0,
    }

    if IP not in packet:
        return features

    src_ip = packet[IP].src
    dst_ip = packet[IP].dst

    # Land attack: source == destination
    features["land"] = int(src_ip == dst_ip)

    # Fragmentation anomaly
    features["wrong_fragment"] = int(
        bool(packet[IP].frag) and packet[IP].flags.MF == 0
    )

    dst_port = 0

    if TCP in packet:
        dst_port = packet[TCP].dport
        features["protocol_type"] = "tcp"
        features["service"]       = _SERVICE_MAP.get(dst_port, "other")
        features["src_bytes"]     = len(bytes(packet[TCP].payload))
        features["urgent"]        = int(packet[TCP].urgptr > 0)

        # Map TCP flags to NSL-KDD connection state
        flags = packet[TCP].flags
        if   flags == 0x02:          features["flag"] = "S0"   # SYN only
        elif flags == 0x12:          features["flag"] = "S1"   # SYN-ACK
        elif flags == 0x18:          features["flag"] = "SF"   # PSH-ACK (established)
        elif flags & 0x04:           features["flag"] = "REJ"  # RST
        elif flags == 0x11:          features["flag"] = "FIN"  # FIN-ACK
        else:                        features["flag"] = "OTH"

        has_error = features["flag"] in ("REJ", "S0", "OTH")

    elif UDP in packet:
        dst_port = packet[UDP].dport
        features["protocol_type"] = "udp"
        features["service"]       = _SERVICE_MAP.get(dst_port, "other")
        features["src_bytes"]     = len(bytes(packet[UDP].payload))
        has_error = False

    elif ICMP in packet:
        features["protocol_type"] = "icmp"
        features["service"]       = "eco_i"
        features["src_bytes"]     = len(bytes(packet[ICMP].payload))
        has_error = bool(packet[ICMP].type in (3, 11, 12))  # unreachable/timeout
        features["flag"]          = "SF" if not has_error else "REJ"

    else:
        has_error = False

    # Update flow table and retrieve aggregated stats
    flow = _update_flow(src_ip, dst_port, has_error)
    features["count"]      = min(flow["count"], 511)
    features["srv_count"]  = min(flow["srv_count"], 511)
    total                  = max(flow["count"], 1)
    features["error_rate"] = round(flow["serror"] / total, 4)

    return features
