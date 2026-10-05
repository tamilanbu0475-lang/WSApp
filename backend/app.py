import os
import glob
from datetime import datetime, timezone, timedelta
import requests
import hashlib
import secrets
from html import escape
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore, auth
from auth import create_user

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

configured_file = os.getenv('FIREBASE_SERVICE_ACCOUNT')
firebase_json = None
if configured_file:
    p = os.path.join(BASE_DIR, configured_file)
    if os.path.isfile(p):
        firebase_json = p
if firebase_json is None:
    possible = glob.glob(os.path.join(BASE_DIR, '*firebase-adminsdk*.json'))
    if len(possible) == 1:
        firebase_json = possible[0]
    elif len(possible) > 1:
        raise RuntimeError('Multiple Firebase service account JSON files were found.')
if firebase_json is None:
    raise FileNotFoundError('Firebase service account JSON file was not found inside backend folder.')
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(firebase_json))

db = firestore.client()
app = Flask(__name__)
CORS(app)


DEFAULT_ADMIN_ID = '9999999999'
DEFAULT_ADMIN_EMAIL = 'admin@wsapp.com'
DEFAULT_ADMIN_PASSWORD = 'admin@ws2025'


def admin_settings_snapshot():
    snap = db.collection('settings').document('admin').get()
    return (snap.to_dict() or {}) if snap.exists else {}


def firebase_password_signin(email, password):
    key = os.getenv('FIREBASE_WEB_API_KEY')
    if not key:
        raise RuntimeError('FIREBASE_WEB_API_KEY is missing in backend/.env')
    r = requests.post(
        f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={key}',
        json={'email': email, 'password': password, 'returnSecureToken': True},
        timeout=15,
    )
    try:
        result = r.json()
    except Exception:
        result = {}
    return r.status_code, result


@app.before_request
def protect_admin_routes():
    if not request.path.startswith('/api/admin/'):
        return None
    if request.path == '/api/admin/login' or request.method == 'OPTIONS':
        return None
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return jsonify({'success': False, 'message': 'Admin authentication required.'}), 401
    token = header.split(' ', 1)[1].strip()
    if not token:
        return jsonify({'success': False, 'message': 'Admin authentication required.'}), 401
    try:
        decoded = auth.verify_id_token(token)
        settings = admin_settings_snapshot()
        if not settings.get('adminUid') or decoded.get('uid') != settings.get('adminUid'):
            return jsonify({'success': False, 'message': 'Not authorized for admin access.'}), 403
        request.admin_uid = decoded.get('uid')
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid or expired admin session.'}), 401
    return None


@app.post('/api/admin/login')
def admin_login():
    try:
        data = request.get_json(silent=True) or {}
        admin_id = str(data.get('adminId', '')).strip()
        password = str(data.get('password', ''))
        if not admin_id or not password:
            return jsonify({'success': False, 'message': 'Admin ID and password are required.'}), 400

        settings_ref = db.collection('settings').document('admin')
        settings = admin_settings_snapshot()

        # One-time bootstrap with the original project credentials. After the
        # first successful login, the credentials are controlled from Settings.
        if not settings.get('adminUid'):
            if admin_id != DEFAULT_ADMIN_ID or password != DEFAULT_ADMIN_PASSWORD:
                return jsonify({'success': False, 'message': 'Invalid admin ID or password.'}), 401
            email = settings.get('email') or DEFAULT_ADMIN_EMAIL
            try:
                admin_user = auth.get_user_by_email(email)
            except Exception:
                admin_user = auth.create_user(
                    email=email,
                    password=password,
                    display_name=settings.get('adminName') or 'Admin',
                    disabled=False,
                )
            settings_ref.set({
                'adminUid': admin_user.uid,
                'adminId': DEFAULT_ADMIN_ID,
                'adminName': settings.get('adminName') or 'Admin',
                'phone': settings.get('phone') or DEFAULT_ADMIN_ID,
                'email': email,
                'appVersion': settings.get('appVersion') or 'v1.0.0',
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }, merge=True)
            settings = admin_settings_snapshot()

        expected_id = str(settings.get('adminId', '')).strip()
        email = str(settings.get('email') or DEFAULT_ADMIN_EMAIL).strip().lower()
        if admin_id != expected_id:
            return jsonify({'success': False, 'message': 'Invalid admin ID or password.'}), 401

        code, result = firebase_password_signin(email, password)

        # Local-project recovery: if the original bootstrap credentials are used
        # and an admin UID already exists from an earlier setup, restore that
        # Firebase Authentication password before retrying the sign-in.
        # This prevents an old/partial admin setup from permanently locking out
        # the project owner. Once the password is changed in Settings, this path
        # is no longer relevant unless the original bootstrap credentials are used.
        if code != 200 and admin_id == DEFAULT_ADMIN_ID and password == DEFAULT_ADMIN_PASSWORD:
            try:
                admin_user = auth.get_user(settings.get('adminUid'))
                if admin_user.disabled:
                    auth.update_user(admin_user.uid, disabled=False, password=DEFAULT_ADMIN_PASSWORD)
                else:
                    auth.update_user(admin_user.uid, password=DEFAULT_ADMIN_PASSWORD)
                code, result = firebase_password_signin(email, DEFAULT_ADMIN_PASSWORD)
            except Exception:
                pass

        if code != 200:
            err = (result.get('error') or {}).get('message', '')
            if err in {'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS', 'USER_DISABLED'}:
                return jsonify({'success': False, 'message': 'Invalid admin ID or password.'}), 401
            return jsonify({'success': False, 'message': 'Admin login failed.', 'error': err or 'Unknown Firebase error'}), 401

        return jsonify({
            'success': True,
            'message': 'Admin login successful.',
            'token': result.get('idToken'),
            'refreshToken': result.get('refreshToken'),
            'expiresIn': result.get('expiresIn'),
            'admin': {
                'uid': settings.get('adminUid'),
                'adminId': settings.get('adminId'),
                'adminName': settings.get('adminName') or 'Admin',
                'email': email,
            },
        }), 200
    except requests.RequestException:
        return jsonify({'success': False, 'message': 'Unable to reach Firebase login service.'}), 503
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to login as admin.', 'error': str(e)}), 500


@app.post('/api/admin/logout')
def admin_logout():
    return jsonify({'success': True, 'message': 'Admin session ended.'})


def serialize(value):
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serialize(v) for v in value]
    if hasattr(value, 'isoformat'):
        try:
            return value.isoformat()
        except Exception:
            pass
    return value


def collection_records(name):
    rows = []
    for doc in db.collection(name).stream():
        data = serialize(doc.to_dict() or {})
        data['id'] = doc.id
        rows.append(data)
    rows.sort(key=lambda x: str(x.get('createdAt') or x.get('updatedAt') or x.get('date') or ''), reverse=True)
    return rows


def now_utc():
    return datetime.now(timezone.utc)


@app.get('/')
def home():
    return jsonify({'success': True, 'message': 'WS App Backend is Running', 'firebase': 'Connected'})


@app.get('/api/health')
def health():
    return jsonify({'success': True, 'message': 'Backend connection is working'})


@app.get('/api/firebase-health')
def firebase_health():
    try:
        db.collection('_system').document('health').get()
        return jsonify({'success': True, 'message': 'Firebase Firestore connection is working'})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Firebase Firestore connection failed', 'error': str(e)}), 500


@app.post('/api/register')
def register():
    try:
        data = request.get_json(silent=True) or {}
        full_name = str(data.get('fullName', '')).strip()
        phone = str(data.get('phone', '')).strip()
        email = str(data.get('email', '')).strip()
        password = str(data.get('password', ''))
        if not full_name: return jsonify({'success': False, 'message': 'Full name is required.'}), 400
        if not phone: return jsonify({'success': False, 'message': 'Phone number is required.'}), 400
        if not email: return jsonify({'success': False, 'message': 'Email is required.'}), 400
        if not password: return jsonify({'success': False, 'message': 'Password is required.'}), 400
        user = create_user(email=email, password=password, full_name=full_name, phone=phone)
        return jsonify({'success': True, 'message': 'Account created successfully.', 'user': {'uid': user.uid, 'email': user.email, 'fullName': user.display_name, 'phone': phone}}), 201
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        msg = str(e)
        if 'EMAIL_EXISTS' in msg or 'already exists' in msg.lower():
            return jsonify({'success': False, 'message': 'This email is already registered.'}), 409
        return jsonify({'success': False, 'message': 'Unable to create account.', 'error': msg}), 500


@app.post('/api/login')
def login():
    try:
        data = request.get_json(silent=True) or {}
        phone = str(data.get('phone', '')).strip()
        password = str(data.get('password', ''))
        if not phone: return jsonify({'success': False, 'message': 'Phone number is required.'}), 400
        if not password: return jsonify({'success': False, 'message': 'Password is required.'}), 400
        key = os.getenv('FIREBASE_WEB_API_KEY')
        if not key: return jsonify({'success': False, 'message': 'FIREBASE_WEB_API_KEY is missing in backend/.env'}), 500
        docs = db.collection('users').where('phone', '==', phone).limit(1).stream()
        doc = next(docs, None)
        if doc is None: return jsonify({'success': False, 'message': 'Invalid phone number or password.'}), 401
        user_data = doc.to_dict() or {}
        email = str(user_data.get('email', '')).strip().lower()
        if not email: return jsonify({'success': False, 'message': 'User email was not found.'}), 500
        r = requests.post(f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={key}', json={'email': email, 'password': password, 'returnSecureToken': True}, timeout=15)
        result = r.json()
        if r.status_code != 200:
            err = result.get('error', {}).get('message', '')
            if err in {'INVALID_PASSWORD','EMAIL_NOT_FOUND','INVALID_LOGIN_CREDENTIALS','USER_DISABLED'}:
                return jsonify({'success': False, 'message': 'Invalid phone number or password.'}), 401
            return jsonify({'success': False, 'message': 'Login failed.', 'error': err or 'Unknown Firebase error'}), 401
        fu = auth.get_user(result.get('localId'))
        return jsonify({'success': True, 'message': 'Login successful.', 'token': result.get('idToken'), 'refreshToken': result.get('refreshToken'), 'expiresIn': result.get('expiresIn'), 'user': {'uid': fu.uid, 'email': fu.email, 'fullName': user_data.get('fullName',''), 'phone': user_data.get('phone',phone)}})
    except requests.RequestException:
        return jsonify({'success': False, 'message': 'Unable to reach Firebase login service.'}), 503
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to login.', 'error': str(e)}), 500



# ---------------- USER SOS / NEAREST POLICE ----------------
def verify_user_token_optional():
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return None
    token = header.split(' ', 1)[1].strip()
    if not token:
        return None
    try:
        return auth.verify_id_token(token)
    except Exception:
        return None


def haversine_km(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, asin, sqrt
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


@app.post('/api/sos')
def create_sos_alert():
    try:
        data = request.get_json(silent=True) or {}
        decoded = verify_user_token_optional()
        uid = (decoded or {}).get('uid') or str(data.get('uid') or '').strip() or None

        user_data = {}
        if uid:
            snap = db.collection('users').document(uid).get()
            if snap.exists:
                user_data = snap.to_dict() or {}

        full_name = str(data.get('fullName') or user_data.get('fullName') or 'Unknown User').strip()
        phone = str(data.get('phone') or user_data.get('phone') or '').strip()
        email = str(data.get('email') or user_data.get('email') or '').strip().lower()

        ref = db.collection('sosAlerts').document()
        ref.set({
            'uid': uid,
            'fullName': full_name,
            'phone': phone,
            'email': email,
            'latitude': data.get('latitude'),
            'longitude': data.get('longitude'),
            'accuracy': data.get('accuracy'),
            'locationText': data.get('locationText'),
            'address': data.get('address') or data.get('locationText') or '',
            'policeStation': data.get('policeStation') or '',
            'policeAddress': data.get('policeAddress') or '',
            'policeDistanceKm': data.get('policeDistanceKm'),
            'status': 'pending',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
        return jsonify({'success': True, 'id': ref.id, 'status': 'pending'}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to create SOS alert.', 'error': str(e)}), 500


@app.patch('/api/sos/<doc_id>/location')
def update_sos_location(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        lat = data.get('latitude')
        lon = data.get('longitude')
        if lat is None or lon is None:
            return jsonify({'success': False, 'message': 'Latitude and longitude are required.'}), 400
        payload = {
            'latitude': float(lat),
            'longitude': float(lon),
            'accuracy': data.get('accuracy'),
            'locationText': 'Live GPS location',
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        for key in ('policeStation', 'policeAddress', 'policeDistanceKm'):
            if key in data:
                payload[key] = data.get(key)
        db.collection('sosAlerts').document(doc_id).set(payload, merge=True)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to update SOS location.', 'error': str(e)}), 500



def _normalize_sms_mobile(phone: str) -> str:
    digits = ''.join(ch for ch in str(phone or '') if ch.isdigit())
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    if digits.startswith('91') and len(digits) == 12:
        return digits
    if len(digits) == 10:
        return '91' + digits
    return ''


def _hash_sos_otp(code: str) -> str:
    return hashlib.sha256(str(code).encode('utf-8')).hexdigest()


def _send_sos_contact_sms(contacts, full_name, live_url, otp, maps_url, police_name, police_address):
    authkey = str(os.getenv('MSG91_AUTHKEY') or '').strip()
    template_id = str(os.getenv('MSG91_SMS_TEMPLATE_ID') or '').strip()
    flow_id = str(os.getenv('MSG91_SMS_FLOW_ID') or '').strip()
    sender = str(os.getenv('MSG91_SMS_SENDER') or '').strip()

    if not authkey:
        return False, 503, {'message': 'SOS SMS service is not configured.'}
    if not template_id and not flow_id:
        return False, 503, {'message': 'SOS SMS template/flow is not configured.'}

    recipients = []
    seen = set()
    for contact in contacts[:5]:
        raw_phone = str((contact or {}).get('phone') or '').strip()
        mobile = _normalize_sms_mobile(raw_phone)
        if not mobile or mobile in seen:
            continue
        seen.add(mobile)
        recipients.append({
            'mobiles': mobile,
            'VAR1': full_name,
            'VAR2': otp,
            'VAR3': live_url,
            'VAR4': f"{police_name} - {police_address}".strip(' -'),
            'VAR5': maps_url,
        })

    if not recipients:
        return False, 400, {'message': 'No valid emergency contact numbers found.'}

    body = {'recipients': recipients}
    if template_id:
        body['template_id'] = template_id
    else:
        body['flow_id'] = flow_id
        if sender:
            body['sender'] = sender

    try:
        response = requests.post(
            'https://control.msg91.com/api/v5/flow',
            headers={
                'accept': 'application/json',
                'authkey': authkey,
                'content-type': 'application/json',
            },
            json=body,
            timeout=20,
        )
    except requests.RequestException as exc:
        return False, 503, {'message': 'Unable to reach MSG91 SOS SMS service.', 'error': str(exc)}

    try:
        provider = response.json()
    except Exception:
        provider = {'raw': response.text}

    if not response.ok:
        return False, 502, {
            'message': 'MSG91 rejected the SOS SMS request.',
            'provider': provider,
        }

    return True, 200, {
        'sent': len(recipients),
        'message': 'SOS alert, live-location link and safety OTP accepted by MSG91.',
        'provider': provider,
    }


@app.post('/api/sos/notify-contacts')
def notify_sos_contacts():
    # Server-side OTP: it is delivered to the saved emergency contacts,
    # not to the SOS sender.
    try:
        data = request.get_json(silent=True) or {}
        sos_id = str(data.get('sosId') or '').strip()
        uid = str(data.get('uid') or '').strip()
        full_name = str(data.get('fullName') or 'WS App User').strip()
        contacts = data.get('contacts') or []

        decoded = verify_user_token_optional()
        if decoded and decoded.get('uid'):
            uid = str(decoded.get('uid'))

        if not sos_id or not uid:
            return jsonify({'success': False, 'message': 'SOS ID and authenticated user are required.'}), 400
        if not contacts:
            return jsonify({'success': False, 'message': 'No emergency contacts are saved.'}), 400

        sos_ref = db.collection('sosAlerts').document(sos_id)
        sos_snap = sos_ref.get()
        if not sos_snap.exists:
            return jsonify({'success': False, 'message': 'SOS alert was not found.'}), 404

        sos = sos_snap.to_dict() or {}
        if str(sos.get('uid') or '') != uid:
            return jsonify({'success': False, 'message': 'You are not authorized for this SOS alert.'}), 403

        lat = data.get('latitude', sos.get('latitude'))
        lon = data.get('longitude', sos.get('longitude'))
        police_name = str(data.get('policeStation') or sos.get('policeStation') or 'Nearest police station').strip()
        police_address = str(data.get('policeAddress') or sos.get('policeAddress') or 'Use live location map').strip()

        maps_url = ''
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            maps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        live_url = f"{request.url_root.rstrip('/')}/sos/{sos_id}/live"

        otp = f"{secrets.randbelow(10000):04d}"
        otp_hash = _hash_sos_otp(otp)

        sent_ok, status_code, result = _send_sos_contact_sms(
            contacts, full_name, live_url, otp, maps_url, police_name, police_address
        )
        if not sent_ok:
            return jsonify({'success': False, **result}), status_code

        recipient_phones = []
        for contact in contacts[:5]:
            mobile = _normalize_sms_mobile((contact or {}).get('phone'))
            if mobile and mobile not in recipient_phones:
                recipient_phones.append(mobile)

        sos_ref.set({
            'status': 'active',
            'stopOtpHash': otp_hash,
            'stopOtpIssuedAt': firestore.SERVER_TIMESTAMP,
            'stopOtpAttempts': 0,
            'emergencyContacts': recipient_phones,
            'contactAlertSentAt': firestore.SERVER_TIMESTAMP,
            'liveLocationUrl': live_url,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }, merge=True)

        return jsonify({
            'success': True,
            'sent': result.get('sent', len(recipient_phones)),
            'message': result.get('message'),
            'liveLocationUrl': live_url,
            'otpDeliveredToContacts': True,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to send SOS alert to emergency contacts.', 'error': str(e)}), 500


@app.post('/api/sos/<doc_id>/verify-stop-otp')
def verify_sos_stop_otp(doc_id):
    # The SOS sender enters the OTP delivered to the emergency contacts.
    try:
        data = request.get_json(silent=True) or {}
        code = ''.join(ch for ch in str(data.get('code') or '') if ch.isdigit())
        if len(code) != 4:
            return jsonify({'success': False, 'message': 'Enter the 4-digit safety OTP.'}), 400

        decoded = verify_user_token_optional()
        if not decoded or not decoded.get('uid'):
            return jsonify({'success': False, 'message': 'Authenticated SOS user is required.'}), 401

        ref = db.collection('sosAlerts').document(doc_id)
        snap = ref.get()
        if not snap.exists:
            return jsonify({'success': False, 'message': 'SOS alert was not found.'}), 404

        sos = snap.to_dict() or {}
        if str(sos.get('uid') or '') != str(decoded.get('uid')):
            return jsonify({'success': False, 'message': 'You are not authorized to stop this SOS alert.'}), 403
        if str(sos.get('status') or '').lower() == 'resolved':
            return jsonify({'success': True, 'status': 'resolved', 'verified': True}), 200

        expected_hash = str(sos.get('stopOtpHash') or '')
        if not expected_hash:
            return jsonify({'success': False, 'message': 'Safety OTP has not been issued yet.'}), 400

        attempts = int(sos.get('stopOtpAttempts') or 0)
        if attempts >= 5:
            return jsonify({'success': False, 'message': 'Too many incorrect OTP attempts.'}), 429

        if not secrets.compare_digest(expected_hash, _hash_sos_otp(code)):
            ref.set({'stopOtpAttempts': attempts + 1, 'updatedAt': firestore.SERVER_TIMESTAMP}, merge=True)
            return jsonify({'success': False, 'message': 'Incorrect safety OTP.'}), 400

        ref.set({
            'status': 'resolved',
            'stopOtpVerified': True,
            'stopOtpVerifiedAt': firestore.SERVER_TIMESTAMP,
            'resolvedAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return jsonify({'success': True, 'status': 'resolved', 'verified': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to verify safety OTP.', 'error': str(e)}), 500


@app.get('/api/sos/<doc_id>/live-data')
def get_sos_live_data(doc_id):
    try:
        snap = db.collection('sosAlerts').document(doc_id).get()
        if not snap.exists:
            return jsonify({'success': False, 'message': 'SOS alert was not found.'}), 404
        data = snap.to_dict() or {}
        lat = data.get('latitude')
        lon = data.get('longitude')
        maps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}" if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) else ''
        return jsonify({
            'success': True,
            'sosId': doc_id,
            'status': data.get('status', 'active'),
            'fullName': data.get('fullName', 'WS App User'),
            'phone': data.get('phone', ''),
            'latitude': lat,
            'longitude': lon,
            'accuracy': data.get('accuracy'),
            'policeStation': data.get('policeStation', ''),
            'policeAddress': data.get('policeAddress', ''),
            'mapsUrl': maps_url,
            'updatedAt': serialize(data.get('updatedAt')),
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load live SOS location.', 'error': str(e)}), 500


@app.get('/sos/<doc_id>/live')
def sos_live_page(doc_id):
    # Receiver opens this URL in any phone browser; no WS App installation is required.
    snap = db.collection('sosAlerts').document(doc_id).get()
    if not snap.exists:
        return '<h2>WS App SOS not found</h2>', 404
    data = snap.to_dict() or {}
    name = escape(str(data.get('fullName') or 'WS App User'))
    html = f'''<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>WS App Emergency Location</title>
<style>body{{font-family:Arial,sans-serif;margin:0;padding:20px;background:#1A0310;color:#fff}}.card{{max-width:640px;margin:auto;background:#2a0a1a;border-radius:18px;padding:22px}}h1{{font-size:22px}}.status{{font-weight:700}}a{{display:block;margin-top:16px;padding:14px;border-radius:12px;background:#C9A84C;color:#1A0310;text-decoration:none;font-weight:700;text-align:center}}</style></head>
<body><div class="card"><h1>🚨 WS App Emergency Alert</h1><p><b>Person:</b> {name}</p><p class="status" id="status">Loading live location...</p><p id="coords">Please wait...</p><p id="police"></p><a id="map" href="#" target="_blank" style="display:none">📍 Open Location in Google Maps</a></div>
<script>
const id={doc_id!r};
async function refresh(){{try{{const r=await fetch('/api/sos/'+encodeURIComponent(id)+'/live-data',{{cache:'no-store'}});const d=await r.json();if(!d.success)throw new Error(d.message||'Unable to load');document.getElementById('status').textContent='Status: '+d.status;if(d.latitude!=null&&d.longitude!=null)document.getElementById('coords').textContent='📍 '+Number(d.latitude).toFixed(6)+', '+Number(d.longitude).toFixed(6)+(d.accuracy!=null?' • ±'+Math.round(d.accuracy)+' m':'');else document.getElementById('coords').textContent='📍 Waiting for GPS location...';document.getElementById('police').textContent=d.policeStation?('🚔 '+d.policeStation+(d.policeAddress?' — '+d.policeAddress:'')):'';const map=document.getElementById('map');if(d.mapsUrl){{map.href=d.mapsUrl;map.style.display='block';}}if(String(d.status).toLowerCase()==='resolved'){{document.getElementById('status').textContent='✅ SOS resolved — SAFE';clearInterval(timer);}}}}catch(e){{document.getElementById('status').textContent='Unable to refresh live location right now.';}}}}
refresh();const timer=setInterval(refresh,3000);
</script></body></html>'''
    return html, 200, {'Content-Type':'text/html; charset=utf-8'}


@app.patch('/api/sos/<doc_id>/resolve')
def resolve_user_sos(doc_id):
    try:
        db.collection('sosAlerts').document(doc_id).set({
            'status': 'resolved',
            'resolvedAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return jsonify({'success': True, 'status': 'resolved'})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to resolve SOS alert.', 'error': str(e)}), 500


@app.get('/api/police/nearest')
def nearest_police():
    try:
        lat = float(request.args.get('lat'))
        lon = float(request.args.get('lon'))
    except Exception:
        return jsonify({'success': False, 'message': 'Valid latitude and longitude are required.'}), 400

    try:
        query = f'[out:json][timeout:12];nwr["amenity"="police"](around:15000,{lat},{lon});out center tags;'
        response = requests.post(
            'https://overpass-api.de/api/interpreter',
            data=query,
            headers={'User-Agent': 'WSApp/1.0'},
            timeout=15,
        )
        response.raise_for_status()
        elements = response.json().get('elements', [])

        best = None
        for item in elements:
            center = item.get('center') or {}
            p_lat = item.get('lat', center.get('lat'))
            p_lon = item.get('lon', center.get('lon'))
            if p_lat is None or p_lon is None:
                continue
            distance = haversine_km(lat, lon, float(p_lat), float(p_lon))
            tags = item.get('tags') or {}
            name = tags.get('name') or tags.get('name:en') or 'Police Station'
            address_parts = [tags.get(k) for k in ('addr:housenumber', 'addr:street', 'addr:suburb', 'addr:city') if tags.get(k)]
            candidate = {
                'name': name,
                'address': ', '.join(address_parts) or 'Nearby police station',
                'latitude': float(p_lat),
                'longitude': float(p_lon),
                'distanceKm': round(distance, 2),
                'mapsUrl': f'https://www.google.com/maps/search/?api=1&query={float(p_lat)},{float(p_lon)}',
            }
            if best is None or candidate['distanceKm'] < best['distanceKm']:
                best = candidate

        if best:
            return jsonify({'success': True, 'police': best})
        return jsonify({'success': False, 'message': 'No nearby police station found.'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to find nearby police station.', 'error': str(e)}), 502


# ---------------- ADMIN DATA ----------------
@app.get('/api/admin/users')
def admin_users():
    try:
        rows = []
        for doc in db.collection('users').stream():
            d = serialize(doc.to_dict() or {})
            try:
                fu = auth.get_user(doc.id)
                disabled = fu.disabled
            except Exception:
                disabled = d.get('status') == 'blocked'
            rows.append({'uid': d.get('uid', doc.id), 'fullName': d.get('fullName',''), 'phone': d.get('phone',''), 'email': d.get('email',''), 'createdAt': d.get('createdAt'), 'status': 'blocked' if disabled else 'active'})
        rows.sort(key=lambda x: str(x.get('createdAt') or ''), reverse=True)
        return jsonify({'success': True, 'count': len(rows), 'users': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load users.', 'error': str(e)}), 500


@app.patch('/api/admin/users/<uid>/status')
def admin_user_status(uid):
    try:
        data = request.get_json(silent=True) or {}
        blocked = bool(data.get('blocked'))
        auth.update_user(uid, disabled=blocked)
        db.collection('users').document(uid).set({'status': 'blocked' if blocked else 'active', 'statusUpdatedAt': firestore.SERVER_TIMESTAMP}, merge=True)
        return jsonify({'success': True, 'status': 'blocked' if blocked else 'active'})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to update user status.', 'error': str(e)}), 500


def status_counts(rows):
    counts = {}
    for x in rows:
        k = str(x.get('status') or 'pending').lower().replace('-', '_').replace(' ', '_')
        counts[k] = counts.get(k,0)+1
    return counts


@app.get('/api/admin/sos')
def admin_sos():
    try:
        rows = collection_records('sosAlerts')
        pending = sum(str(x.get('status','pending')).lower() in {'pending','active','critical','open'} for x in rows)
        today = now_utc().date()
        resolved_today = sum(str(x.get('status','')).lower() == 'resolved' and str(x.get('resolvedAt') or x.get('updatedAt') or '').startswith(today.isoformat()) for x in rows)
        month_prefix = today.strftime('%Y-%m')
        month_total = sum(str(x.get('createdAt') or '').startswith(month_prefix) for x in rows)
        return jsonify({'success': True, 'alerts': rows, 'pending': pending, 'resolvedToday': resolved_today, 'monthTotal': month_total})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load SOS alerts.', 'error': str(e)}), 500


@app.patch('/api/admin/sos/<doc_id>/status')
def admin_sos_status(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        status = str(data.get('status','')).strip().lower()
        if status not in {'pending','active','resolved','cancelled'}:
            return jsonify({'success': False, 'message': 'Invalid SOS status.'}), 400
        payload = {'status': status, 'updatedAt': firestore.SERVER_TIMESTAMP}
        if status == 'resolved': payload['resolvedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('sosAlerts').document(doc_id).set(payload, merge=True)
        return jsonify({'success': True, 'status': status})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to update SOS alert.', 'error': str(e)}), 500


@app.get('/api/admin/complaints')
def admin_complaints():
    try:
        rows = collection_records('complaints')
        counts = status_counts(rows)
        resolved = counts.get('resolved',0)
        pending = counts.get('pending',0) + counts.get('new',0) + counts.get('open',0)
        return jsonify({'success': True, 'complaints': rows, 'total': len(rows), 'resolved': resolved, 'pending': pending})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load complaints.', 'error': str(e)}), 500


@app.patch('/api/admin/complaints/<doc_id>/status')
def admin_complaint_status(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        status = str(data.get('status','')).strip().lower()
        if status not in {'pending','under_review','resolved','rejected'}:
            return jsonify({'success': False, 'message': 'Invalid complaint status.'}), 400
        payload = {'status': status, 'updatedAt': firestore.SERVER_TIMESTAMP}
        if status == 'resolved': payload['resolvedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('complaints').document(doc_id).set(payload, merge=True)
        return jsonify({'success': True, 'status': status})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to update complaint.', 'error': str(e)}), 500


@app.get('/api/admin/chat')
def admin_chat():
    try:
        rows = collection_records('chatSessions')
        today_prefix = now_utc().date().isoformat()
        today = sum(str(x.get('createdAt') or '').startswith(today_prefix) for x in rows)
        return jsonify({'success': True, 'sessions': rows, 'total': len(rows), 'today': today})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load chat sessions.', 'error': str(e)}), 500


@app.get('/api/admin/announcements')
def admin_announcements():
    try:
        return jsonify({'success': True, 'announcements': collection_records('announcements')})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load announcements.', 'error': str(e)}), 500


@app.post('/api/admin/announcements')
def create_announcement():
    try:
        data = request.get_json(silent=True) or {}
        title = str(data.get('title','')).strip(); description = str(data.get('description','')).strip()
        if not title or not description: return jsonify({'success': False, 'message': 'Title and description are required.'}), 400
        ref = db.collection('announcements').document()
        ref.set({'title': title, 'description': description, 'icon': str(data.get('icon','📢')), 'date': data.get('date') or '', 'createdAt': firestore.SERVER_TIMESTAMP, 'updatedAt': firestore.SERVER_TIMESTAMP, 'active': True})
        return jsonify({'success': True, 'id': ref.id})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to create announcement.', 'error': str(e)}), 500


@app.delete('/api/admin/announcements/<doc_id>')
def delete_announcement(doc_id):
    try:
        db.collection('announcements').document(doc_id).delete()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to delete announcement.', 'error': str(e)}), 500


@app.get('/api/admin/helplines')
def admin_helplines():
    try:
        rows = collection_records('helplines')
        rows.sort(key=lambda x: (not bool(x.get('active', True)), str(x.get('name','')).lower()))
        return jsonify({'success': True, 'helplines': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load helplines.', 'error': str(e)}), 500


@app.post('/api/admin/helplines')
def create_helpline():
    try:
        data = request.get_json(silent=True) or {}
        name = str(data.get('name','')).strip(); number = str(data.get('number','')).strip()
        if not name or not number: return jsonify({'success': False, 'message': 'Name and number are required.'}), 400
        ref = db.collection('helplines').document()
        ref.set({'name': name, 'number': number, 'category': str(data.get('category','Support')), 'icon': str(data.get('icon','📞')), 'active': bool(data.get('active',True)), 'createdAt': firestore.SERVER_TIMESTAMP, 'updatedAt': firestore.SERVER_TIMESTAMP})
        return jsonify({'success': True, 'id': ref.id})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to create helpline.', 'error': str(e)}), 500


@app.patch('/api/admin/helplines/<doc_id>')
def update_helpline(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        allowed = {k: data[k] for k in ('name','number','category','icon','active') if k in data}
        allowed['updatedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('helplines').document(doc_id).set(allowed, merge=True)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to update helpline.', 'error': str(e)}), 500


@app.get('/api/admin/settings')
def admin_settings():
    try:
        settings = admin_settings_snapshot()
        settings.pop('adminPassword', None)
        settings.pop('password', None)
        return jsonify({'success': True, 'settings': serialize(settings)})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to load settings.', 'error': str(e)}), 500


@app.put('/api/admin/settings')
def save_admin_settings():
    try:
        data = request.get_json(silent=True) or {}
        settings_ref = db.collection('settings').document('admin')
        settings = admin_settings_snapshot()
        admin_uid = settings.get('adminUid')
        if not admin_uid or request.admin_uid != admin_uid:
            return jsonify({'success': False, 'message': 'Admin session is not authorized.'}), 403

        new_admin_id = str(data.get('adminId', settings.get('adminId', DEFAULT_ADMIN_ID))).strip()
        admin_name = str(data.get('adminName', settings.get('adminName', 'Admin'))).strip()
        phone = str(data.get('phone', settings.get('phone', new_admin_id))).strip()
        new_email = str(data.get('email', settings.get('email', DEFAULT_ADMIN_EMAIL))).strip().lower()
        app_version = str(data.get('appVersion', settings.get('appVersion', 'v1.0.0'))).strip()
        current_password = str(data.get('currentPassword', ''))
        new_password = str(data.get('newPassword', ''))
        confirm_password = str(data.get('confirmPassword', ''))

        old_admin_id = str(settings.get('adminId', DEFAULT_ADMIN_ID)).strip()
        old_email = str(settings.get('email', DEFAULT_ADMIN_EMAIL)).strip().lower()
        credential_change = (new_admin_id != old_admin_id) or (new_email != old_email) or bool(new_password)

        if credential_change:
            if not current_password:
                return jsonify({'success': False, 'message': 'Enter the current password to change login credentials.'}), 400
            if new_password and len(new_password) < 6:
                return jsonify({'success': False, 'message': 'New password must contain at least 6 characters.'}), 400
            if new_password and new_password != confirm_password:
                return jsonify({'success': False, 'message': 'New password and confirm password do not match.'}), 400
            code, result = firebase_password_signin(old_email, current_password)
            if code != 200:
                return jsonify({'success': False, 'message': 'Current password is incorrect.'}), 401

        try:
            auth_update = {}
            if new_email != old_email:
                auth_update['email'] = new_email
            if new_password:
                auth_update['password'] = new_password
            if admin_name:
                auth_update['display_name'] = admin_name
            if auth_update:
                auth.update_user(admin_uid, **auth_update)
        except Exception as e:
            msg = str(e)
            if 'EMAIL_EXISTS' in msg or 'already exists' in msg.lower():
                return jsonify({'success': False, 'message': 'That admin email is already in use.'}), 409
            raise

        settings_ref.set({
            'adminUid': admin_uid,
            'adminId': new_admin_id,
            'adminName': admin_name or 'Admin',
            'phone': phone,
            'email': new_email,
            'appVersion': app_version or 'v1.0.0',
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return jsonify({'success': True, 'message': 'Admin account updated successfully. Please sign in again.'})
    except requests.RequestException:
        return jsonify({'success': False, 'message': 'Unable to reach Firebase login service.'}), 503
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to save admin settings.', 'error': str(e)}), 500


@app.get('/api/admin/dashboard')
def admin_dashboard():
    try:
        users = list(db.collection('users').stream())
        sos = collection_records('sosAlerts')
        complaints = collection_records('complaints')
        chats = collection_records('chatSessions')
        total_users = len(users)
        active_sos = sum(str(x.get('status','pending')).lower() in {'pending','active','critical','open'} for x in sos)
        ccounts = status_counts(complaints)
        resolved = ccounts.get('resolved',0)
        pending = ccounts.get('pending',0)+ccounts.get('new',0)+ccounts.get('open',0)
        days=[]
        today=now_utc().date()
        for delta in range(6,-1,-1):
            day=today-timedelta(days=delta)
            prefix=day.isoformat()
            days.append({'label':day.strftime('%a'),'count':sum(str(x.get('createdAt') or '').startswith(prefix) for x in sos)})
        activity=[]
        for x in collection_records('users')[:5]: activity.append({'type':'user','title':x.get('fullName') or 'User','message':'registered an account','createdAt':x.get('createdAt')})
        for x in sos[:5]: activity.append({'type':'sos','title':x.get('fullName') or x.get('userName') or 'User','message':'triggered an SOS alert','createdAt':x.get('createdAt')})
        for x in complaints[:5]: activity.append({'type':'complaint','title':x.get('fullName') or x.get('userName') or 'User','message':'submitted a complaint','createdAt':x.get('createdAt')})
        for x in chats[:5]: activity.append({'type':'chat','title':x.get('fullName') or x.get('userName') or 'User','message':'started a support chat session','createdAt':x.get('createdAt')})
        activity.sort(key=lambda x:str(x.get('createdAt') or ''), reverse=True)
        return jsonify({'success':True,'totalUsers':total_users,'activeSos':active_sos,'totalComplaints':len(complaints),'resolvedComplaints':resolved,'pendingComplaints':pending,'chatSessions':len(chats),'sosLast7Days':days,'recentActivity':activity[:8]})
    except Exception as e:
        return jsonify({'success':False,'message':'Unable to load dashboard.','error':str(e)}),500


# ---------------- REAL SMS OTP (MSG91 Widget) ----------------
def normalize_phone(phone: str) -> str:
    """Return a phone number in E.164 format for India when no country code is supplied."""
    value = str(phone or '').strip()
    value = value.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')

    if value.startswith('00'):
        value = '+' + value[2:]
    elif value.startswith('+'):
        pass
    elif value.isdigit() and len(value) == 10:
        value = '+91' + value
    elif value.startswith('0') and value[1:].isdigit() and len(value) == 11:
        value = '+91' + value[1:]
    else:
        value = '+' + value

    return value


def msg91_configured() -> bool:
    """Check that the server-side MSG91 AuthKey is available."""
    return bool(os.getenv('MSG91_AUTHKEY'))


def extract_verified_identifier(payload):
    """Best-effort extraction of the identifier returned by MSG91 token verification."""
    if isinstance(payload, dict):
        for key in ('identifier', 'mobile', 'phone', 'number', 'email'):
            value = payload.get(key)
            if isinstance(value, (str, int)) and str(value).strip():
                return str(value).strip()
        for value in payload.values():
            found = extract_verified_identifier(value)
            if found:
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = extract_verified_identifier(value)
            if found:
                return found
    return ''


def identifiers_match(expected_phone: str, verified_identifier: str) -> bool:
    """Compare phone identifiers after normalization; return True when MSG91 did not expose one."""
    if not verified_identifier:
        return True

    expected = ''.join(ch for ch in expected_phone if ch.isdigit())
    actual = ''.join(ch for ch in verified_identifier if ch.isdigit())

    if len(actual) == 10:
        actual = '91' + actual
    if len(expected) == 10:
        expected = '91' + expected

    return expected == actual


@app.post('/api/otp/verify-access-token')
def verify_msg91_access_token():
    """
    Verify the JWT/access-token produced by the MSG91 OTP Widget.

    The MSG91 widget performs the actual OTP send/verify on the mobile client.
    The server then verifies the returned access-token using the account/server AuthKey.
    """
    try:
        data = request.get_json(silent=True) or {}
        access_token = str(data.get('accessToken') or data.get('access-token') or '').strip()
        phone = normalize_phone(data.get('phone'))
        uid = str(data.get('uid') or '').strip()

        if not access_token:
            return jsonify({'success': False, 'message': 'MSG91 access token is required.'}), 400
        if not phone or len(''.join(ch for ch in phone if ch.isdigit())) < 10:
            return jsonify({'success': False, 'message': 'Enter a valid phone number.'}), 400
        if not msg91_configured():
            return jsonify({'success': False, 'message': 'MSG91 is not configured. Add MSG91_AUTHKEY to backend/.env.'}), 503

        authkey = os.getenv('MSG91_AUTHKEY')
        response = requests.post(
            'https://control.msg91.com/api/v5/widget/verifyAccessToken',
            headers={'Content-Type': 'application/json'},
            json={
                'authkey': authkey,
                'access-token': access_token,
            },
            timeout=20,
        )

        try:
            result = response.json()
        except Exception:
            result = {}

        if not response.ok:
            message = result.get('message') or result.get('error') or 'MSG91 access token verification failed.'
            return jsonify({'success': False, 'message': message}), response.status_code

        verified_identifier = extract_verified_identifier(result)
        if not identifiers_match(phone, verified_identifier):
            return jsonify({
                'success': False,
                'message': 'The verified phone number does not match the registered phone number.'
            }), 400

        if uid:
            db.collection('users').document(uid).set({
                'phoneVerified': True,
                'phoneVerifiedAt': firestore.SERVER_TIMESTAMP,
                'phone': phone,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }, merge=True)

        return jsonify({
            'success': True,
            'verified': True,
            'phone': phone,
            'msg91': result,
        }), 200

    except requests.RequestException:
        return jsonify({'success': False, 'message': 'Unable to reach MSG91 verification service.'}), 503
    except Exception as e:
        return jsonify({'success': False, 'message': 'Unable to verify MSG91 OTP.', 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
