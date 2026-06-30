import os
import json
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

# Enable CORS for all routes and origins to allow the frontend to connect
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Determine path for the Firebase key
base_dir = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(base_dir, 'firebase-key.json')

# Initialize Firebase SDK
cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ══════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════

def normalize_rec(r):
    if not r:
        return None
    attachments = r.get("attachments")
    if isinstance(attachments, str):
        try:
            attachments = json.loads(attachments)
        except:
            attachments = []
    elif not attachments:
        attachments = []

    return {
        "caseKey": r.get("case_key"),
        "caseNo": r.get("case_no"),
        "monthKey": r.get("month_key"),
        "techSupport": r.get("tech_support"),
        "techServices": r.get("tech_services"),
        "decision": r.get("decision"),
        "closedNote": r.get("closed_note"),
        "carryMonth": r.get("carry_month"),
        "carryDept": r.get("carry_dept"),
        "carryNote": r.get("carry_note"),
        "attachments": attachments,
        "savedAt": r.get("saved_at")
    }

def normalize_san(s):
    if not s:
        return None
    return {
        "id": s.get("id"),
        "monthKey": s.get("month_key"),
        "sanNo": s.get("san_no"),
        "acType": s.get("ac_type"),
        "ata": s.get("ata"),
        "deliveryDate": s.get("delivery_date"),
        "targetDate": s.get("target_date"),
        "etops": s.get("etops"),
        "pireps": s.get("pireps"),
        "rate": s.get("rate"),
        "alert": s.get("alert"),
        "tsAction": s.get("ts_action"),
        "rcbModule": s.get("rcb_module"),
        "rcbMonth": s.get("rcb_month"),
        "createdAt": s.get("created_at")
    }

# ══════════════════════════════════════════════════════════
#  API ENDPOINTS
# ══════════════════════════════════════════════════════════

# Health check
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat() + "Z"})

# ── MONTHS ──────────────────────────────────────────────────

# Get all months (keys + metadata only)
@app.route('/api/months', methods=['GET'])
def get_months():
    try:
        months_ref = db.collection('months')
        docs = months_ref.stream()
        result = []
        for doc in docs:
            data = doc.to_dict()
            result.append({
                "key": data.get("key"),
                "file_name": data.get("file_name"),
                "saved_at": data.get("saved_at")
            })
        result.sort(key=lambda x: x.get("key") or "")
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get full details of a single month (including sheet rows)
@app.route('/api/months/<key>', methods=['GET'])
def get_month(key):
    try:
        doc_ref = db.collection('months').document(key)
        doc = doc_ref.get()
        if not doc.exists:
            return jsonify(None)
        data = doc.to_dict()
        if isinstance(data.get("sheets"), str):
            try:
                data["sheets"] = json.loads(data["sheets"])
            except:
                pass
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Save or update month data
@app.route('/api/months/<key>', methods=['PUT'])
def save_month(key):
    try:
        body = request.json or {}
        sheets = body.get("sheets")
        file_name = body.get("fileName")
        saved_at = body.get("savedAt") or datetime.utcnow().isoformat() + "Z"

        doc_ref = db.collection('months').document(key)
        doc_ref.set({
            "key": key,
            "sheets": sheets,
            "file_name": file_name,
            "saved_at": saved_at
        })
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Delete month data
@app.route('/api/months/<key>', methods=['DELETE'])
def delete_month(key):
    try:
        db.collection('months').document(key).delete()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── RECOMMENDATIONS ──────────────────────────────────────────

# Get all recommendations (optionally filtered by monthKey)
@app.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    try:
        month_key = request.args.get('monthKey')
        recs_ref = db.collection('recommendations')
        
        if month_key:
            query = recs_ref.where('month_key', '==', month_key)
        else:
            query = recs_ref
            
        docs = query.stream()
        result = [normalize_rec(doc.to_dict()) for doc in docs]
        result.sort(key=lambda x: x.get("savedAt") or "", reverse=True)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Get a single recommendation by caseKey
@app.route('/api/recommendations/<caseKey>', methods=['GET'])
def get_recommendation(caseKey):
    try:
        doc = db.collection('recommendations').document(caseKey).get()
        if not doc.exists:
            return jsonify(None)
        return jsonify(normalize_rec(doc.to_dict()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Save or update recommendation
@app.route('/api/recommendations/<caseKey>', methods=['PUT'])
def save_recommendation(caseKey):
    try:
        body = request.json or {}
        saved_at = body.get("savedAt") or datetime.utcnow().isoformat() + "Z"
        
        doc_ref = db.collection('recommendations').document(caseKey)
        doc_ref.set({
            "case_key": caseKey,
            "case_no": body.get("caseNo", ""),
            "month_key": body.get("monthKey", ""),
            "tech_support": body.get("techSupport", ""),
            "tech_services": body.get("techServices", ""),
            "decision": body.get("decision", ""),
            "closed_note": body.get("closedNote", ""),
            "carry_month": body.get("carryMonth", ""),
            "carry_dept": body.get("carryDept", ""),
            "carry_note": body.get("carryNote", ""),
            "attachments": body.get("attachments", []),
            "saved_at": saved_at
        })
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Delete recommendation
@app.route('/api/recommendations/<caseKey>', methods=['DELETE'])
def delete_recommendation(caseKey):
    try:
        db.collection('recommendations').document(caseKey).delete()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── SAN ENTRIES ───────────────────────────────────────────────

# Get all System Alert Notices (optionally filtered by monthKey)
@app.route('/api/sans', methods=['GET'])
def get_sans():
    try:
        month_key = request.args.get('monthKey')
        sans_ref = db.collection('sans')
        if month_key:
            query = sans_ref.where('month_key', '==', month_key)
        else:
            query = sans_ref
            
        docs = query.stream()
        result = [normalize_san(doc.to_dict()) for doc in docs]
        result.sort(key=lambda x: x.get("id") or 0)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Create new SAN with auto-increment ID
@app.route('/api/sans', methods=['POST'])
def create_san():
    try:
        body = request.json or {}
        sans_ref = db.collection('sans')
        
        # Calculate next numeric ID
        docs = sans_ref.stream()
        max_id = 0
        for doc in docs:
            doc_data = doc.to_dict()
            doc_id = doc_data.get('id')
            if doc_id and isinstance(doc_id, int) and doc_id > max_id:
                max_id = doc_id
                
        new_id = max_id + 1
        created_at = datetime.utcnow().isoformat() + "Z"
        
        san_record = {
            "id": new_id,
            "month_key": body.get("monthKey") or body.get("month_key") or "",
            "san_no": body.get("sanNo") or body.get("san_no") or "",
            "ac_type": body.get("acType") or body.get("ac_type") or "",
            "ata": body.get("ata") or "",
            "delivery_date": body.get("deliveryDate") or body.get("delivery_date") or None,
            "target_date": body.get("targetDate") or body.get("target_date") or None,
            "etops": body.get("etops") or "no",
            "pireps": int(body.get("pireps") or 0),
            "rate": float(body.get("rate") or 0.0),
            "alert": float(body.get("alert") or 0.0),
            "ts_action": body.get("tsAction") or body.get("ts_action") or "open",
            "rcb_module": body.get("rcbModule") or body.get("rcb_module") or None,
            "rcb_month": body.get("rcbMonth") or body.get("rcb_month") or None,
            "created_at": created_at
        }
        
        db.collection('sans').document(str(new_id)).set(san_record)
        return jsonify(normalize_san(san_record))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Update SAN
@app.route('/api/sans/<int:san_id>', methods=['PUT'])
def update_san(san_id):
    try:
        body = request.json or {}
        doc_ref = db.collection('sans').document(str(san_id))
        
        san_record = {
            "id": san_id,
            "month_key": body.get("monthKey") or body.get("month_key") or "",
            "san_no": body.get("sanNo") or body.get("san_no") or "",
            "ac_type": body.get("acType") or body.get("ac_type") or "",
            "ata": body.get("ata") or "",
            "delivery_date": body.get("deliveryDate") or body.get("delivery_date") or None,
            "target_date": body.get("targetDate") or body.get("target_date") or None,
            "etops": body.get("etops") or "no",
            "pireps": int(body.get("pireps") or 0),
            "rate": float(body.get("rate") or 0.0),
            "alert": float(body.get("alert") or 0.0),
            "ts_action": body.get("tsAction") or body.get("ts_action") or "open",
            "rcb_module": body.get("rcbModule") or body.get("rcb_module") or None,
            "rcb_month": body.get("rcbMonth") or body.get("rcb_month") or None,
        }
        doc_ref.set(san_record, merge=True)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Delete SAN
@app.route('/api/sans/<int:san_id>', methods=['DELETE'])
def delete_san(san_id):
    try:
        db.collection('sans').document(str(san_id)).delete()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── SETTINGS ──────────────────────────────────────────────────

# Get app settings
@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        doc = db.collection('settings').document('appSettings').get()
        if not doc.exists:
            return jsonify(None)
        return jsonify(doc.to_dict().get("value"))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Update app settings
@app.route('/api/settings', methods=['PUT'])
def save_settings():
    try:
        body = request.json or {}
        db.collection('settings').document('appSettings').set({
            "key": "appSettings",
            "value": body
        })
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── BACKUP / RESTORE ──────────────────────────────────────────

# Full export
@app.route('/api/backup', methods=['GET'])
def backup():
    try:
        months = [d.to_dict() for d in db.collection('months').stream()]
        recs = [normalize_rec(d.to_dict()) for d in db.collection('recommendations').stream()]
        sans = [normalize_san(d.to_dict()) for d in db.collection('sans').stream()]
        settings = [d.to_dict() for d in db.collection('settings').stream()]
        
        return jsonify({
            "exportedAt": datetime.utcnow().isoformat() + "Z",
            "months": months,
            "recs": recs,
            "sans": sans,
            "settings": settings
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Full import
@app.route('/api/restore', methods=['POST'])
def restore():
    try:
        body = request.json or {}
        months = body.get("months", [])
        recs = body.get("recs", [])
        sans = body.get("sans", [])
        
        results = {"months": 0, "recs": 0, "sans": 0, "errors": []}
        
        # Restore months
        for m in months:
            try:
                key = m.get("key")
                db.collection('months').document(key).set({
                    "key": key,
                    "sheets": m.get("sheets"),
                    "file_name": m.get("fileName") or m.get("file_name"),
                    "saved_at": m.get("savedAt") or m.get("saved_at") or datetime.utcnow().isoformat() + "Z"
                })
                results["months"] += 1
            except Exception as e:
                results["errors"].append(f"month {m.get('key')}: {str(e)}")

        # Restore recommendations
        for r in recs:
            try:
                case_key = r.get("caseKey") or r.get("case_key")
                db.collection('recommendations').document(case_key).set({
                    "case_key": case_key,
                    "case_no": r.get("caseNo") or r.get("case_no") or "",
                    "month_key": r.get("monthKey") or r.get("month_key") or "",
                    "tech_support": r.get("techSupport") or r.get("tech_support") or "",
                    "tech_services": r.get("techServices") or r.get("tech_services") or "",
                    "decision": r.get("decision") or "",
                    "closed_note": r.get("closedNote") or r.get("closed_note") or "",
                    "carry_month": r.get("carryMonth") or r.get("carry_month") or "",
                    "carry_dept": r.get("carryDept") or r.get("carry_dept") or "",
                    "carry_note": r.get("carryNote") or r.get("carry_note") or "",
                    "attachments": r.get("attachments") or [],
                    "saved_at": r.get("savedAt") or r.get("saved_at") or datetime.utcnow().isoformat() + "Z"
                })
                results["recs"] += 1
            except Exception as e:
                results["errors"].append(f"rec {r.get('caseKey')}: {str(e)}")

        # Restore SANs
        for s in sans:
            try:
                san_id = s.get("id")
                db.collection('sans').document(str(san_id)).set({
                    "id": san_id,
                    "month_key": s.get("monthKey") or s.get("month_key") or "",
                    "san_no": s.get("sanNo") or s.get("san_no") or "",
                    "ac_type": s.get("acType") or s.get("ac_type") or "",
                    "ata": s.get("ata") or "",
                    "delivery_date": s.get("deliveryDate") or s.get("delivery_date") or None,
                    "target_date": s.get("targetDate") or s.get("target_date") or None,
                    "etops": s.get("etops") or "no",
                    "pireps": int(s.get("pireps") or 0),
                    "rate": float(s.get("rate") or 0.0),
                    "alert": float(s.get("alert") or 0.0),
                    "ts_action": s.get("tsAction") or s.get("ts_action") or "open",
                    "rcb_module": s.get("rcbModule") or s.get("rcb_module") or None,
                    "rcb_month": s.get("rcbMonth") or s.get("rcb_month") or None,
                    "created_at": s.get("createdAt") or s.get("created_at") or datetime.utcnow().isoformat() + "Z"
                })
                results["sans"] += 1
            except Exception as e:
                results["errors"].append(f"san {s.get('id')}: {str(e)}")

        return jsonify({"success": True, "results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── START SERVER ──────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3001))
    print(f"\n🛫 Flask MRO Backend is running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
