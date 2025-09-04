from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware

# Import email notification helpers
from email_utils import send_customer_confirmation, send_admin_notification, send_feedback_email
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
import logging
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from enum import Enum
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI(title="Sørgulen Industriservice API", version="2.0.0")

# CORS configuration
# Allow requests from specified origins. If ALLOWED_ORIGINS environment variable is set
# (comma-separated list), use those; otherwise allow all origins.
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(',') if origin.strip()]
else:
    allowed_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Enums
class OrderStatus(str, Enum):
    PENDING_APPROVAL = "venter-godkjenning"
    WAITING_INSPECTION = "venter-synfaring" 
    WAITING_EXECUTION = "venter-utføring"
    COMPLETED = "utført"
    PAID = "ferdig-betalt"
    FINISHED = "ferdig"
    CANCELLED = "kansellert"

class ServiceType(str, Enum):
    SNOW_PLOWING = "Brøyting"
    LAWN_MOWING = "Plenklipping"
    TREE_FELLING = "Trefelling"
    ROOF_WASHING = "Takvask"
    MISC_WORK = "Diverse arbeid"

class Priority(str, Enum):
    LOW = "lav"
    NORMAL = "normal"
    HIGH = "høy"
    URGENT = "urgent"

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: Optional[EmailStr] = None
    hashed_password: str
    is_admin: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    password: str
    is_admin: bool = False

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    navn: str
    adresse: str
    telefon: Optional[str] = None
    epost: Optional[EmailStr] = None
    tjeneste: ServiceType
    dato: str
    tid: Optional[str] = None
    tilleggsinfo: Optional[str] = None
    status: OrderStatus = OrderStatus.PENDING_APPROVAL
    pris: Optional[float] = None
    tidsbruk: Optional[str] = None
    kommentar: Optional[str] = None
    priority: Priority = Priority.NORMAL
    estimated_price: Optional[float] = None
    actual_price: Optional[float] = None
    customer_rating: Optional[int] = None
    customer_feedback: Optional[str] = None
    assigned_worker: Optional[str] = None
    completion_photos: Optional[List[str]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class OrderCreate(BaseModel):
    navn: str
    adresse: str
    telefon: Optional[str] = None
    epost: Optional[EmailStr] = None
    tjeneste: ServiceType
    dato: str
    tid: Optional[str] = None
    tilleggsinfo: Optional[str] = None
    priority: Priority = Priority.NORMAL

class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    pris: Optional[float] = None
    tidsbruk: Optional[str] = None
    kommentar: Optional[str] = None
    priority: Optional[Priority] = None
    estimated_price: Optional[float] = None
    actual_price: Optional[float] = None
    assigned_worker: Optional[str] = None
    completion_photos: Optional[List[str]] = None

class DashboardStats(BaseModel):
    total_orders: int
    pending_orders: int
    completed_orders: int
    revenue_this_month: float
    orders_by_service: Dict[str, int]
    orders_by_status: Dict[str, int]
    monthly_revenue: List[Dict[str, Any]]

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    order_id: Optional[str] = None

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    message: str
    type: str = "info"  # info, success, warning, error
    order_id: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Feedback model used by the /feedback endpoint
class Feedback(BaseModel):
    """Model for website feedback submissions.

    Attributes
    ----------
    name : Optional[str]
        Name of the person providing feedback. Can be omitted for anonymous feedback.
    rating : Optional[int]
        Rating from 1 to 5 reflecting the visitor's experience. Optional.
    message : str
        The free‑text feedback message. Required.
    anonymous : bool
        Whether the visitor requested to stay anonymous. Defaults to False.
    """
    name: Optional[str] = None
    rating: Optional[int] = None
    message: str
    anonymous: bool = False

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"username": username})
    if user is None:
        raise credentials_exception
    return User(**user)

async def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

# Initialize admin user
async def init_admin_user():
    admin_user = await db.users.find_one({"username": "havsor10"})
    if not admin_user:
        hashed_password = get_password_hash("Lussi100898")
        admin_data = {
            "id": str(uuid.uuid4()),
            "username": "havsor10",
            "email": "sor.industri@gmail.com",
            "hashed_password": hashed_password,
            "is_admin": True,
            "created_at": datetime.utcnow()
        }
        await db.users.insert_one(admin_data)
        logger.info("Admin user created successfully")

# Authentication routes
@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin):
    user = await db.users.find_one({"username": user_credentials.username})
    if not user or not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_admin_user)):
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user_data.password)
    user_dict = user_data.dict()
    user_dict["hashed_password"] = hashed_password
    del user_dict["password"]
    
    user = User(**user_dict)
    await db.users.insert_one(user.dict())
    return user

# Order routes
@api_router.post("/bestillinger", response_model=Order)
async def create_order(order_data: OrderCreate, background_tasks: BackgroundTasks):
    order = Order(**order_data.dict())
    
    # Calculate estimated price based on service type
    if order.tjeneste == ServiceType.SNOW_PLOWING:
        order.estimated_price = 350.0
    elif order.tjeneste == ServiceType.LAWN_MOWING:
        order.estimated_price = 500.0
    elif order.tjeneste == ServiceType.TREE_FELLING:
        order.estimated_price = 600.0
    elif order.tjeneste == ServiceType.ROOF_WASHING:
        order.estimated_price = 1500.0
    else:
        order.estimated_price = 400.0
    
    await db.orders.insert_one(order.dict())
    
    # Create notification for new order
    notification = Notification(
        title="Ny bestilling mottatt",
        message=f"Ny bestilling fra {order.navn} for {order.tjeneste.value}",
        type="info",
        order_id=order.id
    )
    await db.notifications.insert_one(notification.dict())

    # Send email notifications in the background
    # We use FastAPI's BackgroundTasks to avoid blocking the response
    background_tasks.add_task(send_customer_confirmation, order)
    background_tasks.add_task(send_admin_notification, order)

    logger.info(f"New order created and email notifications dispatched: {order.id}")
    return order

@api_router.get("/bestillinger", response_model=List[Order])
async def get_orders(
    status: Optional[OrderStatus] = None,
    service: Optional[ServiceType] = None,
    skip: int = 0,
    limit: int = 100
):
    query = {}
    if status:
        query["status"] = status
    if service:
        query["tjeneste"] = service
    
    orders = await db.orders.find(query).skip(skip).limit(limit).sort("created_at", -1).to_list(limit)
    return [Order(**order) for order in orders]

@api_router.get("/bestillinger/{order_id}", response_model=Order)
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return Order(**order)

@api_router.put("/bestillinger/{order_id}", response_model=Order)
async def update_order(order_id: str, order_update: OrderUpdate, current_user: User = Depends(get_current_admin_user)):
    existing_order = await db.orders.find_one({"id": order_id})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_data = order_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Create notification for status change
    if "status" in update_data:
        notification = Notification(
            title="Bestilling oppdatert",
            message=f"Bestilling {order_id} endret til {update_data['status']}",
            type="info",
            order_id=order_id
        )
        await db.notifications.insert_one(notification.dict())
    
    updated_order = await db.orders.find_one({"id": order_id})
    return Order(**updated_order)

@api_router.delete("/bestillinger/{order_id}")
async def delete_order(order_id: str, current_user: User = Depends(get_current_admin_user)):
    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Order deleted successfully"}

# Analytics and Dashboard routes
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_admin_user)):
    # Get basic counts
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": OrderStatus.PENDING_APPROVAL})
    completed_orders = await db.orders.count_documents({"status": OrderStatus.COMPLETED})
    
    # Calculate revenue this month
    start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_pipeline = [
        {"$match": {"created_at": {"$gte": start_of_month}, "actual_price": {"$exists": True}}},
        {"$group": {"_id": None, "total": {"$sum": "$actual_price"}}}
    ]
    revenue_result = await db.orders.aggregate(revenue_pipeline).to_list(1)
    revenue_this_month = revenue_result[0]["total"] if revenue_result else 0.0
    
    # Orders by service type
    service_pipeline = [
        {"$group": {"_id": "$tjeneste", "count": {"$sum": 1}}}
    ]
    service_result = await db.orders.aggregate(service_pipeline).to_list(10)
    orders_by_service = {item["_id"]: item["count"] for item in service_result}
    
    # Orders by status
    status_pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_result = await db.orders.aggregate(status_pipeline).to_list(10)
    orders_by_status = {item["_id"]: item["count"] for item in status_result}
    
    # Monthly revenue for the last 12 months
    monthly_revenue = []
    for i in range(12):
        month_start = (datetime.utcnow().replace(day=1) - timedelta(days=30*i)).replace(hour=0, minute=0, second=0, microsecond=0)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        month_revenue_pipeline = [
            {"$match": {"created_at": {"$gte": month_start, "$lte": month_end}, "actual_price": {"$exists": True}}},
            {"$group": {"_id": None, "total": {"$sum": "$actual_price"}}}
        ]
        month_result = await db.orders.aggregate(month_revenue_pipeline).to_list(1)
        month_total = month_result[0]["total"] if month_result else 0.0
        
        monthly_revenue.append({
            "month": month_start.strftime("%Y-%m"),
            "revenue": month_total
        })
    
    return DashboardStats(
        total_orders=total_orders,
        pending_orders=pending_orders,
        completed_orders=completed_orders,
        revenue_this_month=revenue_this_month,
        orders_by_service=orders_by_service,
        orders_by_status=orders_by_status,
        monthly_revenue=list(reversed(monthly_revenue))
    )

# Notification routes
@api_router.get("/notifications", response_model=List[Notification])
async def get_notifications(
    current_user: User = Depends(get_current_admin_user),
    unread_only: bool = False,
    limit: int = 50
):
    query = {}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [Notification(**notification) for notification in notifications]

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_admin_user)
):
    await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}

@api_router.post("/notifications", response_model=Notification)
async def create_notification(
    notification_data: NotificationCreate,
    current_user: User = Depends(get_current_admin_user)
):
    notification = Notification(**notification_data.dict())
    await db.notifications.insert_one(notification.dict())
    return notification

# Customer portal routes
@api_router.get("/customer/orders/{phone_or_email}")
async def get_customer_orders(phone_or_email: str):
    """Get orders for a customer by phone or email"""
    query = {"$or": [{"telefon": phone_or_email}, {"epost": phone_or_email}]}
    orders = await db.orders.find(query).sort("created_at", -1).to_list(20)
    return [Order(**order) for order in orders]

@api_router.put("/customer/orders/{order_id}/rating")
async def rate_order(order_id: str, rating_data: dict):
    """Allow customers to rate completed orders"""
    rating = rating_data.get("rating")
    feedback = rating_data.get("feedback")
    
    if not rating or rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    update_data = {"customer_rating": rating, "updated_at": datetime.utcnow()}
    if feedback:
        update_data["customer_feedback"] = feedback
    
    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": "Rating submitted successfully"}

# Feedback submission route
@api_router.post("/feedback")
async def submit_feedback(feedback_data: Feedback, background_tasks: BackgroundTasks):
    """Endpoint for receiving website feedback.

    Receives feedback details from the frontend and dispatches an email to the
    administrator in the background. Returns a simple confirmation message.

    Parameters
    ----------
    feedback_data : Feedback
        The feedback payload parsed from the request body.
    background_tasks : BackgroundTasks
        FastAPI dependency used to schedule asynchronous tasks.
    """
    # Validate rating if provided
    if feedback_data.rating is not None:
        if feedback_data.rating < 1 or feedback_data.rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    # Prepare background email sending
    background_tasks.add_task(
        send_feedback_email,
        feedback_data.name or "",
        feedback_data.rating or 0,
        feedback_data.message,
        feedback_data.anonymous
    )
    return {"message": "Feedback mottatt"}

# Price calculation routes
@api_router.post("/calculate-price")
async def calculate_price(service: ServiceType, area: Optional[float] = None, urgency: Optional[str] = "standard"):
    """Calculate estimated price for a service"""
    base_prices = {
        ServiceType.SNOW_PLOWING: 350,
        ServiceType.LAWN_MOWING: 500,
        ServiceType.TREE_FELLING: 600,
        ServiceType.ROOF_WASHING: 1500,
        ServiceType.MISC_WORK: 400
    }
    
    base_price = base_prices.get(service, 400)
    
    if area:
        if service == ServiceType.SNOW_PLOWING and area > 40:
            base_price += (area - 40) * 2.5
        elif service == ServiceType.LAWN_MOWING and area > 80:
            base_price += (area - 80) * 1.2
    
    urgency_multipliers = {
        "standard": 1.0,
        "rask": 1.25,
        "ekspress": 1.5
    }
    
    multiplier = urgency_multipliers.get(urgency, 1.0)
    final_price = base_price * multiplier
    
    return {"estimated_price": round(final_price, 2)}

# Legacy compatibility route (for the old Node.js frontend)
@app.post("/bestillinger")
async def create_order_legacy_root(order_data: dict):
    """Legacy endpoint for backward compatibility at root level"""
    try:
        # Convert old format to new format
        order_create = OrderCreate(
            navn=order_data.get("navn", ""),
            adresse=order_data.get("adresse", ""),
            telefon=order_data.get("telefon"),
            epost=order_data.get("epost"),
            tjeneste=ServiceType(order_data.get("tjeneste", "Diverse arbeid")),
            dato=order_data.get("dato", ""),
            tid=order_data.get("tid"),
            tilleggsinfo=order_data.get("tilleggsinfo") or order_data.get("info")
        )
        return await create_order(order_create, BackgroundTasks())
    except Exception as e:
        logger.error(f"Error creating legacy order: {e}")
        raise HTTPException(status_code=400, detail="Invalid order data")

# Include the router in the main app
app.include_router(api_router)

# Mount static files for the Norwegian website
static_path = Path(__file__).parent.parent / "sorgulen.industri"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Serve the main website files
@app.get("/")
async def serve_index():
    """Serve the main Norwegian website"""
    index_path = static_path / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    raise HTTPException(status_code=404, detail="Website not found")

@app.get("/kundeportal.html")
async def serve_customer_portal():
    """Serve the customer portal page"""
    portal_path = static_path / "kundeportal.html"
    if portal_path.exists():
        return FileResponse(str(portal_path))
    raise HTTPException(status_code=404, detail="Customer portal not found")

@app.get("/{file_path:path}")
async def serve_static_files(file_path: str):
    """Serve static files from the sorgulen.industri directory"""
    # Skip API routes
    if file_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # Handle specific files
    file_full_path = static_path / file_path
    if file_full_path.exists() and file_full_path.is_file():
        return FileResponse(str(file_full_path))
    
    # If it's a directory, try to serve index.html
    if file_full_path.is_dir():
        index_file = file_full_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
    
    # If file not found, return 404
    raise HTTPException(status_code=404, detail="File not found")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    await init_admin_user()
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()