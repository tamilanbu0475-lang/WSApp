import os
import glob
from datetime import datetime, timezone, timedelta

import requests
import re

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore, auth

from auth import create_user


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(os.path.join(BASE_DIR, ".env"))

configured_file = os.getenv("FIREBASE_SERVICE_ACCOUNT")

firebase_json = None

if configured_file:
    p = os.path.join(BASE_DIR, configured_file)
    if os.path.isfile(p):
        firebase_json = p

if firebase_json is None:
    possible = glob.glob(os.path.join(BASE_DIR, "*firebase-adminsdk*.json"))
    if len(possible) == 1:
        firebase_json = possible[0]
    elif len(possible) > 1:
        raise RuntimeError("Multiple Firebase service account JSON files were found.")

if firebase_json is None:
    raise FileNotFoundError(
        "Firebase service account JSON file was not found inside backend folder."
    )

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(firebase_json))

db = firestore.client()

app = Flask(__name__)
CORS(app)

DEFAULT_ADMIN_ID = "9999999999"
DEFAULT_ADMIN_EMAIL = "admin@wsapp.com"
DEFAULT_ADMIN_PASSWORD = "admin@ws2025"


def admin_settings_snapshot():
    snap = db.collection("settings").document("admin").get()
    return (snap.to_dict() or {}) if snap.exists else {}


def firebase_password_signin(email, password):
    key = os.getenv("FIREBASE_WEB_API_KEY")
    if not key:
        raise RuntimeError("FIREBASE_WEB_API_KEY is missing in backend/.env")

    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={key}",
        json={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        },
        timeout=15,
    )

    try:
        result = r.json()
    except Exception:
        result = {}

    return r.status_code, result


@app.before_request
def protect_admin_routes():
    if not request.path.startswith("/api/admin/"):
        return None

    if request.path == "/api/admin/login" or request.method == "OPTIONS":
        return None

    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return jsonify(
            {"success": False, "message": "Admin authentication required."}
        ), 401

    token = header.split(" ", 1)[1].strip()

    if not token:
        return jsonify(
            {"success": False, "message": "Admin authentication required."}
        ), 401

    try:
        decoded = auth.verify_id_token(token)
        settings = admin_settings_snapshot()

        if not settings.get("adminUid") or decoded.get("uid") != settings.get("adminUid"):
            return jsonify(
                {"success": False, "message": "Not authorized for admin access."}
            ), 403

        request.admin_uid = decoded.get("uid")
    except Exception:
        return jsonify(
            {"success": False, "message": "Invalid or expired admin session."}
        ), 401

    return None


@app.post("/api/admin/login")
def admin_login():
    try:
        data = request.get_json(silent=True) or {}

        admin_id = str(data.get("adminId", "")).strip()
        password = str(data.get("password", ""))

        if not admin_id or not password:
            return jsonify(
                {
                    "success": False,
                    "message": "Admin ID and password are required.",
                }
            ), 400

        settings_ref = db.collection("settings").document("admin")
        settings = admin_settings_snapshot()

        # One-time bootstrap with the original project credentials.
        if not settings.get("adminUid"):
            if admin_id != DEFAULT_ADMIN_ID or password != DEFAULT_ADMIN_PASSWORD:
                return jsonify(
                    {"success": False, "message": "Invalid admin ID or password."}
                ), 401

            email = settings.get("email") or DEFAULT_ADMIN_EMAIL

            try:
                admin_user = auth.get_user_by_email(email)
            except Exception:
                admin_user = auth.create_user(
                    email=email,
                    password=password,
                    display_name=settings.get("adminName") or "Admin",
                    disabled=False,
                )

            settings_ref.set(
                {
                    "adminUid": admin_user.uid,
                    "adminId": DEFAULT_ADMIN_ID,
                    "adminName": settings.get("adminName") or "Admin",
                    "phone": settings.get("phone") or DEFAULT_ADMIN_ID,
                    "email": email,
                    "appVersion": settings.get("appVersion") or "v1.0.0",
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )

            settings = admin_settings_snapshot()

        expected_id = str(settings.get("adminId", "")).strip()
        email = str(settings.get("email") or DEFAULT_ADMIN_EMAIL).strip().lower()

        if admin_id != expected_id:
            return jsonify(
                {"success": False, "message": "Invalid admin ID or password."}
            ), 401

        code, result = firebase_password_signin(email, password)

        # Recovery for the original bootstrap credentials.
        if code != 200 and admin_id == DEFAULT_ADMIN_ID and password == DEFAULT_ADMIN_PASSWORD:
            try:
                admin_user = auth.get_user(settings.get("adminUid"))

                if admin_user.disabled:
                    auth.update_user(
                        admin_user.uid,
                        disabled=False,
                        password=DEFAULT_ADMIN_PASSWORD,
                    )
                else:
                    auth.update_user(
                        admin_user.uid,
                        password=DEFAULT_ADMIN_PASSWORD,
                    )

                code, result = firebase_password_signin(
                    email,
                    DEFAULT_ADMIN_PASSWORD,
                )
            except Exception:
                pass

        if code != 200:
            err = (result.get("error") or {}).get("message", "")

            if err in {
                "INVALID_PASSWORD",
                "EMAIL_NOT_FOUND",
                "INVALID_LOGIN_CREDENTIALS",
                "USER_DISABLED",
            }:
                return jsonify(
                    {"success": False, "message": "Invalid admin ID or password."}
                ), 401

            return jsonify(
                {
                    "success": False,
                    "message": "Admin login failed.",
                    "error": err or "Unknown Firebase error",
                }
            ), 401

        return jsonify(
            {
                "success": True,
                "message": "Admin login successful.",
                "token": result.get("idToken"),
                "refreshToken": result.get("refreshToken"),
                "expiresIn": result.get("expiresIn"),
                "admin": {
                    "uid": settings.get("adminUid"),
                    "adminId": settings.get("adminId"),
                    "adminName": settings.get("adminName") or "Admin",
                    "email": email,
                },
            }
        ), 200

    except requests.RequestException:
        return jsonify(
            {
                "success": False,
                "message": "Unable to reach Firebase login service.",
            }
        ), 503

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to login as admin.",
                "error": str(e),
            }
        ), 500


@app.post("/api/admin/logout")
def admin_logout():
    return jsonify(
        {"success": True, "message": "Admin session ended."}
    )


def serialize(value):
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items()}

    if isinstance(value, list):
        return [serialize(v) for v in value]

    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass

    return value


def collection_records(name):
    rows = []

    for doc in db.collection(name).stream():
        data = serialize(doc.to_dict() or {})
        data["id"] = doc.id
        rows.append(data)

    rows.sort(
        key=lambda x: str(
            x.get("createdAt")
            or x.get("updatedAt")
            or x.get("date")
            or ""
        ),
        reverse=True,
    )

    return rows


def now_utc():
    return datetime.now(timezone.utc)


@app.get("/")
def home():
    return jsonify(
        {
            "success": True,
            "message": "WS App Backend is Running",
            "firebase": "Connected",
        }
    )


@app.get("/api/health")
def health():
    return jsonify(
        {
            "success": True,
            "message": "Backend connection is working",
        }
    )


@app.get("/api/firebase-health")
def firebase_health():
    try:
        db.collection("_system").document("health").get()

        return jsonify(
            {
                "success": True,
                "message": "Firebase Firestore connection is working",
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Firebase Firestore connection failed",
                "error": str(e),
            }
        ), 500


def build_wsapp_email_html(full_name: str, verification_link: str) -> str:
    safe_name = (full_name or "there").strip()

    return f"""<!doctype html>
<html>
<body style="margin:0;background:#f8f3f5;font-family:Arial,Helvetica,sans-serif;color:#24131b;">
  <div style="max-width:620px;margin:30px auto;padding:0 16px;">
    <div style="background:#1A0310;border-radius:24px 24px 0 0;padding:28px 30px;text-align:center;">
      <div style="display:inline-block;border:1px solid #C9A84C;border-radius:12px;padding:10px 14px;color:#C9A84C;font-weight:800;letter-spacing:2px;">WS</div>
      <h1 style="margin:18px 0 6px;color:#fff;font-size:28px;">Welcome to WS App</h1>
      <p style="margin:0;color:#d8c7ce;font-size:14px;">Women Safety • Always With You</p>
    </div>

    <div style="background:#fff;padding:34px 30px;border-radius:0 0 24px 24px;">
      <h2 style="margin:0 0 14px;font-size:22px;">Hello {safe_name},</h2>

      <p style="font-size:15px;line-height:1.7;margin:0 0 18px;">
        Your WS App account is almost ready. Please verify your email address to activate secure account access.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="{verification_link}"
           style="display:inline-block;background:#C9A84C;color:#1A0310;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:12px;">
          Verify My Email
        </a>
      </div>

      <p style="font-size:13px;line-height:1.6;color:#6f6067;margin:0 0 12px;">
        After verification, you can continue to use WS App's safety tools, emergency support and women-safety resources.
      </p>

      <div style="margin-top:24px;padding:16px;background:#fbf7f8;border-left:3px solid #C9A84C;border-radius:10px;font-size:12px;color:#6f6067;">
        This verification link is intended only for the WS App account you just created.
      </div>

      <p style="font-size:13px;line-height:1.6;margin:24px 0 0;">
        Stay safe,<br><strong>WS App Team</strong>
      </p>
    </div>

    <p style="text-align:center;color:#8a7a82;font-size:11px;margin:14px 0;">
      © 2026 WS App · Women Safety Application
    </p>
  </div>
</body>
</html>"""


def send_brevo_email(to_email, to_name, subject, text_content, html_content=None):
    brevo_key = os.getenv("BREVO_API_KEY", "").strip()
    from_email = (
        os.getenv("BREVO_FROM_EMAIL")
        or os.getenv("SMTP_USER")
        or ""
    ).strip().lower()
    from_name = (
        os.getenv("BREVO_FROM_NAME")
        or os.getenv("SMTP_FROM_NAME")
        or "WS App"
    ).strip() or "WS App"

    if not brevo_key or not from_email or not to_email:
        return False

    payload = {
        "sender": {"name": from_name, "email": from_email},
        "to": [{"email": to_email, "name": to_name or "WS App User"}],
        "subject": subject,
        "htmlContent": html_content or "<pre style='font-family:Arial,sans-serif;white-space:pre-wrap'>" + text_content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") + "</pre>",
        "textContent": text_content,
    }

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept": "application/json",
                "api-key": brevo_key,
                "content-type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        return bool(response.ok)
    except Exception:
        return False


def send_verification_welcome_email(
    to_email: str,
    full_name: str,
    verification_link: str,
) -> bool:
    """
    Send the verification/welcome email through Brevo's Transactional Email API.

    Brevo credentials are read only from environment variables.
    No API key is stored in the source code.
    """
    brevo_key = os.getenv("BREVO_API_KEY", "").strip()

    if not brevo_key:
        raise RuntimeError("BREVO_API_KEY is missing in Render/backend environment.")

    from_email = (
        os.getenv("BREVO_FROM_EMAIL")
        or os.getenv("SMTP_USER")
        or "tamil.anbu0475@gmail.com"
    ).strip()

    from_name = (
        os.getenv("BREVO_FROM_NAME")
        or os.getenv("SMTP_FROM_NAME")
        or "WS App"
    ).strip() or "WS App"

    if not from_email:
        raise RuntimeError("BREVO_FROM_EMAIL/SMTP_USER is missing.")

    text_content = (
        f"Hello {full_name or 'there'},\n\n"
        "Welcome to WS App — Women Safety Application.\n\n"
        "Please verify your email address to activate your account:\n"
        f"{verification_link}\n\n"
        "Stay safe,\nWS App Team"
    )

    payload = {
        "sender": {
            "name": from_name,
            "email": from_email,
        },
        "to": [
            {
                "email": to_email,
                "name": full_name or "WS App User",
            }
        ],
        "subject": "Welcome to WS App — Verify Your Email",
        "htmlContent": build_wsapp_email_html(
            full_name,
            verification_link,
        ),
        "textContent": text_content,
    }

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": brevo_key,
            "content-type": "application/json",
        },
        json=payload,
        timeout=20,
    )

    try:
        result = response.json()
    except Exception:
        result = {}

    if not response.ok:
        message = (
            result.get("message")
            or result.get("code")
            or response.text[:300]
            or "Unknown Brevo error"
        )
        raise RuntimeError(
            f"Brevo email send failed ({response.status_code}): {message}"
        )

    return True


@app.post("/api/register")
def register():
    try:
        data = request.get_json(silent=True) or {}

        full_name = str(data.get("fullName", "")).strip()
        phone = str(data.get("phone", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not full_name:
            return jsonify(
                {"success": False, "message": "Full name is required."}
            ), 400

        if not phone:
            return jsonify(
                {"success": False, "message": "Phone number is required."}
            ), 400

        if not email:
            return jsonify(
                {"success": False, "message": "Email is required."}
            ), 400

        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            return jsonify(
                {
                    "success": False,
                    "message": "Enter a valid email address.",
                }
            ), 400

        if not password:
            return jsonify(
                {"success": False, "message": "Password is required."}
            ), 400

        user = create_user(
            email=email,
            password=password,
            full_name=full_name,
            phone=phone,
        )

        try:
            verification_link = auth.generate_email_verification_link(email)

            send_verification_welcome_email(
                email,
                full_name,
                verification_link,
            )

            db.collection("users").document(user.uid).set(
                {
                    "emailVerified": False,
                    "welcomeEmailSentAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )

        except Exception:
            try:
                auth.delete_user(user.uid)
            except Exception:
                pass

            try:
                db.collection("users").document(user.uid).delete()
            except Exception:
                pass

            raise

        return jsonify(
            {
                "success": True,
                "message": (
                    "Account created. Welcome email sent. Verify your email, "
                    "then complete phone OTP."
                ),
                "emailVerificationSent": True,
                "user": {
                    "uid": user.uid,
                    "email": user.email,
                    "fullName": user.display_name,
                    "phone": phone,
                },
            }
        ), 201

    except ValueError as e:
        return jsonify(
            {"success": False, "message": str(e)}
        ), 400

    except Exception as e:
        msg = str(e)

        if "EMAIL_EXISTS" in msg or "already exists" in msg.lower():
            return jsonify(
                {
                    "success": False,
                    "message": "This email is already registered.",
                }
            ), 409

        return jsonify(
            {
                "success": False,
                "message": str(e) or "Unable to create account.",
            }
        ), 500


@app.post("/api/login")
def login():
    try:
        data = request.get_json(silent=True) or {}

        phone = str(data.get("phone", "")).strip()
        password = str(data.get("password", ""))

        if not re.fullmatch(r"\d{10}", phone):
            return jsonify(
                {
                    "success": False,
                    "message": "Enter a valid 10-digit mobile number.",
                }
            ), 400

        if not password:
            return jsonify(
                {
                    "success": False,
                    "message": "Password is required.",
                }
            ), 400

        key = os.getenv("FIREBASE_WEB_API_KEY")

        if not key:
            return jsonify(
                {
                    "success": False,
                    "message": "FIREBASE_WEB_API_KEY is missing in backend/.env",
                }
            ), 500

        docs = (
            db.collection("users")
            .where("phone", "==", phone)
            .limit(1)
            .stream()
        )

        doc = next(docs, None)

        if doc is None:
            return jsonify(
                {
                    "success": False,
                    "message": "Invalid phone number or password.",
                }
            ), 401

        user_data = doc.to_dict() or {}

        email = str(user_data.get("email", "")).strip().lower()

        if not email:
            return jsonify(
                {
                    "success": False,
                    "message": "User email was not found.",
                }
            ), 500

        r = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={key}",
            json={
                "email": email,
                "password": password,
                "returnSecureToken": True,
            },
            timeout=15,
        )

        try:
            result = r.json()
        except Exception:
            result = {}

        if r.status_code != 200:
            err = result.get("error", {}).get("message", "")

            if err in {
                "INVALID_PASSWORD",
                "EMAIL_NOT_FOUND",
                "INVALID_LOGIN_CREDENTIALS",
                "USER_DISABLED",
            }:
                return jsonify(
                    {
                        "success": False,
                        "message": "Invalid phone number or password.",
                    }
                ), 401

            return jsonify(
                {
                    "success": False,
                    "message": "Login failed.",
                    "error": err or "Unknown Firebase error",
                }
            ), 401

        fu = auth.get_user(result.get("localId"))

        if not fu.email_verified:
            return jsonify(
                {
                    "success": False,
                    "message": "Please verify your email address before signing in.",
                    "emailVerified": False,
                }
            ), 403

        # Welcome + verification is sent once at registration.
        return jsonify(
            {
                "success": True,
                "message": "Login successful.",
                "token": result.get("idToken"),
                "refreshToken": result.get("refreshToken"),
                "expiresIn": result.get("expiresIn"),
                "welcomeEmailSent": False,
                "user": {
                    "uid": fu.uid,
                    "email": fu.email,
                    "fullName": user_data.get("fullName", ""),
                    "phone": user_data.get("phone", phone),
                },
            }
        )

    except requests.RequestException:
        return jsonify(
            {
                "success": False,
                "message": "Unable to reach Firebase login service.",
            }
        ), 503

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to login.",
                "error": str(e),
            }
        ), 500


@app.post("/api/forgot-password")
def forgot_password():
    """Send a Firebase password-reset link to the email registered for a phone number."""
    try:
        data = request.get_json(silent=True) or {}
        phone = re.sub(r"\D", "", str(data.get("phone", "")))[:10]

        if not re.fullmatch(r"\d{10}", phone):
            return jsonify({
                "success": False,
                "message": "Enter a valid 10-digit mobile number.",
            }), 400

        docs = (
            db.collection("users")
            .where("phone", "==", phone)
            .limit(1)
            .stream()
        )
        doc = next(docs, None)

        # Do not reveal whether a phone number is registered.
        generic_message = (
            "If an account is registered with this number, a password-reset email "
            "has been sent to its registered email address."
        )

        if doc is None:
            return jsonify({"success": True, "message": generic_message}), 200

        user_data = doc.to_dict() or {}
        email = str(user_data.get("email", "")).strip().lower()
        if not email:
            return jsonify({"success": True, "message": generic_message}), 200

        reset_link = auth.generate_password_reset_link(email)
        safe_name = str(user_data.get("fullName", "WS App User")).strip() or "WS App User"

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;background:#fdf8f9;color:#24101c;border-radius:18px;">
          <h2 style="color:#5C0A2D;margin-top:0;">WS App — Reset Your Password</h2>
          <p>Hello {safe_name},</p>
          <p>We received a request to reset your WS App password.</p>
          <p style="margin:24px 0;">
            <a href="{reset_link}" style="display:inline-block;padding:13px 20px;background:#C9A84C;color:#1A0310;text-decoration:none;border-radius:10px;font-weight:800;">Reset Password</a>
          </p>
          <p style="font-size:12px;color:#6f6269;line-height:1.6;">For your security, this link is intended only for your WS App account. If you did not request this, you can ignore this email.</p>
          <p>Stay safe,<br><strong>WS App Team</strong></p>
        </div>
        """
        text = (
            "WS App — Reset Your Password\n\n"
            f"Hello {safe_name},\n\n"
            "We received a request to reset your WS App password.\n\n"
            f"Reset your password here:\n{reset_link}\n\n"
            "If you did not request this, you can ignore this email.\n\n"
            "WS App Team"
        )

        email_sent = send_brevo_email(
            email,
            safe_name,
            "WS App — Reset Your Password",
            text,
            html,
        )

        if not email_sent:
            return jsonify({
                "success": False,
                "message": "Password reset email could not be sent right now. Please try again later.",
            }), 503

        return jsonify({"success": True, "message": generic_message}), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to process password recovery right now.",
            "error": str(e),
        }), 500


# ---------------- USER ACCOUNT SOFT-DELETE ----------------

def require_user_from_token():
    """Return the authenticated Firebase user decoded from the Bearer ID token."""
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None, (jsonify({
            "success": False,
            "message": "Authentication required."
        }), 401)

    token = header.split(" ", 1)[1].strip()

    if not token:
        return None, (jsonify({
            "success": False,
            "message": "Authentication required."
        }), 401)

    try:
        decoded = auth.verify_id_token(token)
    except Exception:
        return None, (jsonify({
            "success": False,
            "message": "Invalid or expired login session."
        }), 401)

    uid = str(decoded.get("uid") or "").strip()
    if not uid:
        return None, (jsonify({
            "success": False,
            "message": "Invalid user session."
        }), 401)

    return decoded, None


@app.post("/api/account/deactivate")
def deactivate_account():
    """Soft-delete the currently signed-in user without removing Firestore data."""
    try:
        decoded, error_response = require_user_from_token()
        if error_response is not None:
            return error_response

        uid = decoded["uid"]
        user_ref = db.collection("users").document(uid)
        user_snap = user_ref.get()

        if not user_snap.exists:
            return jsonify({
                "success": False,
                "message": "Account profile was not found."
            }), 404

        current = user_snap.to_dict() or {}
        current_status = str(current.get("status") or "active").strip().lower()

        if current_status in {"deleted", "deactivated", "archived"}:
            return jsonify({
                "success": True,
                "status": "deleted",
                "message": "Account is already deactivated."
            }), 200

        # Disable Firebase Authentication so the account cannot sign in while
        # keeping Firestore data available for later recovery.
        auth.update_user(uid, disabled=True)

        user_ref.set({
            "status": "deleted",
            "isDeleted": True,
            "deletedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)

        return jsonify({
            "success": True,
            "status": "deleted",
            "message": "Your account has been deactivated. You can recover it through the administrator restore flow."
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to deactivate the account.",
            "error": str(e),
        }), 500


@app.get("/api/account/status")
def account_status():
    """Return the soft-delete state of the currently signed-in user."""
    try:
        decoded, error_response = require_user_from_token()
        if error_response is not None:
            return error_response

        uid = decoded["uid"]
        snap = db.collection("users").document(uid).get()

        if not snap.exists:
            return jsonify({
                "success": False,
                "message": "Account profile was not found."
            }), 404

        data = snap.to_dict() or {}
        status = str(data.get("status") or "active").strip().lower()

        if status in {"deleted", "deactivated", "archived"} or bool(data.get("isDeleted")):
            status = "deleted"
        elif status not in {"active", "blocked"}:
            status = "active"

        return jsonify({
            "success": True,
            "uid": uid,
            "status": status,
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to read account status.",
            "error": str(e),
        }), 500


# ---------------- USER ACCOUNT ----------------

@app.post("/api/account/delete")
def delete_own_account():
    """Permanently remove the signed-in user's Firebase Auth account and profile document.

    Existing SOS/complaint records are intentionally kept for application history/audit,
    while the authentication account and personal profile document are removed.
    The same email/phone can then be registered again as a brand-new account.
    """
    try:
        header = request.headers.get("Authorization", "")

        if not header.startswith("Bearer "):
            return jsonify({
                "success": False,
                "message": "Authentication required.",
            }), 401

        token = header.split(" ", 1)[1].strip()

        if not token:
            return jsonify({
                "success": False,
                "message": "Authentication required.",
            }), 401

        decoded = auth.verify_id_token(token)
        uid = str(decoded.get("uid") or "").strip()

        if not uid:
            return jsonify({
                "success": False,
                "message": "Invalid user session.",
            }), 401

        # Delete the Firebase Authentication account first.
        auth.delete_user(uid)

        # Remove the user's personal profile document so a new registration
        # starts cleanly with the same email/phone if desired.
        db.collection("users").document(uid).delete()

        return jsonify({
            "success": True,
            "message": "Account deleted permanently. You can register again as a new user.",
            "accountDeleted": True,
        }), 200

    except auth.UserNotFoundError:
        # Already deleted from Firebase Auth; clean up the Firestore profile too.
        try:
            if 'uid' in locals() and uid:
                db.collection("users").document(uid).delete()
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "Account is already deleted. You can register again as a new user.",
            "accountDeleted": True,
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to delete your account.",
            "error": str(e),
        }), 500


# ---------------- USER SOS / NEAREST POLICE ----------------

def verify_user_token_optional():
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None

    token = header.split(" ", 1)[1].strip()

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

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )

    return 2 * r * asin(sqrt(a))


@app.post("/api/sos")
def create_sos_alert():
    try:
        data = request.get_json(silent=True) or {}
        decoded = verify_user_token_optional()

        uid = (
            (decoded or {}).get("uid")
            or str(data.get("uid") or "").strip()
            or None
        )

        user_data = {}

        if uid:
            snap = db.collection("users").document(uid).get()

            if snap.exists:
                user_data = snap.to_dict() or {}

        full_name = str(
            data.get("fullName")
            or user_data.get("fullName")
            or "Unknown User"
        ).strip()

        phone = str(
            data.get("phone")
            or user_data.get("phone")
            or ""
        ).strip()

        email = str(
            data.get("email")
            or user_data.get("email")
            or ""
        ).strip().lower()

        ref = db.collection("sosAlerts").document()

        ref.set(
            {
                "uid": uid,
                "fullName": full_name,
                "phone": phone,
                "email": email,
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "accuracy": data.get("accuracy"),
                "locationText": data.get("locationText"),
                "address": data.get("address") or data.get("locationText") or "",
                "policeStation": data.get("policeStation") or "",
                "policeAddress": data.get("policeAddress") or "",
                "policeDistanceKm": data.get("policeDistanceKm"),
                "status": "pending",
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )

        return jsonify(
            {
                "success": True,
                "id": ref.id,
                "status": "pending",
            }
        ), 201

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to create SOS alert.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/sos/<doc_id>/location")
def update_sos_location(doc_id):
    try:
        data = request.get_json(silent=True) or {}

        lat = data.get("latitude")
        lon = data.get("longitude")

        if lat is None or lon is None:
            return jsonify(
                {
                    "success": False,
                    "message": "Latitude and longitude are required.",
                }
            ), 400

        payload = {
            "latitude": float(lat),
            "longitude": float(lon),
            "accuracy": data.get("accuracy"),
            "locationText": "Live GPS location",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        for key in (
            "policeStation",
            "policeAddress",
            "policeDistanceKm",
        ):
            if key in data:
                payload[key] = data.get(key)

        db.collection("sosAlerts").document(doc_id).set(
            payload,
            merge=True,
        )

        return jsonify({"success": True})

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to update SOS location.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/sos/<doc_id>/resolve")
def resolve_user_sos(doc_id):
    try:
        db.collection("sosAlerts").document(doc_id).set(
            {
                "status": "resolved",
                "resolvedAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        return jsonify(
            {
                "success": True,
                "status": "resolved",
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to resolve SOS alert.",
                "error": str(e),
            }
        ), 500


@app.get("/api/police/nearest")
def nearest_police():
    """Find the nearest mapped police station using free public OSM/Overpass services."""
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify(
            {
                "success": False,
                "message": "Valid latitude and longitude are required.",
            }
        ), 400

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify(
            {
                "success": False,
                "message": "Latitude or longitude is out of range.",
            }
        ), 400

    # Search two common OSM police tags within 10 km.
    query = (
        f'[out:json][timeout:6];'
        f'('
        f'nwr["amenity"="police"](around:10000,{lat},{lon});'
        f'nwr["police"](around:10000,{lat},{lon});'
        f');'
        f'out center tags;'
    )

    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ]

    def make_candidate(item):
        center = item.get("center") or {}
        p_lat = item.get("lat", center.get("lat"))
        p_lon = item.get("lon", center.get("lon"))

        if p_lat is None or p_lon is None:
            return None

        try:
            p_lat = float(p_lat)
            p_lon = float(p_lon)
        except (TypeError, ValueError):
            return None

        distance = haversine_km(lat, lon, p_lat, p_lon)
        tags = item.get("tags") or {}

        name = (
            tags.get("name")
            or tags.get("name:en")
            or tags.get("official_name")
            or "Police Station"
        )

        address_parts = [
            tags.get(key)
            for key in (
                "addr:housenumber",
                "addr:street",
                "addr:suburb",
                "addr:city",
                "addr:district",
            )
            if tags.get(key)
        ]

        return {
            "name": name,
            "address": ", ".join(address_parts) or "Nearby police station",
            "latitude": p_lat,
            "longitude": p_lon,
            "distanceKm": round(distance, 2),
            "mapsUrl": (
                "https://www.google.com/maps/search/"
                f"?api=1&query={p_lat},{p_lon}"
            ),
        }

    def query_overpass(endpoint):
        response = requests.post(
            endpoint,
            data=query,
            headers={
                "User-Agent": "WSApp/1.0 (+https://github.com/tamilanbu0475-lang/WSApp)",
                "Accept": "application/json",
            },
            timeout=7,
        )
        response.raise_for_status()
        body = response.json()
        return body.get("elements", []) if isinstance(body, dict) else []

    best = None

    # Query two public endpoints in parallel so one slow server does not block
    # the other one from starting.
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(query_overpass, endpoint): endpoint
                for endpoint in endpoints
            }

            for future in as_completed(futures):
                try:
                    elements = future.result()
                except Exception:
                    continue

                for item in elements:
                    candidate = make_candidate(item)
                    if candidate is None:
                        continue

                    if best is None or candidate["distanceKm"] < best["distanceKm"]:
                        best = candidate

    except Exception:
        best = None

    # Third public endpoint as a fallback if the first two fail.
    if best is None:
        fallback_endpoint = (
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
        )

        try:
            elements = query_overpass(fallback_endpoint)

            for item in elements:
                candidate = make_candidate(item)
                if candidate is None:
                    continue

                if best is None or candidate["distanceKm"] < best["distanceKm"]:
                    best = candidate
        except Exception:
            pass

    if best is not None:
        return jsonify(
            {
                "success": True,
                "police": best,
            }
        ), 200

    # Keep the SOS screen usable even when the public map directory is
    # temporarily unavailable. The frontend can open this Google Maps search.
    return jsonify(
        {
            "success": False,
            "message": "No nearby police station found right now.",
            "mapsSearchUrl": (
                "https://www.google.com/maps/search/"
                f"?api=1&query=police+station+near+{lat},{lon}"
            ),
        }
    ), 404


# ---------------- ADMIN DATA ----------------

@app.get("/api/admin/users")
def admin_users():
    """Load admin user list from Firestore efficiently.

    Firestore is the source of truth for the admin-visible status. We avoid
    calling Firebase Authentication once per user because that N+1 lookup
    pattern makes the Users page slower as the user count grows.
    """
    try:
        rows = []

        for doc in db.collection("users").stream():
            d = serialize(doc.to_dict() or {})

            stored_status = str(
                d.get("status") or "active"
            ).strip().lower()

            if (
                bool(d.get("isDeleted"))
                or stored_status in {
                    "deleted",
                    "deactivated",
                    "archived",
                }
            ):
                display_status = "deleted"
            elif stored_status == "blocked":
                display_status = "blocked"
            else:
                display_status = "active"

            rows.append(
                {
                    "uid": d.get("uid", doc.id),
                    "fullName": d.get("fullName", ""),
                    "phone": d.get("phone", ""),
                    "email": d.get("email", ""),
                    "createdAt": d.get("createdAt"),
                    "status": display_status,
                }
            )

        rows.sort(
            key=lambda x: str(x.get("createdAt") or ""),
            reverse=True,
        )

        return jsonify(
            {
                "success": True,
                "count": len(rows),
                "users": rows,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load users.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/admin/users/<uid>/status")
def admin_user_status(uid):
    try:
        data = request.get_json(silent=True) or {}

        requested_status = str(data.get("status") or "").strip().lower()

        if requested_status:
            if requested_status not in {"active", "blocked", "deleted"}:
                return jsonify({
                    "success": False,
                    "message": "Status must be active, blocked, or deleted.",
                }), 400
            status = requested_status
        else:
            blocked = bool(data.get("blocked"))
            status = "blocked" if blocked else "active"

        disabled = status in {"blocked", "deleted"}
        auth.update_user(uid, disabled=disabled)

        payload = {
            "status": status,
            "isDeleted": status == "deleted",
            "statusUpdatedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        if status == "deleted":
            payload["deletedAt"] = firestore.SERVER_TIMESTAMP
        else:
            payload["deletedAt"] = firestore.DELETE_FIELD

        db.collection("users").document(uid).set(
            payload,
            merge=True,
        )

        return jsonify({
            "success": True,
            "status": status,
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to update user status.",
            "error": str(e),
        }), 500


@app.post("/api/admin/users/<uid>/restore")
def admin_restore_user(uid):
    """Restore a soft-deleted user without creating a new Firebase account."""
    try:
        user_ref = db.collection("users").document(uid)
        snap = user_ref.get()

        if not snap.exists:
            return jsonify({
                "success": False,
                "message": "User profile was not found.",
            }), 404

        auth.update_user(uid, disabled=False)

        user_ref.set({
            "status": "active",
            "isDeleted": False,
            "restoredAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "deletedAt": firestore.DELETE_FIELD,
        }, merge=True)

        return jsonify({
            "success": True,
            "status": "active",
            "message": "User account restored successfully.",
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to restore user account.",
            "error": str(e),
        }), 500


def status_counts(rows):
    counts = {}

    for x in rows:
        k = (
            str(x.get("status") or "pending")
            .lower()
            .replace("-", "_")
            .replace(" ", "_")
        )

        counts[k] = counts.get(k, 0) + 1

    return counts


@app.get("/api/admin/sos")
def admin_sos():
    try:
        rows = collection_records("sosAlerts")

        pending = sum(
            str(x.get("status", "pending")).lower()
            in {"pending", "active", "critical", "open"}
            for x in rows
        )

        today = now_utc().date()

        resolved_today = sum(
            str(x.get("status", "")).lower() == "resolved"
            and str(
                x.get("resolvedAt")
                or x.get("updatedAt")
                or ""
            ).startswith(today.isoformat())
            for x in rows
        )

        month_prefix = today.strftime("%Y-%m")

        month_total = sum(
            str(x.get("createdAt") or "").startswith(month_prefix)
            for x in rows
        )

        return jsonify(
            {
                "success": True,
                "alerts": rows,
                "pending": pending,
                "resolvedToday": resolved_today,
                "monthTotal": month_total,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load SOS alerts.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/admin/sos/<doc_id>/status")
def admin_sos_status(doc_id):
    try:
        data = request.get_json(silent=True) or {}

        status = str(
            data.get("status", "")
        ).strip().lower()

        if status not in {
            "pending",
            "active",
            "resolved",
            "cancelled",
        }:
            return jsonify(
                {
                    "success": False,
                    "message": "Invalid SOS status.",
                }
            ), 400

        payload = {
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        if status == "resolved":
            payload["resolvedAt"] = firestore.SERVER_TIMESTAMP

        db.collection("sosAlerts").document(doc_id).set(
            payload,
            merge=True,
        )

        return jsonify(
            {
                "success": True,
                "status": status,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to update SOS alert.",
                "error": str(e),
            }
        ), 500


# ---------------- USER COMPLAINTS ----------------

@app.post("/api/complaints")
def create_complaint():
    try:
        decoded, error_response = require_user_from_token()
        if error_response is not None:
            return error_response

        data = request.get_json(silent=True) or {}
        category = str(data.get("category", "")).strip()
        description = str(data.get("description", "")).strip()
        location = str(data.get("location", "")).strip()

        allowed_categories = {
            "Harassment",
            "Stalking",
            "Abuse",
            "Threat",
            "Cyber Crime",
            "Other",
        }

        if category not in allowed_categories:
            return jsonify({"success": False, "message": "Select a valid complaint category."}), 400

        if len(description) < 10:
            return jsonify({"success": False, "message": "Please describe the incident in more detail."}), 400

        uid = str(decoded.get("uid") or "").strip()
        email = str(decoded.get("email") or "").strip().lower()

        if not email:
            try:
                user_record = auth.get_user(uid)
                email = str(user_record.email or "").strip().lower()
            except Exception:
                email = ""

        doc_ref = db.collection("complaints").document()
        doc_ref.set(
            {
                "uid": uid,
                "userEmail": email,
                "category": category,
                "description": description,
                "location": location,
                "status": "pending",
                "adminResponse": "",
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )

        return jsonify({
            "success": True,
            "message": "Complaint submitted successfully.",
            "id": doc_ref.id,
            "status": "pending",
        }), 201

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to submit complaint.",
            "error": str(e),
        }), 500


@app.get("/api/complaints")
def user_complaints():
    try:
        decoded, error_response = require_user_from_token()
        if error_response is not None:
            return error_response

        uid = str(decoded.get("uid") or "").strip()
        rows = []
        for doc in db.collection("complaints").where("uid", "==", uid).stream():
            item = serialize(doc.to_dict() or {})
            item["id"] = doc.id
            # Never expose the internal email/uid back to the app UI.
            item.pop("uid", None)
            item.pop("userEmail", None)
            rows.append(item)

        rows.sort(
            key=lambda x: str(x.get("createdAt") or x.get("updatedAt") or ""),
            reverse=True,
        )

        return jsonify({"success": True, "complaints": rows, "total": len(rows)})

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to load your complaints.",
            "error": str(e),
        }), 500


# Anonymous complaint endpoints: no login token required.
# A random client key stored on the same device/browser is used only to
# retrieve that user's own complaint history and admin responses.
@app.post("/api/complaints/public")
def create_public_complaint():
    try:
        data = request.get_json(silent=True) or {}
        client_key = str(data.get("clientKey", "")).strip()
        category = str(data.get("category", "")).strip()
        description = str(data.get("description", "")).strip()
        location = str(data.get("location", "")).strip()

        allowed_categories = {
            "Harassment",
            "Stalking",
            "Abuse",
            "Threat",
            "Cyber Crime",
            "Other",
        }

        if len(client_key) < 20:
            return jsonify({"success": False, "message": "Invalid report session."}), 400
        if category not in allowed_categories:
            return jsonify({"success": False, "message": "Select a valid complaint category."}), 400
        if len(description) < 10:
            return jsonify({"success": False, "message": "Please describe the incident in more detail."}), 400

        doc_ref = db.collection("complaints").document()
        doc_ref.set({
            "clientKey": client_key,
            "category": category,
            "description": description,
            "location": location,
            "status": "pending",
            "adminResponse": "",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })

        return jsonify({
            "success": True,
            "message": "Complaint submitted successfully.",
            "id": doc_ref.id,
            "status": "pending",
        }), 201

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to submit complaint.",
            "error": str(e),
        }), 500


@app.get("/api/complaints/public")
def public_complaints():
    try:
        client_key = str(request.args.get("clientKey", "")).strip()
        if len(client_key) < 20:
            return jsonify({"success": False, "message": "Invalid report session."}), 400

        rows = []
        for doc in db.collection("complaints").where("clientKey", "==", client_key).stream():
            item = serialize(doc.to_dict() or {})
            item["id"] = doc.id
            item.pop("clientKey", None)
            rows.append(item)

        rows.sort(
            key=lambda x: str(x.get("createdAt") or x.get("updatedAt") or ""),
            reverse=True,
        )
        return jsonify({"success": True, "complaints": rows, "total": len(rows)})

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to load your complaints.",
            "error": str(e),
        }), 500


@app.get("/api/admin/complaints")
def admin_complaints():
    try:
        rows = collection_records("complaints")
        counts = status_counts(rows)

        resolved = counts.get("resolved", 0)

        pending = (
            counts.get("pending", 0)
            + counts.get("new", 0)
            + counts.get("open", 0)
        )

        return jsonify(
            {
                "success": True,
                "complaints": rows,
                "total": len(rows),
                "resolved": resolved,
                "pending": pending,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load complaints.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/admin/complaints/<doc_id>/status")
def admin_complaint_status(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        status = str(data.get("status", "")).strip().lower()
        admin_response = str(data.get("adminResponse", "")).strip()

        if status not in {
            "pending",
            "under_review",
            "resolved",
            "rejected",
        }:
            return jsonify({
                "success": False,
                "message": "Invalid complaint status.",
            }), 400

        if status == "resolved" and len(admin_response) < 3:
            return jsonify({
                "success": False,
                "message": "Please enter the response sent to the user before resolving.",
            }), 400

        complaint_ref = db.collection("complaints").document(doc_id)
        snap = complaint_ref.get()
        if not snap.exists:
            return jsonify({"success": False, "message": "Complaint not found."}), 404

        existing = snap.to_dict() or {}
        payload = {
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }

        if admin_response:
            payload["adminResponse"] = admin_response
            payload["responseAt"] = firestore.SERVER_TIMESTAMP

        if status == "resolved":
            payload["resolvedAt"] = firestore.SERVER_TIMESTAMP

        complaint_ref.set(payload, merge=True)

        email_sent = False
        user_email = str(existing.get("userEmail") or "").strip().lower()
        if status == "resolved" and user_email and admin_response:
            email_sent = send_brevo_email(
                user_email,
                "WS App User",
                "WS App — Complaint Resolved",
                (
                    "Your WS App complaint has been marked as resolved.\n\n"
                    f"Category: {existing.get('category', '')}\n"
                    f"Admin Response: {admin_response}\n\n"
                    "Please open WS App to view the latest complaint status.\n\n"
                    "WS App Team"
                ),
            )

        return jsonify({
            "success": True,
            "status": status,
            "adminResponse": admin_response,
            "emailSent": email_sent,
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Unable to update complaint.",
            "error": str(e),
        }), 500


@app.get("/api/admin/chat")
def admin_chat():
    try:
        rows = collection_records("chatSessions")

        today_prefix = now_utc().date().isoformat()

        today = sum(
            str(x.get("createdAt") or "").startswith(today_prefix)
            for x in rows
        )

        return jsonify(
            {
                "success": True,
                "sessions": rows,
                "total": len(rows),
                "today": today,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load chat sessions.",
                "error": str(e),
            }
        ), 500


@app.get("/api/admin/announcements")
def admin_announcements():
    try:
        return jsonify(
            {
                "success": True,
                "announcements": collection_records("announcements"),
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load announcements.",
                "error": str(e),
            }
        ), 500


@app.post("/api/admin/announcements")
def create_announcement():
    try:
        data = request.get_json(silent=True) or {}

        title = str(data.get("title", "")).strip()
        description = str(data.get("description", "")).strip()

        if not title or not description:
            return jsonify(
                {
                    "success": False,
                    "message": "Title and description are required.",
                }
            ), 400

        ref = db.collection("announcements").document()

        ref.set(
            {
                "title": title,
                "description": description,
                "icon": str(data.get("icon", "📢")),
                "date": data.get("date") or "",
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "active": True,
            }
        )

        return jsonify(
            {
                "success": True,
                "id": ref.id,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to create announcement.",
                "error": str(e),
            }
        ), 500


@app.delete("/api/admin/announcements/<doc_id>")
def delete_announcement(doc_id):
    try:
        db.collection("announcements").document(doc_id).delete()
        return jsonify({"success": True})

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to delete announcement.",
                "error": str(e),
            }
        ), 500


@app.get("/api/admin/helplines")
def admin_helplines():
    try:
        rows = collection_records("helplines")

        rows.sort(
            key=lambda x: (
                not bool(x.get("active", True)),
                str(x.get("name", "")).lower(),
            )
        )

        return jsonify(
            {
                "success": True,
                "helplines": rows,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load helplines.",
                "error": str(e),
            }
        ), 500


@app.post("/api/admin/helplines")
def create_helpline():
    try:
        data = request.get_json(silent=True) or {}

        name = str(data.get("name", "")).strip()
        number = str(data.get("number", "")).strip()

        if not name or not number:
            return jsonify(
                {
                    "success": False,
                    "message": "Name and number are required.",
                }
            ), 400

        ref = db.collection("helplines").document()

        ref.set(
            {
                "name": name,
                "number": number,
                "category": str(data.get("category", "Support")),
                "icon": str(data.get("icon", "📞")),
                "active": bool(data.get("active", True)),
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )

        return jsonify(
            {
                "success": True,
                "id": ref.id,
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to create helpline.",
                "error": str(e),
            }
        ), 500


@app.patch("/api/admin/helplines/<doc_id>")
def update_helpline(doc_id):
    try:
        data = request.get_json(silent=True) or {}

        allowed = {
            k: data[k]
            for k in (
                "name",
                "number",
                "category",
                "icon",
                "active",
            )
            if k in data
        }

        allowed["updatedAt"] = firestore.SERVER_TIMESTAMP

        db.collection("helplines").document(doc_id).set(
            allowed,
            merge=True,
        )

        return jsonify({"success": True})

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to update helpline.",
                "error": str(e),
            }
        ), 500


@app.get("/api/admin/settings")
def admin_settings():
    try:
        settings = admin_settings_snapshot()

        settings.pop("adminPassword", None)
        settings.pop("password", None)

        return jsonify(
            {
                "success": True,
                "settings": serialize(settings),
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load settings.",
                "error": str(e),
            }
        ), 500


@app.put("/api/admin/settings")
def save_admin_settings():
    try:
        data = request.get_json(silent=True) or {}

        settings_ref = db.collection("settings").document("admin")
        settings = admin_settings_snapshot()
        admin_uid = settings.get("adminUid")

        if not admin_uid or request.admin_uid != admin_uid:
            return jsonify(
                {
                    "success": False,
                    "message": "Admin session is not authorized.",
                }
            ), 403

        new_admin_id = str(
            data.get(
                "adminId",
                settings.get("adminId", DEFAULT_ADMIN_ID),
            )
        ).strip()

        admin_name = str(
            data.get(
                "adminName",
                settings.get("adminName", "Admin"),
            )
        ).strip()

        phone = str(
            data.get(
                "phone",
                settings.get("phone", new_admin_id),
            )
        ).strip()

        new_email = str(
            data.get(
                "email",
                settings.get("email", DEFAULT_ADMIN_EMAIL),
            )
        ).strip().lower()

        app_version = str(
            data.get(
                "appVersion",
                settings.get("appVersion", "v1.0.0"),
            )
        ).strip()

        current_password = str(
            data.get("currentPassword", "")
        )

        new_password = str(
            data.get("newPassword", "")
        )

        confirm_password = str(
            data.get("confirmPassword", "")
        )

        old_admin_id = str(
            settings.get("adminId", DEFAULT_ADMIN_ID)
        ).strip()

        old_email = str(
            settings.get("email", DEFAULT_ADMIN_EMAIL)
        ).strip().lower()

        credential_change = (
            (new_admin_id != old_admin_id)
            or (new_email != old_email)
            or bool(new_password)
        )

        if credential_change:
            if not current_password:
                return jsonify(
                    {
                        "success": False,
                        "message": (
                            "Enter the current password to change login credentials."
                        ),
                    }
                ), 400

            if new_password and len(new_password) < 6:
                return jsonify(
                    {
                        "success": False,
                        "message": "New password must contain at least 6 characters.",
                    }
                ), 400

            if new_password and new_password != confirm_password:
                return jsonify(
                    {
                        "success": False,
                        "message": (
                            "New password and confirm password do not match."
                        ),
                    }
                ), 400

            code, result = firebase_password_signin(
                old_email,
                current_password,
            )

            if code != 200:
                return jsonify(
                    {
                        "success": False,
                        "message": "Current password is incorrect.",
                    }
                ), 401

        try:
            auth_update = {}

            if new_email != old_email:
                auth_update["email"] = new_email

            if new_password:
                auth_update["password"] = new_password

            if admin_name:
                auth_update["display_name"] = admin_name

            if auth_update:
                auth.update_user(
                    admin_uid,
                    **auth_update,
                )

        except Exception as e:
            msg = str(e)

            if "EMAIL_EXISTS" in msg or "already exists" in msg.lower():
                return jsonify(
                    {
                        "success": False,
                        "message": "That admin email is already in use.",
                    }
                ), 409

            raise

        settings_ref.set(
            {
                "adminUid": admin_uid,
                "adminId": new_admin_id,
                "adminName": admin_name or "Admin",
                "phone": phone,
                "email": new_email,
                "appVersion": app_version or "v1.0.0",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        return jsonify(
            {
                "success": True,
                "message": (
                    "Admin account updated successfully. "
                    "Please sign in again."
                ),
            }
        )

    except requests.RequestException:
        return jsonify(
            {
                "success": False,
                "message": "Unable to reach Firebase login service.",
            }
        ), 503

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to save admin settings.",
                "error": str(e),
            }
        ), 500


@app.get("/api/admin/dashboard")
def admin_dashboard():
    try:
        users = list(db.collection("users").stream())
        sos = collection_records("sosAlerts")
        complaints = collection_records("complaints")
        chats = collection_records("chatSessions")

        total_users = len(users)

        active_sos = sum(
            str(x.get("status", "pending")).lower()
            in {"pending", "active", "critical", "open"}
            for x in sos
        )

        ccounts = status_counts(complaints)

        resolved = ccounts.get("resolved", 0)

        pending = (
            ccounts.get("pending", 0)
            + ccounts.get("new", 0)
            + ccounts.get("open", 0)
        )

        days = []
        today = now_utc().date()

        for delta in range(6, -1, -1):
            day = today - timedelta(days=delta)
            prefix = day.isoformat()

            days.append(
                {
                    "label": day.strftime("%a"),
                    "count": sum(
                        str(x.get("createdAt") or "").startswith(prefix)
                        for x in sos
                    ),
                }
            )

        activity = []

        for x in collection_records("users")[:5]:
            activity.append(
                {
                    "type": "user",
                    "title": x.get("fullName") or "User",
                    "message": "registered an account",
                    "createdAt": x.get("createdAt"),
                }
            )

        for x in sos[:5]:
            activity.append(
                {
                    "type": "sos",
                    "title": x.get("fullName") or x.get("userName") or "User",
                    "message": "triggered an SOS alert",
                    "createdAt": x.get("createdAt"),
                }
            )

        for x in complaints[:5]:
            activity.append(
                {
                    "type": "complaint",
                    "title": x.get("fullName") or x.get("userName") or "User",
                    "message": "submitted a complaint",
                    "createdAt": x.get("createdAt"),
                }
            )

        for x in chats[:5]:
            activity.append(
                {
                    "type": "chat",
                    "title": x.get("fullName") or x.get("userName") or "User",
                    "message": "started a support chat session",
                    "createdAt": x.get("createdAt"),
                }
            )

        activity.sort(
            key=lambda x: str(x.get("createdAt") or ""),
            reverse=True,
        )

        return jsonify(
            {
                "success": True,
                "totalUsers": total_users,
                "activeSos": active_sos,
                "totalComplaints": len(complaints),
                "resolvedComplaints": resolved,
                "pendingComplaints": pending,
                "chatSessions": len(chats),
                "sosLast7Days": days,
                "recentActivity": activity[:8],
            }
        )

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to load dashboard.",
                "error": str(e),
            }
        ), 500


# ---------------- REAL SMS OTP (MSG91 Widget) ----------------

def normalize_phone(phone: str) -> str:
    """Return a phone number in E.164 format for India when no country code is supplied."""
    value = str(phone or "").strip()

    value = (
        value.replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )

    if value.startswith("00"):
        value = "+" + value[2:]
    elif value.startswith("+"):
        pass
    elif value.isdigit() and len(value) == 10:
        value = "+91" + value
    elif value.startswith("0") and value[1:].isdigit() and len(value) == 11:
        value = "+91" + value[1:]
    else:
        value = "+" + value

    return value


def msg91_configured() -> bool:
    """Check that the server-side MSG91 AuthKey is available."""
    return bool(os.getenv("MSG91_AUTHKEY"))


def extract_verified_identifier(payload):
    """Best-effort extraction of the identifier returned by MSG91 token verification."""
    if isinstance(payload, dict):
        for key in (
            "identifier",
            "mobile",
            "phone",
            "number",
            "email",
        ):
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

    return ""


def identifiers_match(expected_phone: str, verified_identifier: str) -> bool:
    """Compare phone identifiers after normalization; True when MSG91 exposes no identifier."""
    if not verified_identifier:
        return True

    expected = "".join(
        ch for ch in expected_phone if ch.isdigit()
    )

    actual = "".join(
        ch for ch in verified_identifier if ch.isdigit()
    )

    if len(actual) == 10:
        actual = "91" + actual

    if len(expected) == 10:
        expected = "91" + expected

    return expected == actual


@app.post("/api/otp/verify-access-token")
def verify_msg91_access_token():
    """
    Verify the JWT/access-token produced by the MSG91 OTP Widget.

    The MSG91 widget performs the actual OTP send/verify on the mobile client.
    The server then verifies the returned access-token using the account/server AuthKey.
    """
    try:
        data = request.get_json(silent=True) or {}

        access_token = str(
            data.get("accessToken")
            or data.get("access-token")
            or ""
        ).strip()

        phone = normalize_phone(data.get("phone"))
        uid = str(data.get("uid") or "").strip()

        if not access_token:
            return jsonify(
                {
                    "success": False,
                    "message": "MSG91 access token is required.",
                }
            ), 400

        if not phone or len(
            "".join(ch for ch in phone if ch.isdigit())
        ) < 10:
            return jsonify(
                {
                    "success": False,
                    "message": "Enter a valid phone number.",
                }
            ), 400

        if not msg91_configured():
            return jsonify(
                {
                    "success": False,
                    "message": (
                        "MSG91 is not configured. "
                        "Add MSG91_AUTHKEY to backend/.env."
                    ),
                }
            ), 503

        authkey = os.getenv("MSG91_AUTHKEY")

        response = requests.post(
            "https://control.msg91.com/api/v5/widget/verifyAccessToken",
            headers={
                "Content-Type": "application/json",
            },
            json={
                "authkey": authkey,
                "access-token": access_token,
            },
            timeout=20,
        )

        try:
            result = response.json()
        except Exception:
            result = {}

        if not response.ok:
            message = (
                result.get("message")
                or result.get("error")
                or "MSG91 access token verification failed."
            )

            return jsonify(
                {
                    "success": False,
                    "message": message,
                }
            ), response.status_code

        verified_identifier = extract_verified_identifier(result)

        if not identifiers_match(phone, verified_identifier):
            return jsonify(
                {
                    "success": False,
                    "message": (
                        "The verified phone number does not match "
                        "the registered phone number."
                    ),
                }
            ), 400

        if uid:
            db.collection("users").document(uid).set(
                {
                    "phoneVerified": True,
                    "phoneVerifiedAt": firestore.SERVER_TIMESTAMP,
                    "phone": phone,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )

        return jsonify(
            {
                "success": True,
                "verified": True,
                "phone": phone,
                "msg91": result,
            }
        ), 200

    except requests.RequestException:
        return jsonify(
            {
                "success": False,
                "message": "Unable to reach MSG91 verification service.",
            }
        ), 503

    except Exception as e:
        return jsonify(
            {
                "success": False,
                "message": "Unable to verify MSG91 OTP.",
                "error": str(e),
            }
        ), 500


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
    )
