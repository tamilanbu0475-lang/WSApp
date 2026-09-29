import re

from firebase_admin import auth, firestore


def create_user(
    email: str,
    password: str,
    full_name: str,
    phone: str
):
    email = email.strip().lower()
    full_name = full_name.strip()
    phone = phone.strip()

    if not email or not password or not full_name or not phone:
        raise ValueError("All fields are required.")

    if len(password) < 6:
        raise ValueError(
            "Password must contain at least 6 characters."
        )

    if not re.match(
        r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        email
    ):
        raise ValueError("Invalid email address.")

    # Create the authentication user in Firebase
    user = auth.create_user(
        email=email,
        password=password,
        display_name=full_name
    )

    # Save additional profile information in Firestore
    db = firestore.client()

    db.collection("users").document(user.uid).set({
        "uid": user.uid,
        "email": email,
        "fullName": full_name,
        "phone": phone,
        "createdAt": firestore.SERVER_TIMESTAMP
    })

    return user


def get_user(uid: str):
    return auth.get_user(uid)