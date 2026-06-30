import os
import json
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

# ══════════════════════════════════════════════════════════
#  FIREBASE INITIALIZATION
# ══════════════════════════════════════════════════════════

def init_firebase():
    if not firebase_admin._apps:
        firebase_config_str = os.environ.get('FIREBASE_CONFIG_JSON')
        
        if firebase_config_str:
            # حالة السيرفر (Render)
            firebase_config = json.loads(firebase_config_str)
            cred = credentials.Certificate(firebase_config)
            firebase_admin.initialize_app(cred)
            print("✅ Firebase connected via Environment Variables")
        else:
            # حالة جهازك (Local)
            key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'firebase-key.json')
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            print("✅ Firebase connected via local file")
    else:
        print("ℹ️ Firebase already initialized.")

init_firebase()
db = firestore.client()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ══════════════════════════════════════════════════════════
#  HELPERS (تم تركها كما هي)
# ══════════════════════════════════════════════════════════

def normalize_rec(r):
    if not r: return None
    attachments = r.get("attachments")
    if isinstance(attachments, str):
        try: attachments = json.loads(attachments)
        except: attachments = []
    elif not attachments: attachments = []
    return {
        "caseKey": r.get("case_key"), "caseNo": r.get("case_no"), "monthKey": r.get("month_key"),
        "techSupport": r.get("tech_support"), "techServices": r.get("tech_services"),
        "decision": r.get("decision"), "closedNote": r.get("closed_note"),
        "carryMonth": r.get("carry_month"), "carryDept": r.get("carry_dept"),
        "carryNote": r.get("carry_note"), "attachments": attachments, "savedAt": r.get("saved_at")
    }

def normalize_san(s):
    if not s: return None
    return {
        "id": s.get("id"), "monthKey": s.get("month_key"), "sanNo": s.get("san_no"),
        "acType": s.get("ac_type"), "ata": s.get("ata"), "deliveryDate": s.get("delivery_date"),
        "targetDate": s.get("target_date"), "etops": s.get("etops"), "pireps": s.get("pireps"),
        "rate": s.get("rate"), "alert": s.get("alert"), "tsAction": s.get("ts_action"),
        "rcbModule": s.get("rcb_module"), "rcbMonth": s.get("rcb_month"), "createdAt": s.get("created_at")
    }

# ══════════════════════════════════════════════════════════
#  API ENDPOINTS (تم تركها كما هي)
# ══════════════════════════════════════════════════════════
# ... (باقي الـ Endpoints الخاصة بك تظل كما هي في ملفك) ...

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat() + "Z"})

# ... باقي الكود الخاص بك (get_months, save_month, إلخ) ...
# تأكد أنك نسخت باقي الـ Endpoints من ملفك الأصلي تحت هنا.

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3001))
    print(f"\n🛫 Flask MRO Backend is running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)