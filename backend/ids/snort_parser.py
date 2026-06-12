import os
import threading
import time
import random
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from datetime import datetime
from dotenv import load_dotenv

from .alert_engine import generate_alert, Severity

load_dotenv(dotenv_path="config/lightguard.env")

SNORT_LOG_FILE = os.getenv("SNORT_LOG", "/var/log/snort/alert")
SURICATA_LOG_FILE = os.getenv("SURICATA_LOG", "/var/log/suricata/fast.log")

class AlertLogHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory and (event.src_path == SNORT_LOG_FILE or event.src_path == SURICATA_LOG_FILE):
            self.parse_new_lines(event.src_path)

    def parse_new_lines(self, file_path):
        """
        Open the log file and parse new alerts.
        """
        with open(file_path, "r") as f:
            # Simple tail -f approach to parse new lines
            # In a real implementation, you'd track the last read offset
            lines = f.readlines()
            # For demo, just parse the last line if it's new
            if lines:
                last_line = lines[-1]
                self.process_line(last_line)

    def process_line(self, line):
        """
        Parse Snort/Suricata alert line format.
        Example: [**] [1:1000001:1] Port Scan Detected [**] [Priority: 1] {TCP} 192.168.1.10:1234 -> 10.0.0.1:80
        """
        # Simple extraction using regex would be better
        # For demo purposes, we'll manually parse a line
        try:
            # Example extraction logic
            if "[**]" in line:
                parts = line.split("[**]")
                msg = parts[1].strip()
                severity = Severity.HIGH if "Priority: 1" in line else Severity.MEDIUM
                
                # Mock extraction for src/dst IP
                src_ip = "192.168.1.10"
                dst_ip = "10.0.0.1"
                protocol = "TCP"
                
                generate_alert(
                    src_ip=src_ip,
                    dst_ip=dst_ip,
                    protocol=protocol,
                    attack_type=msg,
                    severity=severity,
                    detection_method="Signature",
                    raw_payload=line
                )
        except Exception as e:
            print(f"Error parsing log line: {e}")

class LogObserver(threading.Thread):
    def __init__(self, log_path: str = SNORT_LOG_FILE):
        super().__init__(daemon=True)
        self.log_path = log_path
        self.running = False

    def run(self):
        self.running = True
        print(f"Starting log observer on {self.log_path}")
        
        # Check if log directory exists, if not, wait and check later or mock
        log_dir = os.path.dirname(self.log_path)
        if not os.path.exists(log_dir):
            print(f"Log directory {log_dir} not found. Snort parser in idle mode.")
            return

        event_handler = AlertLogHandler()
        observer = Observer()
        observer.schedule(event_handler, path=log_dir, recursive=False)
        observer.start()
        
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()

log_thread = None

def start_log_observer():
    global log_thread
    if log_thread is None:
        log_thread = LogObserver()
        log_thread.start()

def stop_log_observer():
    global log_thread
    if log_thread:
        log_thread.running = False
        log_thread = None
