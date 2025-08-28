import requests
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uuid
from datetime import datetime
from typing import List, Dict
import sqlite3
import hashlib
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
import os

app = FastAPI()

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DB_PATH = "appdata.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS games (
            trackId INTEGER PRIMARY KEY,
            name TEXT,
            title TEXT,
            description TEXT,
            images TEXT,
            rating REAL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_reviews (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            game_trackId INTEGER NOT NULL,
            overall_rating REAL NOT NULL,
            value_rating REAL NOT NULL,
            ad_rating REAL NOT NULL,
            effort_rating REAL NOT NULL,
            enjoyment_rating REAL NOT NULL,
            offer_amount REAL NOT NULL,
            comment TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY(game_trackId) REFERENCES games(trackId)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

@app.post("/erase_all")
def erase_all():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM games')
    cursor.execute('DELETE FROM user_reviews')
    cursor.execute('DELETE FROM users')
    conn.commit()
    conn.close()
    return {"status": "all records erased"}

init_db()

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.get("/search")
def search_apps(q: str = Query(..., min_length=1)) -> List[Dict]:
    url = f"https://itunes.apple.com/search?term={q}&entity=software"
    response = requests.get(url)
    results = response.json().get("results", [])
    apps = []
    for app in results:
        apps.append({
            "trackId": app.get("trackId"),
            "name": app.get("trackName"),
            "title": app.get("trackCensoredName", app.get("trackName")),
            "description": app.get("description"),
            "images": [app.get("artworkUrl100"), app.get("artworkUrl512"), app.get("artworkUrl60")],
            "rating": app.get("averageUserRating"),
        })
    return apps

class ReviewCreate(BaseModel):
    game_trackId: int
    name: str
    title: str
    description: str
    images: list[str]
    rating: float | None = None
    overall_rating: float
    value_rating: float
    ad_rating: float
    effort_rating: float
    enjoyment_rating: float
    offer_amount: float
    comment: str

@app.post("/reviews")
def create_review(review: ReviewCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Check if game exists
    cursor.execute('SELECT trackId FROM games WHERE trackId = ?', (review.game_trackId,))
    game = cursor.fetchone()
    if not game:
        cursor.execute('''
            INSERT INTO games (trackId, name, title, description, images, rating)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            review.game_trackId,
            review.name,
            review.title,
            review.description,
            ','.join(review.images),
            review.rating
        ))
    review_id = str(uuid.uuid4())
    user_id = "00000000-0000-0000-0000-000000000000"
    created_at = datetime.utcnow().isoformat()  # Fix: use utcnow()
    cursor.execute('''
        INSERT INTO user_reviews (
            id, user_id, game_trackId, overall_rating, value_rating, ad_rating, effort_rating, enjoyment_rating, offer_amount, comment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        review_id,
        user_id,
        review.game_trackId,
        review.overall_rating,
        review.value_rating,
        review.ad_rating,
        review.effort_rating,
        review.enjoyment_rating,
        review.offer_amount,
        review.comment,
        created_at,
        None
    ))
    conn.commit()
    conn.close()
    return {"id": review_id, "created_at": created_at}

@app.get("/reviews/{trackId}")
def get_reviews_for_game(trackId: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT overall_rating, value_rating, ad_rating, effort_rating, enjoyment_rating, offer_amount, comment, created_at
        FROM user_reviews WHERE game_trackId = ? ORDER BY created_at DESC
    ''', (trackId,))
    reviews = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return reviews

SECRET_KEY = os.environ.get("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_access_token(data: dict):
    from datetime import datetime, timedelta
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return username
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

@app.post("/register", response_model=Token)
def register(user: UserCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user.password)
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute('INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)', (user_id, user.username, hashed_pw, created_at))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    conn.close()
    access_token = create_access_token({"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT password FROM users WHERE username = ?', (form_data.username,))
    row = cursor.fetchone()
    conn.close()
    if not row or not verify_password(form_data.password, row[0]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token({"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/logout")
def logout():
    # For stateless JWT, logout is handled on the client by deleting the token
    return {"message": "Logged out. Please delete your token on the client."}
