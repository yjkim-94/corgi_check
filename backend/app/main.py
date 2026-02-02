from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, status, history, members, admin

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Corgi Check API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(status.router, prefix="/api/status", tags=["status"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(members.router, prefix="/api/members", tags=["members"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/")
def root():
    return {"message": "Corgi Check API"}
